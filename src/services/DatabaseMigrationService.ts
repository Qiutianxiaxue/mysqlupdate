import { Sequelize } from "sequelize";
import TableSchema from "@/models/TableSchema";
import Enterprise from "@/models/Enterprise";
import DatabaseConnectionManager from "./DatabaseConnectionManager";
import logger from "@/utils/logger";

interface ColumnDefinition {
  name: string;
  type: string;
  length?: number;
  allowNull?: boolean;
  defaultValue?: any;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  unique?: boolean;
  comment?: string;
}

interface TableDefinition {
  tableName: string;
  columns: ColumnDefinition[];
  indexes?: Array<{
    name: string;
    fields: string[];
    unique?: boolean;
  }>;
}

export class DatabaseMigrationService {
  private connectionManager: DatabaseConnectionManager;

  constructor() {
    this.connectionManager = new DatabaseConnectionManager();
  }

  /**
   * 统一的表迁移方法
   * 通过表名、数据库类型和版本号来确定操作类型
   */
  async migrateTable(
    tableName: string,
    databaseType: string,
    schemaVersion?: string
  ): Promise<void> {
    try {
      logger.info(
        `开始迁移表: ${tableName}, 数据库类型: ${databaseType}, 版本: ${
          schemaVersion || "最新"
        }`
      );

      // 获取表结构定义
      const schema = await this.getTableSchema(
        tableName,
        databaseType,
        schemaVersion
      );
      if (!schema) {
        throw new Error(`未找到表结构定义: ${tableName} (${databaseType})`);
      }

      // 获取所有企业
      const enterprises = await Enterprise.findAll({
        where: { status: 1 },
      });

      let successCount = 0;
      let failedCount = 0;

      for (const enterprise of enterprises) {
        try {
          await this.migrateTableForEnterprise(enterprise, schema);
          successCount++;
          logger.info(`企业 ${enterprise.enterprise_name} 迁移成功`);
        } catch (error) {
          failedCount++;
          logger.error(`企业 ${enterprise.enterprise_name} 迁移失败:`, error);
        }
      }

      logger.info(
        `迁移完成: 成功 ${successCount} 个企业，失败 ${failedCount} 个企业`
      );
    } catch (error) {
      logger.error(`迁移表 ${tableName} 失败:`, error);
      throw error;
    }
  }

  /**
   * 获取表结构定义
   */
  private async getTableSchema(
    tableName: string,
    databaseType: string,
    schemaVersion?: string
  ): Promise<TableSchema | null> {
    const whereCondition: any = {
      table_name: tableName,
      database_type: databaseType,
      is_active: true,
    };

    if (schemaVersion) {
      whereCondition.schema_version = schemaVersion;
    }

    const schema = await TableSchema.findOne({
      where: whereCondition,
      order: schemaVersion ? [] : [["schema_version", "DESC"]], // 如果没有指定版本，获取最新版本
    });

    return schema;
  }

  /**
   * 为单个企业迁移表
   */
  private async migrateTableForEnterprise(
    enterprise: Enterprise,
    schema: TableSchema
  ): Promise<void> {
    try {
      const tableDefinition = JSON.parse(
        schema.schema_definition
      ) as TableDefinition;

      // 获取对应数据库类型的连接
      const connection = await this.connectionManager.getConnection(
        enterprise,
        schema.database_type
      );

      // 根据分区类型处理
      if (schema.partition_type === "store" && schema.store_id) {
        await this.migrateTableWithConnection(
          connection,
          tableDefinition,
          schema.store_id
        );
      } else if (schema.partition_type === "time") {
        // 时间分表逻辑
        const now = new Date();
        const startDate = new Date(now.getFullYear(), 0, 1);
        const endDate = new Date(now.getFullYear(), 11, 31);
        await this.migrateTimePartitionedTable(
          connection,
          tableDefinition,
          startDate,
          endDate,
          "month"
        );
      } else {
        await this.migrateTableWithConnection(connection, tableDefinition);
      }

      logger.info(
        `企业 ${enterprise.enterprise_name} (${enterprise.enterprise_id}) 的表 ${schema.table_name} 迁移成功`
      );
    } catch (error) {
      logger.error(
        `企业 ${enterprise.enterprise_name} (${enterprise.enterprise_id}) 迁移失败:`,
        error
      );
      throw error;
    }
  }

