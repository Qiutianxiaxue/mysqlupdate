import { Sequelize, QueryTypes } from "sequelize";
import TableSchema from "@/models/TableSchema";
import DatabaseConnectionManager from "./DatabaseConnectionManager";
import baseSequelize from "@/config/baseDatabase";
import logger from "@/utils/logger";

interface ColumnInfo {
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  is_nullable: string;
  column_default: any;
  column_key: string;
  extra: string;
  column_comment: string;
}

interface IndexInfo {
  table_name: string;
  index_name: string;
  column_name: string;
  non_unique: number;
  seq_in_index: number;
}

interface TableSchemaChange {
  table_name: string;
  database_type: "main" | "log" | "order" | "static";
  partition_type: "store" | "time" | "none";
  time_interval?: "day" | "month" | "year";
  time_format?: string;
  current_version: string | null;
  new_version: string;
  schema_definition: string;
  changes_detected: string[];
  upgrade_notes: string;
}

export class SchemaDetectionService {
  private connectionManager: DatabaseConnectionManager;
  private baseConnection: Sequelize;

  constructor(baseConnection?: Sequelize) {
    this.connectionManager = new DatabaseConnectionManager();
    // 如果没有提供baseConnection，则使用独立的基准数据库连接
    this.baseConnection = baseConnection || baseSequelize;
  }

  /**
   * 检测指定表的结构变化
   */
  async detectTableChanges(
    tableName: string,
    databaseType: "main" | "log" | "order" | "static" = "main"
  ): Promise<TableSchemaChange | null> {
    try {
      logger.info(`🔍 开始检测表 ${tableName} 的结构变化 (${databaseType})`);

      // 获取基准数据库中的表结构信息
      const currentTableInfo = await this.getCurrentTableInfo(tableName);
      if (!currentTableInfo) {
        logger.warn(`表 ${tableName} 在基准数据库中不存在`);
        return null;
      }

      // 获取TableSchema中该表的最新版本
      const latestSchema = await this.getLatestTableSchema(
        tableName,
        databaseType
      );

      // 生成新的schema定义
      const newSchemaDefinition =
        this.generateSchemaDefinition(currentTableInfo);

      // 比较是否有变化
      const changes = this.compareSchemas(latestSchema, newSchemaDefinition);

      if (changes.length === 0) {
        logger.info(`表 ${tableName} 没有结构变化`);
        return null;
      }

      // 生成新版本号
      const newVersion = this.generateNewVersion(
        latestSchema?.schema_version || null
      );

      const result: TableSchemaChange = {
        table_name: tableName,
        database_type: databaseType,
        partition_type: latestSchema?.partition_type || "none",
        current_version: latestSchema?.schema_version || null,
        new_version: newVersion,
        schema_definition: JSON.stringify(newSchemaDefinition),
        changes_detected: changes,
        upgrade_notes: `自动检测到的结构变化: ${changes.join(", ")}`,
      };

      // 只在有值时添加可选字段
      if (latestSchema?.time_interval) {
        result.time_interval = latestSchema.time_interval;
      }
      if (latestSchema?.time_format) {
        result.time_format = latestSchema.time_format;
      }

      logger.info(`表 ${tableName} 检测到 ${changes.length} 个变化`);
      return result;
    } catch (error) {
      logger.error(`检测表 ${tableName} 结构变化失败:`, error);
      throw error;
    }
  }

