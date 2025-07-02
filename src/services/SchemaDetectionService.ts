import { Sequelize, QueryTypes } from "sequelize";
import TableSchema from "@/models/TableSchema";
import DatabaseConnectionManager from "./DatabaseConnectionManager";
import baseSequelize from "@/config/baseDatabase";
import logger from "@/utils/logger";

interface ColumnInfo {
  column_name: string;
  data_type: string;
  column_type: string; // 完整的字段类型定义，包含ENUM值
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
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

      // 先解析所有基准库表名，按数据库类型分组
      const tablesByDbType: Record<
        "main" | "log" | "order" | "static",
        string[]
      > = {
        main: [],
        log: [],
        order: [],
        static: [],
      };

      // 解析基准库中的所有表名
      for (const fullTableName of baseDbTables) {
        const parsed = this.parseTableName(fullTableName);
        tablesByDbType[parsed.databaseType].push(fullTableName);
      }

      logger.info(`基准库表分布统计:`);
      for (const [dbType, tables] of Object.entries(tablesByDbType)) {
        if (tables) {
          logger.info(`  - ${dbType}: ${tables.length} 个表`);
        }
      }

      // 按数据库类型检测
      for (const databaseType of databaseTypes) {
        logger.info(`检测 ${databaseType} 数据库类型...`);

        const typeSchemaDefinitions = allSchemaDefinitions.filter(
          (s) => s.database_type === databaseType
        );

        // 只检查属于当前数据库类型的表
        const relevantBaseTables = tablesByDbType[databaseType] || [];

        // 分析表的状态，考虑分区配置
        const { newTables, deletedTables, existingTables } =
          await this.analyzeTablesWithPartition(
            relevantBaseTables,
            typeSchemaDefinitions
          );

        logger.info(
          `${databaseType} - 新表: ${newTables.length}, 需要删除处理: ${deletedTables.length}, 检查: ${existingTables.length}`
        );

        const typeResults: TableSchemaChange[] = [];

        // 1. 检测现有表的结构变化
        for (const tableName of existingTables) {
          try {
            // 解析表名获取真实表名进行检测
            const parsed = this.parseTableName(tableName);
            const change = await this.detectTableChanges(
              parsed.tableName,
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

        // 2. 为新表生成schema定义
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

        // 3. 处理需要删除的表
        const actualDeletedTables: string[] = []; // 实际需要生成删除配置的表
        for (const tableName of deletedTables) {
          try {
            const deleteTableChange = await this.generateDeleteTableSchema(
              tableName,
              databaseType
            );
            if (deleteTableChange) {
              typeResults.push(deleteTableChange);
              actualDeletedTables.push(tableName); // 只有真正生成了删除配置的表才加入
            }
          } catch (error) {
            logger.error(`处理删除表 ${tableName} 时出错:`, error);
          }
        }

        if (actualDeletedTables.length > 0) {
          logger.warn(
            `${databaseType} 类型生成了 ${
              actualDeletedTables.length
            } 个表的删除配置: ${actualDeletedTables.join(", ")}`
          );
        }

        // 汇总本类型的结果
        allResults.push(...typeResults);
        allNewTables.push(...newTables);
        allDeletedTables.push(...actualDeletedTables); // 使用实际生成删除配置的表

        byDatabaseType[databaseType] = {
          checked: relevantBaseTables.length + deletedTables.length,
          changes: typeResults.length,
          new_tables: newTables.length,
          deleted_tables: actualDeletedTables.length, // 使用实际生成删除配置的表数量
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
    originalTableName: string,
    databaseType: "main" | "log" | "order" | "static"
  ): Promise<TableSchemaChange | null> {
    try {
      logger.info(`为新表 ${originalTableName} 生成schema定义`);

      // 解析表名和数据库类型
      const parsed = this.parseTableName(originalTableName);
      const actualTableName = parsed.tableName;
      const actualDatabaseType = parsed.databaseType;

      // 如果解析出的数据库类型与传入的类型不同，优先使用解析出的类型，否则使用传入的类型
      const finalDatabaseType = originalTableName.includes("@")
        ? actualDatabaseType
        : databaseType;

      // 获取表结构信息（使用原始表名查询基准库）
      const tableInfo = await this.getCurrentTableInfo(originalTableName);
      if (!tableInfo) {
        logger.warn(`无法获取表 ${originalTableName} 的结构信息`);
        return null;
      }

      // 生成schema定义（使用解析后的表名）
      const schemaDefinition = this.generateSchemaDefinition({
        ...tableInfo,
        tableName: actualTableName,
      });

      // 检测分表类型
      const partitionInfo = this.detectPartitionFromTableName(actualTableName);
      const finalTableName = partitionInfo.cleanTableName; // 使用清理后的表名

      const result: TableSchemaChange = {
        table_name: finalTableName, // 使用清理后的表名
        database_type: finalDatabaseType,
        partition_type: partitionInfo.partition_type,
        current_version: null, // 新表没有当前版本
        new_version: "1.0.0", // 新表从1.0.0开始
        schema_definition: JSON.stringify(schemaDefinition),
        changes_detected: ["新表创建"],
        upgrade_notes: this.buildDetailedUpgradeNotes(
          originalTableName,
          finalTableName,
          finalDatabaseType,
          partitionInfo
        ),
      };

      // 如果检测到时间分区，添加时间分区相关配置
      if (partitionInfo.partition_type === "time") {
        if (partitionInfo.time_interval) {
          result.time_interval = partitionInfo.time_interval;
        }
        if (partitionInfo.time_format) {
          result.time_format = partitionInfo.time_format;
        }
      }

      logger.info(
        `成功为新表 ${originalTableName} 生成schema定义 - 最终表名: ${finalTableName}, 数据库类型: ${finalDatabaseType}, 分表类型: ${partitionInfo.partition_type}`
      );
      return result;
    } catch (error) {
      logger.error(`为新表 ${originalTableName} 生成schema定义失败:`, error);
      throw error;
    }
  }

  /**
   * 为删除的表生成删除配置或检查现有删除配置
   */
  private async generateDeleteTableSchema(
    tableName: string,
    databaseType: "main" | "log" | "order" | "static"
  ): Promise<TableSchemaChange | null> {
    try {
      logger.info(`处理删除表 ${tableName} 的配置`);

      // 获取该表在TableSchema中的最新版本
      const latestSchema = await this.getLatestTableSchema(
        tableName,
        databaseType
      );

      if (!latestSchema) {
        logger.warn(
          `表 ${tableName} 在TableSchema中没有记录，无法生成删除配置`
        );
        return null;
      }

      try {
        const existingDefinition = JSON.parse(latestSchema.schema_definition);

        // 如果最新版本已经是删除操作，不需要生成新的版本
        if (existingDefinition.action === "DROP") {
          logger.info(
            `表 ${tableName} 已配置为删除 (版本 ${latestSchema.schema_version})，无需重新生成`
          );
          return null;
        }
      } catch (error) {
        logger.error(`解析表 ${tableName} 的schema_definition失败:`, error);
      }

      // 生成删除配置的schema定义
      const deleteSchemaDefinition = {
        tableName: tableName,
        action: "DROP", // 标记为删除操作
        columns: [], // 删除操作时列定义为空
        indexes: [], // 删除操作时索引定义为空
      };

      // 生成新版本号
      const newVersion = this.generateNewVersion(latestSchema.schema_version);

      const result: TableSchemaChange = {
        table_name: tableName,
        database_type: databaseType,
        partition_type: latestSchema.partition_type,
        current_version: latestSchema.schema_version,
        new_version: newVersion,
        schema_definition: JSON.stringify(deleteSchemaDefinition),
        changes_detected: ["表需要删除"],
        upgrade_notes: `检测到表 ${tableName} 已从基准数据库中删除，生成删除配置`,
      };

      // 保留分区配置信息
      if (latestSchema.time_interval) {
        result.time_interval = latestSchema.time_interval;
      }
      if (latestSchema.time_format) {
        result.time_format = latestSchema.time_format;
      }

      logger.info(
        `成功为删除表 ${tableName} 生成删除配置，版本: ${newVersion}`
      );
      return result;
    } catch (error) {
      logger.error(`处理删除表 ${tableName} 失败:`, error);
      throw error;
    }
  }

  /**
   * 分析表状态，考虑分区配置
   */
  private async analyzeTablesWithPartition(
    baseDbTables: string[],
    schemaDefinitions: any[]
  ): Promise<{
    newTables: string[];
    deletedTables: string[];
    existingTables: string[];
  }> {
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

    // 检查需要删除的表
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

      // 如果基准数据库中不存在该表，检查是否需要生成删除配置
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
          COLUMN_TYPE as column_type,
          CHARACTER_MAXIMUM_LENGTH as character_maximum_length,
          NUMERIC_PRECISION as numeric_precision,
          NUMERIC_SCALE as numeric_scale,
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
   * 智能识别正确的主键
   * 根据命名规范（表名+_id）和字段属性来确定真正的主键
   */
  private identifyCorrectPrimaryKey(
    tableName: string,
    columns: ColumnInfo[]
  ): string | null {
    // 1. 移除表前缀，获取基础表名
    const baseTableName = tableName.replace(/^qc_/, "");
    const expectedPrimaryKeyName = `${baseTableName}_id`;

    logger.info(
      `🔍 为表 ${tableName} 识别正确主键，期望主键名: ${expectedPrimaryKeyName}`
    );

    // 2. 查找符合命名规范的主键字段
    const expectedPrimaryKeyColumn = columns.find(
      (col) => col.column_name === expectedPrimaryKeyName
    );

    if (expectedPrimaryKeyColumn) {
      logger.info(`✅ 找到符合命名规范的主键字段: ${expectedPrimaryKeyName}`);

      // 3. 验证该字段是否适合作为主键（通常应该是INT类型且自增）
      const isAutoIncrement =
        expectedPrimaryKeyColumn.extra?.includes("auto_increment") || false;
      const isIntType = ["int", "bigint", "smallint", "tinyint"].includes(
        expectedPrimaryKeyColumn.data_type?.toLowerCase() || ""
      );

      if (isIntType && isAutoIncrement) {
        logger.info(
          `✅ 字段 ${expectedPrimaryKeyName} 满足主键条件（${expectedPrimaryKeyColumn.data_type}，自增）`
        );
        return expectedPrimaryKeyName;
      } else {
        logger.warn(
          `⚠️  字段 ${expectedPrimaryKeyName} 存在但不满足主键条件（类型: ${expectedPrimaryKeyColumn.data_type}，自增: ${isAutoIncrement}）`
        );
      }
    }

    // 4. 如果没找到符合命名规范的，查找其他可能的主键字段
    logger.info(`🔄 没找到标准主键，查找其他可能的主键字段...`);

    // 查找自增的整型字段
    const autoIncrementColumns = columns.filter(
      (col) =>
        col.extra.includes("auto_increment") &&
        ["int", "bigint", "smallint", "tinyint"].includes(
          col.data_type.toLowerCase()
        )
    );

    if (autoIncrementColumns.length === 1 && autoIncrementColumns[0]) {
      logger.info(
        `✅ 找到唯一的自增字段作为主键: ${autoIncrementColumns[0].column_name}`
      );
      return autoIncrementColumns[0].column_name;
    }

    // 5. 查找名称包含 'id' 的字段
    const idColumns = columns.filter(
      (col) =>
        col.column_name.toLowerCase().includes("id") &&
        ["int", "bigint", "smallint", "tinyint"].includes(
          col.data_type.toLowerCase()
        ) &&
        col.column_key === "PRI"
    );

    if (idColumns.length === 1 && idColumns[0]) {
      logger.info(`✅ 找到包含ID的主键字段: ${idColumns[0].column_name}`);
      return idColumns[0].column_name;
    }

    // 6. 如果还是找不到，记录警告
    logger.warn(`⚠️  表 ${tableName} 无法识别正确的主键，建议检查表结构设计`);
    logger.warn(
      `💡 建议将主键命名为: ${expectedPrimaryKeyName}，类型为INT AUTO_INCREMENT`
    );

    return null;
  }

  /**
   * 判断数据类型是否应该设置长度属性
   */
  private shouldSetLength(dataType: string): boolean {
    const typeWithoutLength = [
      "TINYBLOB",
      "BLOB",
      "MEDIUMBLOB",
      "LONGBLOB",
      "TINYTEXT",
      "TEXT",
      "MEDIUMTEXT",
      "LONGTEXT",
      "JSON",
      "GEOMETRY",
      "POINT",
      "LINESTRING",
      "POLYGON",
      "MULTIPOINT",
      "MULTILINESTRING",
      "MULTIPOLYGON",
      "GEOMETRYCOLLECTION",
      "DATE",
      "TIME",
      "DATETIME",
      "TIMESTAMP",
      "YEAR",
      "ENUM",
      "SET", // ENUM和SET不使用length，使用values
    ];

    return !typeWithoutLength.includes(dataType.toUpperCase());
  }

  /**
   * 从COLUMN_TYPE字段解析ENUM/SET的枚举值
   * 输入: "enum('value1','value2','value3')" 或 "set('tag1','tag2','tag3')"
   * 输出: ["value1", "value2", "value3"]
   */
  private parseEnumValuesFromColumnType(columnType: string): string[] {
    if (!columnType) return [];

    // 匹配ENUM或SET的括号内容
    const match = columnType.match(/^(enum|set)\((.*)\)$/i);
    if (!match) return [];

    const valuesStr = match[2];
    if (!valuesStr) return [];

    const values: string[] = [];
    let current = "";
    let inQuote = false;
    let escaped = false;

    for (let i = 0; i < valuesStr.length; i++) {
      const char = valuesStr[i];

      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        current += char;
        continue;
      }

      if (char === "'") {
        if (inQuote) {
          // 检查是否是转义的引号（双引号）
          if (i + 1 < valuesStr.length && valuesStr[i + 1] === "'") {
            current += "'";
            i++; // 跳过下一个引号
          } else {
            // 引号结束
            inQuote = false;
          }
        } else {
          // 引号开始
          inQuote = true;
        }
        continue;
      }

      if (!inQuote && char === ",") {
        // 分隔符，保存当前值
        if (current.trim()) {
          values.push(current.trim());
        }
        current = "";
        continue;
      }

      current += char;
    }

    // 保存最后一个值
    if (current.trim()) {
      values.push(current.trim());
    }

    return values;
  }

  /**
   * 生成schema定义
   */
  private generateSchemaDefinition(tableInfo: any) {
    // 先分析主键情况
    const primaryKeyColumns = tableInfo.columns.filter(
      (col: ColumnInfo) => col.column_key === "PRI"
    );
    const hasSinglePrimaryKey = primaryKeyColumns.length === 1;
    const hasCompositePrimaryKey = primaryKeyColumns.length > 1;

    logger.info(
      `表 ${tableInfo.tableName} 主键分析: 主键列数=${primaryKeyColumns.length}, 单一主键=${hasSinglePrimaryKey}, 复合主键=${hasCompositePrimaryKey}`
    );
    if (primaryKeyColumns.length > 0) {
      const primaryKeyNames = primaryKeyColumns.map(
        (col: ColumnInfo) => col.column_name
      );
      logger.info(`原始主键列: [${primaryKeyNames.join(", ")}]`);
    }

    // 智能主键识别：根据命名规范确定真正的主键
    const correctPrimaryKey = this.identifyCorrectPrimaryKey(
      tableInfo.tableName,
      tableInfo.columns
    );

    const columns = tableInfo.columns.map((col: ColumnInfo) => {
      const column: any = {
        name: col.column_name,
        type: col.data_type.toUpperCase(),
      };

      // 特殊处理ENUM和SET类型
      const dataType = col.data_type.toUpperCase();
      if (dataType === "ENUM" || dataType === "SET") {
        // 解析ENUM/SET的枚举值
        const enumValues = this.parseEnumValuesFromColumnType(col.column_type);
        if (enumValues.length > 0) {
          column.values = enumValues;
        }
      } else if (dataType === "DECIMAL" || dataType === "NUMERIC") {
        // 处理DECIMAL类型的精度和标度
        if (col.numeric_precision !== null) {
          column.precision = col.numeric_precision;
          if (col.numeric_scale !== null) {
            column.scale = col.numeric_scale;
          }
        }
      } else {
        // 只在有值时设置长度，排除不需要长度的类型
        if (
          col.character_maximum_length !== null &&
          this.shouldSetLength(col.data_type)
        ) {
          column.length = col.character_maximum_length;
        }
      }

      // 明确设置allowNull属性，避免默认值歧义
      column.allowNull = col.is_nullable === "YES";

      // 处理默认值：需要区分NULL和没有默认值的情况
      if (col.column_default !== null) {
        column.defaultValue = col.column_default;
      } else if (column.allowNull) {
        // 如果字段允许为空且默认值是NULL，明确设置为null
        column.defaultValue = null;
      }
      // 如果字段不允许为空且没有默认值，则不设置defaultValue

      // 使用智能识别的主键，而不是数据库中错误的复合主键设计
      if (col.column_name === correctPrimaryKey) {
        column.primaryKey = true;
        logger.info(
          `✅ 设置正确的主键: ${
            col.column_name
          }（符合 ${tableInfo.tableName.replace("qc_", "")}_id 规范）`
        );
      } else if (
        col.column_key === "PRI" &&
        col.column_name !== correctPrimaryKey
      ) {
        logger.warn(
          `⚠️  忽略错误的主键设置: ${col.column_name}（应该是外键或普通字段）`
        );
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

    // 收集已经在列定义中设置了unique的字段
    const uniqueColumns = new Set(
      columns.filter((col: any) => col.unique).map((col: any) => col.name)
    );

    tableInfo.indexes.forEach((idx: IndexInfo) => {
      if (idx.index_name === "PRIMARY") return; // 跳过主键索引，因为主键信息已经在列定义中

      if (!indexMap.has(idx.index_name)) {
        indexMap.set(idx.index_name, {
          name: idx.index_name,
          fields: [],
          unique: idx.non_unique === 0,
        });
      }

      indexMap.get(idx.index_name).fields.push(idx.column_name);
    });

    // 过滤掉已经在列定义中设置unique的单字段唯一索引
    const indexes = Array.from(indexMap.values()).filter((index) => {
      // 如果是唯一索引且只有一个字段，检查该字段是否已在列定义中设置unique
      if (index.unique && index.fields.length === 1) {
        const fieldName = index.fields[0];
        if (uniqueColumns.has(fieldName)) {
          return false; // 过滤掉重复的唯一索引
        }
      }
      return true;
    });

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

    // 比较ENUM/SET的values属性
    if (existingCol.values || newCol.values) {
      const existingValues = existingCol.values || [];
      const newValues = newCol.values || [];

      if (JSON.stringify(existingValues) !== JSON.stringify(newValues)) {
        changes.push(
          `列 ${colName} 枚举值变化: [${existingValues.join(
            ","
          )}] -> [${newValues.join(",")}]`
        );
      }
    }

    // 比较DECIMAL的precision属性
    if (existingCol.precision || newCol.precision) {
      const existingPrecision = existingCol.precision || null;
      const newPrecision = newCol.precision || null;
      if (existingPrecision !== newPrecision) {
        changes.push(
          `列 ${colName} 精度变化: ${existingPrecision || "无"} -> ${
            newPrecision || "无"
          }`
        );
      }
    }

    // 比较DECIMAL的scale属性
    if (existingCol.scale || newCol.scale) {
      const existingScale = existingCol.scale || null;
      const newScale = newCol.scale || null;
      if (existingScale !== newScale) {
        changes.push(
          `列 ${colName} 小数位变化: ${existingScale || "无"} -> ${
            newScale || "无"
          }`
        );
      }
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
    if (this.connectionManager) {
      await this.connectionManager.closeAllConnections();
    }
  }

  /**
   * 解析表名，支持@符号分割数据库类型
   * 格式: table_name@database_type
   * @符号后只能是log/order/static，其他一律对应main数据库
   */
  private parseTableName(fullTableName: string): {
    tableName: string;
    databaseType: "main" | "log" | "order" | "static";
  } {
    if (fullTableName.includes("@")) {
      const parts = fullTableName.split("@");
      const tableName = parts[0] || "";
      const dbType = parts[1] || "";
      const validTypes = ["log", "order", "static"];
      const databaseType = validTypes.includes(dbType) ? dbType : "main";

      logger.debug(
        `解析表名: ${fullTableName} -> 表名: ${tableName}, 数据库类型: ${databaseType}`
      );
      return {
        tableName: tableName.trim(),
        databaseType: databaseType as "main" | "log" | "order" | "static",
      };
    }

    return { tableName: fullTableName, databaseType: "main" };
  }

  /**
   * 基于表名后缀检测分表类型并返回清理后的表名
   * 规则：
   * - #store: 按门店分表
   * - #time_day: 按天分表
   * - #time_month: 按月分表
   * - #time_year: 按年分表
   */
  private detectPartitionFromTableName(tableName: string): {
    cleanTableName: string;
    partition_type: "store" | "time" | "none";
    time_interval?: "day" | "month" | "year";
    time_format?: string;
  } {
    logger.debug(`检测表 ${tableName} 的分表类型...`);

    // 检测门店分表
    if (tableName.includes("#store")) {
      const cleanTableName = tableName.replace("#store", "");
      logger.info(
        `表 ${tableName} 检测为门店分表，清理后表名: ${cleanTableName}`
      );
      return {
        cleanTableName,
        partition_type: "store",
      };
    }

    // 检测时间分表
    if (tableName.includes("#time_day")) {
      const cleanTableName = tableName.replace("#time_day", "");
      logger.info(
        `表 ${tableName} 检测为按天时间分表，清理后表名: ${cleanTableName}`
      );
      return {
        cleanTableName,
        partition_type: "time",
        time_interval: "day",
        time_format: "YYYYMMDD",
      };
    }

    if (tableName.includes("#time_month")) {
      const cleanTableName = tableName.replace("#time_month", "");
      logger.info(
        `表 ${tableName} 检测为按月时间分表，清理后表名: ${cleanTableName}`
      );
      return {
        cleanTableName,
        partition_type: "time",
        time_interval: "month",
        time_format: "YYYYMM",
      };
    }

    if (tableName.includes("#time_year")) {
      const cleanTableName = tableName.replace("#time_year", "");
      logger.info(
        `表 ${tableName} 检测为按年时间分表，清理后表名: ${cleanTableName}`
      );
      return {
        cleanTableName,
        partition_type: "time",
        time_interval: "year",
        time_format: "YYYY",
      };
    }

    logger.debug(`表 ${tableName} 检测为普通表（无分表）`);
    return {
      cleanTableName: tableName,
      partition_type: "none",
    };
  }

  /**
   * 构建详细的升级说明
   */
  private buildDetailedUpgradeNotes(
    originalTableName: string,
    parsedTableName: string,
    databaseType: string,
    partitionInfo: any
  ): string {
    let notes = `从基准数据库检测到的新表`;

    if (originalTableName !== parsedTableName) {
      notes += `\n原始表名: ${originalTableName}`;
      notes += `\n解析表名: ${parsedTableName}`;
    } else {
      notes += `: ${parsedTableName}`;
    }

    notes += `\n数据库类型: ${databaseType}`;

    if (partitionInfo.partition_type !== "none") {
      notes += `\n分表类型: ${partitionInfo.partition_type}`;

      if (partitionInfo.partition_type === "time") {
        notes += `\n时间间隔: ${partitionInfo.time_interval}`;
        notes += `\n时间格式: ${partitionInfo.time_format}`;
      }

      notes += `\n✅ 自动检测结果（基于表名后缀）`;
    }

    return notes;
  }

  /**
   * 公开的表名解析方法
   */
  public parseTableNamePublic(fullTableName: string): {
    tableName: string;
    databaseType: "main" | "log" | "order" | "static";
  } {
    return this.parseTableName(fullTableName);
  }

  /**
   * 公开的分表类型检测方法
   */
  public detectPartitionTypePublic(tableName: string): {
    cleanTableName: string;
    partition_type: "store" | "time" | "none";
    time_interval?: "day" | "month" | "year";
    time_format?: string;
  } {
    return this.detectPartitionFromTableName(tableName);
  }
}