  /**
   * 使用指定连接迁移表（统一的创建/升级逻辑）
   */
  private async migrateTableWithConnection(
    connection: Sequelize,
    tableDefinition: TableDefinition,
    storeId?: string
  ): Promise<void> {
    try {
      const tableName = this.getTableName(tableDefinition.tableName, storeId);
      logger.info(`开始迁移表: ${tableName}`);

      // 检查表是否存在
      const tableExists = await this.tableExistsWithConnection(
        connection,
        tableName
      );

      if (tableExists) {
        logger.info(`表 ${tableName} 已存在，执行升级操作`);
        await this.upgradeTableWithConnection(
          connection,
          tableName,
          tableDefinition
        );
      } else {
        logger.info(`表 ${tableName} 不存在，执行创建操作`);
        await this.createTableWithConnection(
          connection,
          tableName,
          tableDefinition
        );
      }

      logger.info(`表 ${tableName} 迁移完成`);
    } catch (error) {
      logger.error(`迁移表 ${tableDefinition.tableName} 失败:`, error);
      throw error;
    }
  }

  /**
   * 迁移时间分表
   */
  private async migrateTimePartitionedTable(
    connection: Sequelize,
    tableDefinition: TableDefinition,
    startDate: Date,
    endDate: Date,
    interval: "month" | "year"
  ): Promise<void> {
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const timeSuffix = this.formatDateForTable(currentDate, interval);
      await this.migrateTableWithConnection(
        connection,
        tableDefinition,
        timeSuffix
      );

      // 移动到下一个时间间隔
      if (interval === "month") {
        currentDate.setMonth(currentDate.getMonth() + 1);
      } else {
        currentDate.setFullYear(currentDate.getFullYear() + 1);
      }
    }
  }

  /**
   * 获取分表后的表名
   */
  private getTableName(baseTableName: string, storeId?: string): string {
    if (storeId) {
      return `${baseTableName}_${storeId}`;
    }
    return baseTableName;
  }

  /**
   * 检查表是否存在（使用指定连接）
   */
  private async tableExistsWithConnection(
    connection: Sequelize,
    tableName: string
  ): Promise<boolean> {
    try {
      logger.info(`检查表 ${tableName} 是否存在...`);

      // 先获取当前数据库名称进行调试
      const [dbNameResult] = await connection.query(
        "SELECT DATABASE() as db_name"
      );
      const currentDb = (dbNameResult as any[])[0]?.db_name;
      logger.info(`当前连接的数据库: ${currentDb}`);

      // 方法1: 使用SHOW TABLES（最直接可靠）
      const [showTablesResults] = await connection.query("SHOW TABLES");
      const tableList = (showTablesResults as any[]).map((row) => {
        // MySQL的SHOW TABLES结果格式为 { 'Tables_in_database_name': 'table_name' }
        const values = Object.values(row);
        return values[0] as string;
      });

      logger.info(`数据库 ${currentDb} 中的所有表:`, tableList);

      // 检查表名（不区分大小写）
      const tableExists = tableList.some(
        (table) => table.toLowerCase() === tableName.toLowerCase()
      );

      logger.info(
        `表 ${tableName} 存在检查结果: ${tableExists ? "存在" : "不存在"}`
      );

      return tableExists;
    } catch (error) {
      logger.error(`检查表 ${tableName} 是否存在时出错:`, error);

      // 备用方法: 尝试直接查询表
      try {
        await connection.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
        logger.info(`通过直接查询确认表 ${tableName} 存在`);
        return true;
      } catch (queryError) {
        logger.info(`直接查询失败，确认表 ${tableName} 不存在`, queryError);
        return false;
      }
    }
  }

  /**
   * 创建新表（使用指定连接）
   */
  private async createTableWithConnection(
    connection: Sequelize,
    tableName: string,
    tableDefinition: TableDefinition
  ): Promise<void> {
    try {
      const columnDefinitions = tableDefinition.columns
        .map((col) => {
          let definition = `${col.name} ${this.getDataType(col)}`;

          if (col.primaryKey) definition += " PRIMARY KEY";
          if (col.autoIncrement) definition += " AUTO_INCREMENT";
          if (!col.allowNull) definition += " NOT NULL";
          if (col.unique) definition += " UNIQUE";
          if (col.defaultValue !== undefined) {
            definition += this.getDefaultValue(col);
          }
          if (col.comment) definition += ` COMMENT '${col.comment}'`;

          return definition;
        })
        .join(", ");

      let createTableSQL = `CREATE TABLE ${tableName} (${columnDefinitions}`;

      // 添加索引
      if (tableDefinition.indexes && tableDefinition.indexes.length > 0) {
        const indexDefinitions = tableDefinition.indexes.map((index) => {
          const unique = index.unique ? "UNIQUE" : "";
          return `${unique} KEY ${index.name} (${index.fields.join(", ")})`;
        });
        createTableSQL += `, ${indexDefinitions.join(", ")}`;
      }

      createTableSQL += ")";

      await connection.query(createTableSQL);
      logger.info(`创建表 ${tableName} 成功`);
    } catch (error) {
      logger.error(`创建表 ${tableName} 失败:`, error);
      throw error;
    }
  }

  /**
   * 统一的表升级方法（支持增删改）
   */
  async upgradeTableWithConnection(
    connection: Sequelize,
    tableName: string,
    tableDefinition: TableDefinition
  ): Promise<void> {
    try {
      logger.info(`开始升级表: ${tableName}`);

      // 检查表是否存在
      const tableExists = await this.tableExistsWithConnection(
        connection,
        tableName
      );

      if (!tableExists) {
        // 如果表不存在，先创建
        logger.info(`表 ${tableName} 不存在，先创建表`);
        await this.createTableWithConnection(
          connection,
          tableName,
          tableDefinition
        );
        return;
      }

      // 表存在，执行升级操作
      logger.info(`表 ${tableName} 存在，执行升级操作`);

      // 获取现有表的列信息
      try {
        const [existingColumnsResult] = await connection.query(
          "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLUMN_COMMENT FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION",
          {
            replacements: [tableName],
            type: "SELECT",
          }
        );

        logger.info(`查询现有列的原始结果类型:`, typeof existingColumnsResult);

        // 确保结果是数组格式
        let existingColumns: any[] = [];
        if (Array.isArray(existingColumnsResult)) {
          existingColumns = existingColumnsResult;
        } else if (
          existingColumnsResult &&
          typeof existingColumnsResult === "object"
        ) {
          existingColumns = Object.values(existingColumnsResult);
        } else {
          logger.warn(`意外的查询结果格式，将作为空数组处理`);
          existingColumns = [];
        }

        const existingColumnNames = existingColumns.map(
          (col) => col.COLUMN_NAME
        );
        const definedColumnNames = tableDefinition.columns.map(
          (col) => col.name
        );

        logger.info(`现有列名列表: [${existingColumnNames.join(", ")}]`);
        logger.info(`定义列名列表: [${definedColumnNames.join(", ")}]`);

        // 1. 删除不再需要的列（但保留主键和特殊列）
        await this.removeUnwantedColumns(
          connection,
          tableName,
          existingColumns,
          definedColumnNames
        );

        // 2. 添加新列
        await this.addMissingColumns(
          connection,
          tableName,
          tableDefinition.columns,
          existingColumnNames
        );

        // 3. 更新现有列的属性（comment、类型、默认值等）
        await this.updateExistingColumns(
          connection,
          tableName,
          existingColumns,
          tableDefinition.columns
        );

        // 4. 同步索引（删除不需要的，添加缺失的）
        await this.synchronizeIndexes(
          connection,
          tableName,
          tableDefinition.indexes || []
        );

        logger.info(`✅ 表 ${tableName} 升级完成`);
      } catch (columnQueryError) {
        logger.error(`查询表 ${tableName} 的列信息失败:`, columnQueryError);

        // 备用方案：使用DESCRIBE命令和单独的comment查询
        try {
          logger.info(`尝试使用DESCRIBE命令获取列信息...`);
          const [describeResult] = await connection.query(
            `DESCRIBE ${tableName}`
          );

          let columns: any[] = [];
          if (Array.isArray(describeResult)) {
            columns = describeResult;
          } else {
            columns = Object.values(describeResult);
          }

          // 获取comment信息（DESCRIBE不包含comment，需要单独查询）
          logger.info(`单独查询comment信息...`);
          try {
            const [commentResult] = await connection.query(
              "SELECT COLUMN_NAME, COLUMN_COMMENT FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?",
              { replacements: [tableName] }
            );

            let commentData: any[] = [];
            if (Array.isArray(commentResult)) {
              commentData = commentResult;
            } else if (commentResult && typeof commentResult === "object") {
              commentData = Object.values(commentResult);
            }

            // 将comment信息合并到columns中
            for (const col of columns) {
              const commentInfo = commentData.find(
                (c) => c.COLUMN_NAME === col.Field
              );
              col.COLUMN_COMMENT = commentInfo
                ? commentInfo.COLUMN_COMMENT
                : "";
            }

            logger.info(`成功获取并合并comment信息`);
          } catch (commentError) {
            logger.warn(
              `获取comment信息失败，将跳过comment更新:`,
              commentError
            );
            // 如果comment查询失败，给所有列添加空comment
            for (const col of columns) {
              col.COLUMN_COMMENT = "";
            }
          }

          const existingColumnNames = columns.map((col) => col.Field);
          const definedColumnNames = tableDefinition.columns.map(
            (col) => col.name
          );

          logger.info(
            `通过DESCRIBE获取的列名: [${existingColumnNames.join(", ")}]`
          );

          // 删除不再需要的列
          await this.removeUnwantedColumns(
            connection,
            tableName,
            columns,
            definedColumnNames
          );

          // 添加新列
          await this.addMissingColumns(
            connection,
            tableName,
            tableDefinition.columns,
            existingColumnNames
          );

          // 更新现有列的属性
          await this.updateExistingColumns(
            connection,
            tableName,
            columns,
            tableDefinition.columns
          );

          // 同步索引
          await this.synchronizeIndexes(
            connection,
            tableName,
            tableDefinition.indexes || []
          );
        } catch (describeError) {
          logger.error(`DESCRIBE命令也失败了:`, describeError);
          throw new Error(
            `无法获取表 ${tableName} 的列信息: ${
              (columnQueryError as Error).message || "未知错误"
            }`
          );
        }
      }
    } catch (error) {
      logger.error(`升级表 ${tableName} 时出错:`, error);
      throw error;
    }
  }

  /**
   * 删除不再需要的列
   */
  private async removeUnwantedColumns(
    connection: Sequelize,
    tableName: string,
    existingColumns: any[],
    definedColumnNames: string[]
  ): Promise<void> {
    logger.info(`🗑️ 检查需要删除的列...`);

    for (const existingCol of existingColumns) {
      const columnName = existingCol.COLUMN_NAME || existingCol.Field;
      const columnKey = existingCol.COLUMN_KEY || existingCol.Key;

      // 跳过主键列，避免误删
      if (columnKey === "PRI" || columnKey === "PRIMARY") {
        logger.info(`跳过主键列: ${columnName}`);
        continue;
      }

      // 如果列在新定义中不存在，则删除
      if (!definedColumnNames.includes(columnName)) {
        try {
          logger.info(`🗑️ 删除不再需要的列: ${columnName}`);
          const dropSQL = `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`;
          logger.info(`执行SQL: ${dropSQL}`);
          await connection.query(dropSQL);
          logger.info(`✅ 成功删除列: ${columnName}`);
        } catch (error) {
          logger.error(`❌ 删除列 ${columnName} 失败:`, error);
          // 删除列失败不中断迁移，继续处理其他列
        }
      } else {
        logger.info(`✓ 列 ${columnName} 在新定义中存在，保留`);
      }
    }
  }

  /**
   * 添加缺失的列
   */
  private async addMissingColumns(
    connection: Sequelize,
    tableName: string,
    definedColumns: ColumnDefinition[],
    existingColumnNames: string[]
  ): Promise<void> {
    logger.info(`➕ 检查需要添加的新列...`);

    for (const column of definedColumns) {
      if (!existingColumnNames.includes(column.name)) {
        logger.info(`➕ 发现新列，准备添加: ${column.name}`);
        await this.addColumnWithConnection(connection, tableName, column);
      } else {
        logger.info(`✓ 列 ${column.name} 已存在，跳过添加`);
      }
    }
  }

  /**
   * 更新现有列的属性（comment、类型、默认值等）
   */
  private async updateExistingColumns(
    connection: Sequelize,
    tableName: string,
    existingColumns: any[],
    definedColumns: ColumnDefinition[]
  ): Promise<void> {
    logger.info(`🔄 检查需要更新属性的列...`);

    for (const definedColumn of definedColumns) {
      // 找到对应的现有列
      const existingColumn = existingColumns.find(
        (col) => (col.COLUMN_NAME || col.Field) === definedColumn.name
      );

      if (!existingColumn) {
        // 列不存在，跳过（应该已经在addMissingColumns中处理了）
        continue;
      }

      const columnName = existingColumn.COLUMN_NAME || existingColumn.Field;

      // 详细调试信息：显示原始数据
      logger.info(`🔍 检查列 ${columnName} 的现有属性:`);
      logger.info(`  - COLUMN_COMMENT: "${existingColumn.COLUMN_COMMENT}"`);
      logger.info(`  - Comment: "${existingColumn.Comment}"`);
      logger.info(
        `  - 原始对象keys: [${Object.keys(existingColumn).join(", ")}]`
      );

      // 获取当前comment，处理NULL和undefined情况
      let currentComment =
        existingColumn.COLUMN_COMMENT || existingColumn.Comment;
      if (currentComment === null || currentComment === undefined) {
        currentComment = "";
      } else {
        currentComment = String(currentComment).trim(); // 去除前后空格
      }

      const currentType = existingColumn.DATA_TYPE || existingColumn.Type || "";
      const currentNullable =
        (
          existingColumn.IS_NULLABLE ||
          existingColumn.Null ||
          "YES"
        ).toUpperCase() === "YES";
      const currentDefault =
        existingColumn.COLUMN_DEFAULT || existingColumn.Default;

      logger.info(`  - 最终currentComment: "${currentComment}"`);
      logger.info(`  - 期望comment: "${definedColumn.comment || ""}"`);

      // 检查是否需要更新
      let needsUpdate = false;
      const updateReasons: string[] = [];

      // 检查comment（标准化比较）
      const expectedComment = (definedColumn.comment || "").trim();
      if (currentComment !== expectedComment) {
        needsUpdate = true;
        updateReasons.push(
          `comment: "${currentComment}" → "${expectedComment}"`
        );
      }

      // 检查nullable
      const expectedNullable = definedColumn.allowNull !== false;
      if (currentNullable !== expectedNullable) {
        needsUpdate = true;
        updateReasons.push(
          `nullable: ${currentNullable} → ${expectedNullable}`
        );
      }

      // 检查默认值（简单比较）
      const expectedDefault = definedColumn.defaultValue;
      if (expectedDefault !== undefined && currentDefault !== expectedDefault) {
        needsUpdate = true;
        updateReasons.push(
          `default: "${currentDefault}" → "${expectedDefault}"`
        );
      }

      // 检查数据类型（简化的类型检查）
      const expectedDataType = this.getDataType(definedColumn).toUpperCase();
      const normalizedCurrentType = this.normalizeDataType(currentType);
      const normalizedExpectedType = this.normalizeDataType(expectedDataType);

      if (normalizedCurrentType !== normalizedExpectedType) {
        needsUpdate = true;
        updateReasons.push(
          `type: ${normalizedCurrentType} → ${normalizedExpectedType}`
        );
      }

      if (needsUpdate) {
        try {
          logger.info(
            `🔄 更新列 ${columnName} 的属性: ${updateReasons.join(", ")}`
          );

          // 构建ALTER COLUMN语句
          let alterSQL = `ALTER TABLE ${tableName} MODIFY COLUMN ${
            definedColumn.name
          } ${this.getDataType(definedColumn)}`;

          if (!definedColumn.allowNull) {
            alterSQL += " NOT NULL";
          } else {
            alterSQL += " NULL";
          }

          if (definedColumn.unique) {
            alterSQL += " UNIQUE";
          }

          if (definedColumn.defaultValue !== undefined) {
            alterSQL += this.getDefaultValue(definedColumn);
          }

          if (definedColumn.comment) {
            alterSQL += ` COMMENT '${definedColumn.comment}'`;
          }

          logger.info(`执行SQL: ${alterSQL}`);
          await connection.query(alterSQL);
          logger.info(`✅ 成功更新列 ${columnName} 的属性`);
        } catch (error) {
          logger.error(`❌ 更新列 ${columnName} 属性失败:`, error);
          // 更新列属性失败不中断迁移，继续处理其他列
        }
      } else {
        logger.info(`✓ 列 ${columnName} 的属性无需更新`);
      }
    }
  }

  /**
   * 标准化数据类型，用于比较
   */
  private normalizeDataType(dataType: string): string {
    if (!dataType) return "";

    return dataType
      .toUpperCase()
      .replace(/\([^)]*\)/g, "") // 移除括号中的长度/精度信息
      .replace(/\s+/g, " ") // 标准化空格
      .trim();
  }

  /**
   * 同步索引（删除不需要的，添加缺失的）
   */
  private async synchronizeIndexes(
    connection: Sequelize,
    tableName: string,
    definedIndexes: Array<{ name: string; fields: string[]; unique?: boolean }>
  ): Promise<void> {
    try {
      logger.info(`🔄 开始同步表 ${tableName} 的索引...`);

      // 获取现有索引
      const [showIndexResult] = await connection.query(
        `SHOW INDEX FROM ${tableName}`
      );

      let indexData: any[] = [];
      if (Array.isArray(showIndexResult)) {
        indexData = showIndexResult;
      } else if (showIndexResult && typeof showIndexResult === "object") {
        indexData = Object.values(showIndexResult);
      }

      // 提取现有索引名（去重，排除主键）
      const existingIndexNames = [
        ...new Set(
          indexData
            .filter((idx) => idx.Key_name !== "PRIMARY")
            .map((idx) => idx.Key_name)
        ),
      ];

      const definedIndexNames = definedIndexes.map((idx) => idx.name);

      logger.info(`现有索引: [${existingIndexNames.join(", ")}]`);
      logger.info(`定义索引: [${definedIndexNames.join(", ")}]`);

      // 1. 删除不再需要的索引
      for (const existingIndexName of existingIndexNames) {
        if (!definedIndexNames.includes(existingIndexName)) {
          try {
            logger.info(`🗑️ 删除不再需要的索引: ${existingIndexName}`);
            const dropSQL = `DROP INDEX ${existingIndexName} ON ${tableName}`;
            logger.info(`执行SQL: ${dropSQL}`);
            await connection.query(dropSQL);
            logger.info(`✅ 成功删除索引: ${existingIndexName}`);
          } catch (error) {
            logger.error(`❌ 删除索引 ${existingIndexName} 失败:`, error);
            // 删除索引失败不中断迁移
          }
        } else {
          logger.info(`✓ 索引 ${existingIndexName} 在新定义中存在，保留`);
        }
      }

      // 2. 添加缺失的索引
      for (const index of definedIndexes) {
        const indexExists = existingIndexNames.some(
          (existingName) =>
            existingName.toLowerCase() === index.name.toLowerCase()
        );

        if (!indexExists) {
          try {
            logger.info(`➕ 添加新索引: ${index.name}`);
            const unique = index.unique ? "UNIQUE" : "";
            const sql = `CREATE ${unique} INDEX ${
              index.name
            } ON ${tableName} (${index.fields.join(", ")})`;
            logger.info(`执行SQL: ${sql}`);
            await connection.query(sql);
            logger.info(`✅ 成功创建索引: ${index.name}`);
          } catch (indexError) {
            logger.warn(`⚠️ 创建索引 ${index.name} 失败:`, indexError);

            if (indexError instanceof Error) {
              const errorMessage = indexError.message.toLowerCase();
              if (
                errorMessage.includes("duplicate key name") ||
                errorMessage.includes("already exists") ||
                errorMessage.includes("duplicate index name")
              ) {
                logger.info(`索引 ${index.name} 实际上已存在，跳过创建`);
              }
            }
          }
        } else {
          logger.info(`✓ 索引 ${index.name} 已存在，跳过创建`);
        }
      }

      logger.info(`✅ 表 ${tableName} 索引同步完成`);
    } catch (error) {
      logger.error(`同步表 ${tableName} 索引时出错:`, error);
      logger.warn(`⚠️ 索引同步失败，但表迁移继续进行`);
    }
  }

  /**
   * 添加列（使用指定连接）
   */
  private async addColumnWithConnection(
    connection: Sequelize,
    tableName: string,
    column: ColumnDefinition
  ): Promise<void> {
    try {
      const columnDefinition = `${column.name} ${this.getDataType(column)}`;
      let alterSQL = `ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`;

      if (!column.allowNull) alterSQL += " NOT NULL";
      if (column.unique) alterSQL += " UNIQUE";
      if (column.defaultValue !== undefined) {
        alterSQL += this.getDefaultValue(column);
      }
      if (column.comment) alterSQL += ` COMMENT '${column.comment}'`;

      logger.info(`执行SQL: ${alterSQL}`);
      await connection.query(alterSQL);
      logger.info(`为表 ${tableName} 添加列 ${column.name} 成功`);
    } catch (error) {
      logger.error(`为表 ${tableName} 添加列 ${column.name} 失败:`, error);
      // 检查是否是列已存在的错误
      if (
        error instanceof Error &&
        error.message.includes("Duplicate column name")
      ) {
        logger.warn(`列 ${column.name} 已存在，跳过添加`);
        return;
      }
      throw error;
    }
  }

  /**
   * 获取数据类型字符串
   */
  private getDataType(column: ColumnDefinition): string {
    let type = column.type.toUpperCase();

    if (column.length) {
      type += `(${column.length})`;
    }

    return type;
  }

  /**
   * 处理默认值
   */
  private getDefaultValue(column: ColumnDefinition): string {
    if (column.defaultValue === undefined) {
      return "";
    }

    // 特殊处理TIMESTAMP类型的默认值
    if (column.type.toUpperCase() === "TIMESTAMP") {
      if (column.defaultValue === "CURRENT_TIMESTAMP") {
        return " DEFAULT CURRENT_TIMESTAMP";
      } else if (
        column.defaultValue === "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
      ) {
        return " DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP";
      }
    }

    // 处理其他类型的默认值
    if (typeof column.defaultValue === "string") {
      return ` DEFAULT '${column.defaultValue}'`;
    } else {
      return ` DEFAULT ${column.defaultValue}`;
    }
  }

  /**
   * 格式化日期用于表名
   */
  private formatDateForTable(date: Date, interval: "month" | "year"): string {
    if (interval === "month") {
      return `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
    } else {
      return `${date.getFullYear()}`;
    }
  }

  /**
   * 关闭所有数据库连接
   */
  async closeAllConnections(): Promise<void> {
    await this.connectionManager.closeAllConnections();
  }

  /**
   * 获取连接统计信息
   */
  getConnectionStats(): { total: number; connections: string[] } {
    return this.connectionManager.getConnectionStats();
  }
}

export default DatabaseMigrationService;