  /**
   * 检测所有数据库类型的表结构变化
   */
  async detectAllTablesChanges(): Promise<{
    changes: TableSchemaChange[];
    newTables: string[];
    deletedTables: string[];
    summary: {
      total_checked: number;
      changes_detected: number;
      new_tables: number;
      deleted_tables: number;
      by_database_type: {
        [key: string]: {
          checked: number;
          changes: number;
          new_tables: number;
          deleted_tables: number;
        };
      };
    };
  }> {
    try {
      logger.info(`🔍 开始检测所有数据库类型的表结构变化`);

      // 获取基准数据库中的所有表
      const baseDbTables = await this.getAllTableNames();

      // 所有数据库类型
      const databaseTypes: ("main" | "log" | "order" | "static")[] = [
        "main",
        "log",
        "order",
        "static",
      ];

      // 获取所有类型的TableSchema定义
      const allSchemaDefinitions = await TableSchema.findAll({
        where: {
          is_active: true,
        },
        attributes: [
          "table_name",
          "schema_version",
          "database_type",
          "partition_type",
          "time_interval",
          "time_format",
        ],
      });

      const allResults: TableSchemaChange[] = [];
      const allNewTables: string[] = [];
      const allDeletedTables: string[] = [];
      const byDatabaseType: {
        [key: string]: {
          checked: number;
          changes: number;
          new_tables: number;
          deleted_tables: number;
        };
      } = {};

      // 按数据库类型检测
      for (const databaseType of databaseTypes) {
        logger.info(`检测 ${databaseType} 数据库类型...`);

        const typeSchemaDefinitions = allSchemaDefinitions.filter(
          (s) => s.database_type === databaseType
        );

        // 分析表的状态，考虑分区配置
        const { newTables, deletedTables, existingTables } =
          this.analyzeTablesWithPartition(baseDbTables, typeSchemaDefinitions);

        logger.info(
          `${databaseType} - 新表: ${newTables.length}, 删除: ${deletedTables.length}, 检查: ${existingTables.length}`
        );

        const typeResults: TableSchemaChange[] = [];

        // 1. 检测现有表的结构变化
        for (const tableName of existingTables) {
          try {
            const change = await this.detectTableChanges(
              tableName,
              databaseType
            );
            if (change) {
              typeResults.push(change);
            }
          } catch (error) {
            logger.error(
              `检测表 ${tableName} (${databaseType}) 时出错:`,
              error
            );
            // 继续处理其他表
          }
        }

        // 2. 为新表生成schema定义（只对main类型创建新表定义）
        if (databaseType === "main") {
          for (const tableName of newTables) {
            try {
              const newTableChange = await this.generateNewTableSchema(
                tableName,
                databaseType
              );
              if (newTableChange) {
                typeResults.push(newTableChange);
              }
            } catch (error) {
              logger.error(`为新表 ${tableName} 生成schema时出错:`, error);
            }
          }
        }

        // 3. 记录已删除的表
        if (deletedTables.length > 0) {
          logger.warn(
            `${databaseType} 类型检测到 ${
              deletedTables.length
            } 个表已删除: ${deletedTables.join(", ")}`
          );
        }

        // 汇总本类型的结果
        allResults.push(...typeResults);
        if (databaseType === "main") {
          allNewTables.push(...newTables);
        }
        allDeletedTables.push(...deletedTables);

        byDatabaseType[databaseType] = {
          checked: baseDbTables.length + deletedTables.length,
          changes: typeResults.length,
          new_tables: databaseType === "main" ? newTables.length : 0,
          deleted_tables: deletedTables.length,
        };
      }

      const summary = {
        total_checked: Object.values(byDatabaseType).reduce(
          (sum, type) => sum + type.checked,
          0
        ),
        changes_detected: allResults.length,
        new_tables: allNewTables.length,
        deleted_tables: allDeletedTables.length,
        by_database_type: byDatabaseType,
      };

      logger.info(
        `全部检测完成 - 总计检查: ${summary.total_checked}, 变化: ${summary.changes_detected}, 新表: ${summary.new_tables}, 删除: ${summary.deleted_tables}`
      );

      return {
        changes: allResults,
        newTables: allNewTables,
        deletedTables: allDeletedTables,
        summary,
      };
    } catch (error) {
      logger.error("检测所有表结构变化失败:", error);
      throw error;
    }
  }

  /**
   * 为新表生成schema定义
   */
  private async generateNewTableSchema(
    tableName: string,
    databaseType: "main" | "log" | "order" | "static"
  ): Promise<TableSchemaChange | null> {
    try {
      logger.info(`为新表 ${tableName} 生成schema定义`);

      // 获取表结构信息
      const tableInfo = await this.getCurrentTableInfo(tableName);
      if (!tableInfo) {
        logger.warn(`无法获取表 ${tableName} 的结构信息`);
        return null;
      }

      // 生成schema定义
      const schemaDefinition = this.generateSchemaDefinition(tableInfo);

      const result: TableSchemaChange = {
        table_name: tableName,
        database_type: databaseType,
        partition_type: "none", // 新表默认不分区
        current_version: null, // 新表没有当前版本
        new_version: "1.0.0", // 新表从1.0.0开始
        schema_definition: JSON.stringify(schemaDefinition),
        changes_detected: ["新表创建"],
        upgrade_notes: `从基准数据库检测到的新表: ${tableName}`,
      };

      logger.info(`成功为新表 ${tableName} 生成schema定义`);
      return result;
    } catch (error) {
      logger.error(`为新表 ${tableName} 生成schema定义失败:`, error);
      throw error;
    }
  }

  /**
   * 分析表状态，考虑分区配置
   */
  private analyzeTablesWithPartition(
    baseDbTables: string[],
    schemaDefinitions: any[]
  ): {
    newTables: string[];
    deletedTables: string[];
    existingTables: string[];
  } {
    const definedTables = schemaDefinitions.map((s) => s.table_name);
    const newTables: string[] = [];
    const deletedTables: string[] = [];
    const existingTables: string[] = [];

    // 创建分区表匹配规则
    const partitionRules = new Map<string, any>();
    schemaDefinitions.forEach((schema) => {
      partitionRules.set(schema.table_name, {
        partition_type: schema.partition_type,
        time_interval: schema.time_interval,
        time_format: schema.time_format,
      });
    });

    // 检查基准数据库中的每个表
    for (const baseTable of baseDbTables) {
      let matched = false;

      // 1. 直接匹配（无分区表或精确匹配的分区表）
      if (definedTables.includes(baseTable)) {
        existingTables.push(baseTable);
        matched = true;
        continue;
      }

      // 2. 检查是否是分区表
      for (const [definedTable, partitionConfig] of partitionRules) {
        if (this.isPartitionTable(baseTable, definedTable, partitionConfig)) {
          existingTables.push(baseTable);
          matched = true;
          break;
        }
      }

      // 3. 如果没有匹配，则为新表
      if (!matched) {
        newTables.push(baseTable);
      }
    }

    // 检查已删除的表（在schema中定义但基准库中不存在）
    for (const definedTable of definedTables) {
      const partitionConfig = partitionRules.get(definedTable);
      let foundInBase = false;

      // 1. 直接匹配
      if (baseDbTables.includes(definedTable)) {
        foundInBase = true;
      } else {
        // 2. 检查是否有对应的分区表
        for (const baseTable of baseDbTables) {
          if (this.isPartitionTable(baseTable, definedTable, partitionConfig)) {
            foundInBase = true;
            break;
          }
        }
      }

      if (!foundInBase) {
        deletedTables.push(definedTable);
      }
    }

    return { newTables, deletedTables, existingTables };
  }

  /**
   * 检查表是否为指定基表的分区表
   */
  private isPartitionTable(
    actualTableName: string,
    baseTableName: string,
    partitionConfig: any
  ): boolean {
    if (!partitionConfig || partitionConfig.partition_type === "none") {
      return false;
    }

    // 按门店分区：表名格式为 base_table_name_store_{store_id}
    if (partitionConfig.partition_type === "store") {
      const storePattern = new RegExp(`^${baseTableName}_store_\\d+$`);
      return storePattern.test(actualTableName);
    }

    // 按时间分区：根据time_format判断
    if (
      partitionConfig.partition_type === "time" &&
      partitionConfig.time_format
    ) {
      // 将时间格式转换为正则表达式
      let timePattern = partitionConfig.time_format
        .replace(/YYYY/g, "\\d{4}")
        .replace(/MM/g, "\\d{2}")
        .replace(/DD/g, "\\d{2}");

      const fullPattern = new RegExp(`^${baseTableName}${timePattern}$`);
      return fullPattern.test(actualTableName);
    }

    return false;
  }

  /**
   * 获取基准数据库中的所有表名
   */
  private async getAllTableNames(): Promise<string[]> {
    const query = `
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `;

    const results = (await this.baseConnection.query(query, {
      type: QueryTypes.SELECT,
    })) as Array<{ TABLE_NAME: string }>;

    return results.map((row) => row.TABLE_NAME);
  }

  /**
   * 获取基准数据库中指定表的结构信息
   */
  private async getCurrentTableInfo(tableName: string) {
    try {
      // 获取列信息
      const columnsQuery = `
        SELECT 
          COLUMN_NAME as column_name,
          DATA_TYPE as data_type,
          CHARACTER_MAXIMUM_LENGTH as character_maximum_length,
          IS_NULLABLE as is_nullable,
          COLUMN_DEFAULT as column_default,
          COLUMN_KEY as column_key,
          EXTRA as extra,
          COLUMN_COMMENT as column_comment
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = :tableName
        ORDER BY ORDINAL_POSITION
      `;

      const columns = (await this.baseConnection.query(columnsQuery, {
        replacements: { tableName },
        type: QueryTypes.SELECT,
      })) as ColumnInfo[];

      if (columns.length === 0) {
        return null;
      }

      // 获取索引信息
      const indexesQuery = `
        SELECT 
          TABLE_NAME as table_name,
          INDEX_NAME as index_name,
          COLUMN_NAME as column_name,
          NON_UNIQUE as non_unique,
          SEQ_IN_INDEX as seq_in_index
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = :tableName
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `;

      const indexes = (await this.baseConnection.query(indexesQuery, {
        replacements: { tableName },
        type: QueryTypes.SELECT,
      })) as IndexInfo[];

      return {
        tableName,
        columns,
        indexes,
      };
    } catch (error) {
      logger.error(`获取表 ${tableName} 结构信息失败:`, error);
      throw error;
    }
  }

  /**
   * 获取TableSchema中指定表的最新版本
   */
  private async getLatestTableSchema(
    tableName: string,
    databaseType: "main" | "log" | "order" | "static"
  ): Promise<TableSchema | null> {
    return await TableSchema.findOne({
      where: {
        table_name: tableName,
        database_type: databaseType,
        is_active: true,
      },
      order: [["schema_version", "DESC"]],
    });
  }

  /**
   * 生成schema定义
   */
  private generateSchemaDefinition(tableInfo: any) {
    const columns = tableInfo.columns.map((col: ColumnInfo) => {
      const column: any = {
        name: col.column_name,
        type: col.data_type.toUpperCase(),
      };

      // 只在有值时设置长度
      if (col.character_maximum_length !== null) {
        column.length = col.character_maximum_length;
      }

      // 只在不允许为空时设置allowNull为false，默认允许为空
      if (col.is_nullable === "NO") {
        column.allowNull = false;
      }

      // 只在有默认值时设置
      if (col.column_default !== null) {
        column.defaultValue = col.column_default;
      }

      // 只在为true时设置这些布尔属性
      if (col.column_key === "PRI") {
        column.primaryKey = true;
      }

      if (col.extra.includes("auto_increment")) {
        column.autoIncrement = true;
      }

      if (col.column_key === "UNI") {
        column.unique = true;
      }

      // 只在有注释时设置
      if (col.column_comment && col.column_comment.trim() !== "") {
        column.comment = col.column_comment;
      }

      return column;
    });

    // 处理索引
    const indexMap = new Map<string, any>();
    tableInfo.indexes.forEach((idx: IndexInfo) => {
      if (idx.index_name === "PRIMARY") return; // 跳过主键索引

      if (!indexMap.has(idx.index_name)) {
        indexMap.set(idx.index_name, {
          name: idx.index_name,
          fields: [],
          unique: idx.non_unique === 0,
        });
      }

      indexMap.get(idx.index_name).fields.push(idx.column_name);
    });

    const indexes = Array.from(indexMap.values());

    return {
      tableName: tableInfo.tableName,
      columns,
      indexes,
    };
  }

  /**
   * 比较两个schema定义，返回变化列表
   */
  private compareSchemas(
    existingSchema: TableSchema | null,
    newSchemaDefinition: any
  ): string[] {
    const changes: string[] = [];

    if (!existingSchema) {
      changes.push("新表");
      return changes;
    }

    try {
      const existingDef = JSON.parse(existingSchema.schema_definition);

      // 比较列
      const existingColumns = existingDef.columns || [];
      const newColumns = newSchemaDefinition.columns || [];

      // 检查新增的列
      const existingColumnNames = existingColumns.map((col: any) => col.name);
      const newColumnNames = newColumns.map((col: any) => col.name);

      const addedColumns = newColumns.filter(
        (col: any) => !existingColumnNames.includes(col.name)
      );
      const removedColumns = existingColumns.filter(
        (col: any) => !newColumnNames.includes(col.name)
      );

      addedColumns.forEach((col: any) => {
        changes.push(`新增列: ${col.name} (${col.type})`);
      });

      removedColumns.forEach((col: any) => {
        changes.push(`删除列: ${col.name}`);
      });

      // 检查修改的列
      newColumns.forEach((newCol: any) => {
        const existingCol = existingColumns.find(
          (col: any) => col.name === newCol.name
        );
        if (existingCol) {
          const colChanges = this.compareColumn(existingCol, newCol);
          changes.push(...colChanges);
        }
      });

      // 比较索引
      const existingIndexes = existingDef.indexes || [];
      const newIndexes = newSchemaDefinition.indexes || [];

      const existingIndexNames = existingIndexes.map((idx: any) => idx.name);
      const newIndexNames = newIndexes.map((idx: any) => idx.name);

      const addedIndexes = newIndexes.filter(
        (idx: any) => !existingIndexNames.includes(idx.name)
      );
      const removedIndexes = existingIndexes.filter(
        (idx: any) => !newIndexNames.includes(idx.name)
      );

      addedIndexes.forEach((idx: any) => {
        changes.push(`新增索引: ${idx.name} (${idx.fields.join(",")})`);
      });

      removedIndexes.forEach((idx: any) => {
        changes.push(`删除索引: ${idx.name}`);
      });
    } catch (error) {
      logger.error("比较schema时出错:", error);
      changes.push("schema格式错误，需要重新生成");
    }

    return changes;
  }

  /**
   * 比较单个列的变化
   */
  private compareColumn(existingCol: any, newCol: any): string[] {
    const changes: string[] = [];
    const colName = newCol.name;

    // 比较类型
    if (existingCol.type !== newCol.type) {
      changes.push(
        `列 ${colName} 类型变化: ${existingCol.type} -> ${newCol.type}`
      );
    }

    // 比较长度（考虑undefined/null情况）
    const existingLength = existingCol.length || null;
    const newLength = newCol.length || null;
    if (existingLength !== newLength) {
      changes.push(
        `列 ${colName} 长度变化: ${existingLength || "无"} -> ${
          newLength || "无"
        }`
      );
    }

    // 比较可空性（默认为true）
    const existingAllowNull = existingCol.allowNull !== false;
    const newAllowNull = newCol.allowNull !== false;
    if (existingAllowNull !== newAllowNull) {
      changes.push(
        `列 ${colName} 可空性变化: ${existingAllowNull} -> ${newAllowNull}`
      );
    }

    // 比较默认值（考虑undefined/null情况）
    const existingDefault = existingCol.defaultValue || null;
    const newDefault = newCol.defaultValue || null;
    if (existingDefault !== newDefault) {
      changes.push(
        `列 ${colName} 默认值变化: ${existingDefault || "无"} -> ${
          newDefault || "无"
        }`
      );
    }

    // 比较主键属性
    const existingPrimaryKey = existingCol.primaryKey === true;
    const newPrimaryKey = newCol.primaryKey === true;
    if (existingPrimaryKey !== newPrimaryKey) {
      changes.push(
        `列 ${colName} 主键属性变化: ${existingPrimaryKey} -> ${newPrimaryKey}`
      );
    }

    // 比较自增属性
    const existingAutoIncrement = existingCol.autoIncrement === true;
    const newAutoIncrement = newCol.autoIncrement === true;
    if (existingAutoIncrement !== newAutoIncrement) {
      changes.push(
        `列 ${colName} 自增属性变化: ${existingAutoIncrement} -> ${newAutoIncrement}`
      );
    }

    // 比较唯一约束
    const existingUnique = existingCol.unique === true;
    const newUnique = newCol.unique === true;
    if (existingUnique !== newUnique) {
      changes.push(
        `列 ${colName} 唯一约束变化: ${existingUnique} -> ${newUnique}`
      );
    }

    // 比较注释（考虑undefined/null/空字符串情况）
    const existingComment =
      existingCol.comment && existingCol.comment.trim() !== ""
        ? existingCol.comment
        : null;
    const newComment =
      newCol.comment && newCol.comment.trim() !== "" ? newCol.comment : null;
    if (existingComment !== newComment) {
      changes.push(
        `列 ${colName} 注释变化: "${existingComment || "无"}" -> "${
          newComment || "无"
        }"`
      );
    }

    return changes;
  }

  /**
   * 生成新版本号
   */
  private generateNewVersion(currentVersion: string | null): string {
    if (!currentVersion) {
      return "1.0.0";
    }

    // 解析版本号 (假设使用语义化版本)
    const versionMatch = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (versionMatch) {
      const [, major, minor, patch] = versionMatch;
      if (major && minor && patch) {
        return `${major}.${minor}.${parseInt(patch) + 1}`;
      }
    }

    // 如果不是标准格式，生成时间戳版本
    return `${currentVersion}.${Date.now()}`;
  }

  /**
   * 批量保存检测到的变化到TableSchema表
   */
  async saveDetectedChanges(changes: TableSchemaChange[]): Promise<void> {
    try {
      logger.info(`开始保存 ${changes.length} 个表结构变化`);

      for (const change of changes) {
        // 将旧版本标记为非激活
        await TableSchema.update(
          { is_active: false },
          {
            where: {
              table_name: change.table_name,
              database_type: change.database_type,
              is_active: true,
            },
          }
        );

        // 创建新版本
        const createData: any = {
          table_name: change.table_name,
          database_type: change.database_type,
          partition_type: change.partition_type,
          schema_version: change.new_version,
          schema_definition: change.schema_definition,
          is_active: true,
          changes_detected: JSON.stringify(change.changes_detected),
          upgrade_notes: change.upgrade_notes,
        };

        // 只在有值时添加可选字段
        if (change.current_version) {
          createData.current_version = change.current_version;
        }
        if (change.time_interval) {
          createData.time_interval = change.time_interval;
        }
        if (change.time_format) {
          createData.time_format = change.time_format;
        }

        await TableSchema.create(createData);

        logger.info(`保存表 ${change.table_name} 新版本 ${change.new_version}`);
      }

      logger.info("所有表结构变化保存完成");
    } catch (error) {
      logger.error("保存表结构变化失败:", error);
      throw error;
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    await this.connectionManager.closeAllConnections();
  }
}
