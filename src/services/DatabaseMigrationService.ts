import { Sequelize } from "sequelize";
import TableSchema from "@/models/TableSchema";
import Enterprise from "@/models/Enterprise";
import MigrationHistory from "@/models/MigrationHistory";
import DatabaseConnectionManager from "./DatabaseConnectionManager";
import MigrationVersionService from "./MigrationVersionService";
import logger from "@/utils/logger";
import { v4 as uuidv4 } from "uuid";
import { QueryTypes } from "sequelize";

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
  // ENUM和SET类型专用字段
  values?: string[]; // ENUM/SET的枚举值，如 ['value1', 'value2', 'value3']
  // 可扩展字段（保持向后兼容）
  precision?: number; // DECIMAL/NUMERIC的精度
  scale?: number; // DECIMAL/NUMERIC的小数位数
}

interface TableDefinition {
  tableName: string;
  action?: "DROP"; // 迁移动作：只有删除需要显式指定
  columns: ColumnDefinition[];
  indexes?: Array<{
    name: string;
    fields: string[];
    unique?: boolean;
  }>;
}

export class DatabaseMigrationService {
  private connectionManager: DatabaseConnectionManager;
  private currentMigrationBatch: string = "";
  private currentSchema: TableSchema | null = null;
  private currentEnterpriseId: number = 0;

  constructor() {
    this.connectionManager = new DatabaseConnectionManager();
  }

  /**
   * 记录SQL执行历史
   */
  private async recordSqlExecution(
    tableName: string,
    databaseType: string,
    partitionType: string,
    schemaVersion: string,
    migrationType: "CREATE" | "ALTER" | "DROP" | "INDEX",
    sqlStatement: string,
    executionStatus: "SUCCESS" | "FAILED",
    executionTime: number,
    enterpriseId: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      const migrationData: any = {
        table_name: tableName,
        database_type: databaseType as "main" | "log" | "order" | "static",
        partition_type: partitionType as "store" | "time" | "none",
        schema_version: schemaVersion,
        migration_type: migrationType,
        sql_statement: sqlStatement,
        execution_status: executionStatus,
        execution_time: executionTime,
        migration_batch: this.currentMigrationBatch,
        enterprise_id: enterpriseId,
      };

      if (errorMessage) {
        migrationData.error_message = errorMessage;
      }

      await MigrationHistory.create(migrationData);
    } catch (error) {
      logger.error("记录SQL执行历史失败:", error);
      // 不抛出错误，避免影响主要迁移流程
    }
  }

  /**
   * 执行SQL并记录历史
   */
  private async executeAndRecordSql(
    connection: Sequelize,
    tableName: string,
    databaseType: string,
    partitionType: string,
    schemaVersion: string,
    migrationType: "CREATE" | "ALTER" | "DROP" | "INDEX",
    sqlStatement: string
  ): Promise<void> {
    const startTime = Date.now();
    let executionStatus: "SUCCESS" | "FAILED" = "SUCCESS";
    let errorMessage: string | undefined;

    try {
      await connection.query(sqlStatement);
    } catch (error) {
      executionStatus = "FAILED";
      errorMessage = error instanceof Error ? error.message : "未知错误";
      logger.error(`SQL执行失败: ${sqlStatement.substring(0, 100)}...`, error);
      throw error; // 重新抛出错误，保持原有错误处理逻辑
    } finally {
      const executionTime = Date.now() - startTime;
      await this.recordSqlExecution(
        tableName,
        databaseType,
        partitionType,
        schemaVersion,
        migrationType,
        sqlStatement,
        executionStatus,
        executionTime,
        this.currentEnterpriseId,
        errorMessage
      );
    }
  }

  /**
   * 统一的表迁移方法
   * 通过表名、数据库类型、分区类型和版本号来确定操作类型
   * @param tableName 表名
   * @param databaseType 数据库类型
   * @param schemaVersion 版本号（可选，默认最新版本）
   * @param partitionType 分区类型（可选，自动检测）
   * @param enterpriseId 企业ID（可选，指定特定企业进行迁移）
   */
  async migrateTable(
    tableName: string,
    databaseType: string,
    schemaVersion?: string,
    partitionType?: string,
    enterpriseId?: number
  ): Promise<void> {
    try {
      // 生成迁移批次ID
      this.currentMigrationBatch = `${tableName}_${databaseType}_${Date.now()}_${uuidv4().substring(
        0,
        8
      )}`;

      logger.info(
        `🚀 开始迁移表: ${tableName}, 数据库类型: ${databaseType}, 分区类型: ${
          partitionType || "自动检测"
        }, 版本: ${schemaVersion || "最新"}, 批次: ${
          this.currentMigrationBatch
        }`
      );

      // 获取表结构定义
      let schema: TableSchema | null;
      if (partitionType) {
        // 如果指定了分区类型，精确查找
        schema = await this.getTableSchema(
          tableName,
          databaseType,
          partitionType,
          schemaVersion
        );
      } else {
        // 如果没有指定分区类型，自动检测
        schema = await this.getTableSchemaWithAutoPartition(
          tableName,
          databaseType,
          schemaVersion
        );
      }

      if (!schema) {
        const partitionMsg = partitionType
          ? `, partition_type: ${partitionType}`
          : "";
        throw new Error(
          `未找到表结构定义: ${tableName} (database_type: ${databaseType}${partitionMsg})`
        );
      }

      // 获取需要迁移的企业
      let enterprises: Enterprise[];
      if (enterpriseId) {
        // 指定特定企业
        const targetEnterprise = await Enterprise.findOne({
          where: {
            enterprise_id: enterpriseId,
            status: 1,
          },
        });

        if (!targetEnterprise) {
          throw new Error(`未找到企业ID为 ${enterpriseId} 的有效企业`);
        }

        enterprises = [targetEnterprise];
        logger.info(
          `🎯 指定企业迁移: ${targetEnterprise.enterprise_name} (ID: ${enterpriseId})`
        );
      } else {
        // 获取所有企业
        enterprises = await Enterprise.findAll({
          where: { status: 1 },
        });
        logger.info(`🌍 全企业迁移: 共 ${enterprises.length} 个企业`);
      }

      let successCount = 0;
      let failedCount = 0;

      for (const enterprise of enterprises) {
        try {
          await this.migrateTableForEnterprise(enterprise, schema);
          successCount++;
          logger.info(
            `✅ 企业 ${enterprise.enterprise_name} (ID: ${enterprise.enterprise_id}) 迁移成功`
          );
        } catch (error) {
          failedCount++;
          logger.error(
            `❌ 企业 ${enterprise.enterprise_name} (ID: ${enterprise.enterprise_id}) 迁移失败:`,
            error
          );
        }
      }

      const migrationScope = enterpriseId ? "指定企业" : "全企业";
      logger.info(
        `🏁 ${migrationScope}迁移完成: 成功 ${successCount} 个企业，失败 ${failedCount} 个企业`
      );
    } catch (error) {
      logger.error(`迁移表 ${tableName} 失败:`, error);
      throw error;
    }
  }

  /**
   * 获取表结构定义（包含分区类型）
   */
  private async getTableSchema(
    tableName: string,
    databaseType: string,
    partitionType: string,
    schemaVersion?: string
  ): Promise<TableSchema | null> {
    const whereCondition: any = {
      table_name: tableName,
      database_type: databaseType,
      partition_type: partitionType,
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
   * 获取表结构定义（自动检测分区类型，向后兼容）
   */
  private async getTableSchemaWithAutoPartition(
    tableName: string,
    databaseType: string,
    schemaVersion?: string
  ): Promise<TableSchema | null> {
    // 首先尝试查找所有匹配的表定义
    const whereCondition: any = {
      table_name: tableName,
      database_type: databaseType,
      is_active: true,
    };

    if (schemaVersion) {
      whereCondition.schema_version = schemaVersion;
    }

    const schemas = await TableSchema.findAll({
      where: whereCondition,
      order: [
        ["partition_type", "ASC"],
        ["schema_version", "DESC"],
      ],
    });

    if (schemas.length === 0) {
      return null;
    }

    // 如果只有一个分区类型，直接返回
    const uniquePartitionTypes = [
      ...new Set(schemas.map((s) => s.partition_type)),
    ];
    if (uniquePartitionTypes.length === 1) {
      return schemas[0] || null;
    }

    // 如果有多个分区类型，优先返回 'none' 类型（向后兼容）
    const nonePartitionSchema = schemas.find(
      (s) => s.partition_type === "none"
    );
    if (nonePartitionSchema) {
      logger.warn(
        `表 ${tableName} (${databaseType}) 存在多种分区类型 [${uniquePartitionTypes.join(
          ", "
        )}]，自动选择 'none' 类型`
      );
      return nonePartitionSchema;
    }

    // 如果没有 'none' 类型，返回第一个（按字母排序）
    const firstSchema = schemas[0];
    if (firstSchema) {
      logger.warn(
        `表 ${tableName} (${databaseType}) 存在多种分区类型 [${uniquePartitionTypes.join(
          ", "
        )}]，自动选择第一个: ${firstSchema.partition_type}`
      );
      return firstSchema;
    }

    return null;
  }

  /**
   * 为单个企业迁移表
   */
  private async migrateTableForEnterprise(
    enterprise: Enterprise,
    schema: TableSchema
  ): Promise<void> {
    try {
      // 设置当前处理的schema，用于SQL记录
      this.currentSchema = schema;

      const tableDefinition = JSON.parse(
        schema.schema_definition
      ) as TableDefinition;

      // 获取对应数据库类型的连接
      const connection = await this.connectionManager.getConnection(
        enterprise,
        schema.database_type
      );

      // 根据分区类型处理
      if (schema.partition_type === "store") {
        // 门店分表逻辑 - 查询企业的所有门店并为每个门店创建分表
        await this.migrateStorePartitionedTable(
          connection,
          tableDefinition,
          enterprise,
          schema
        );
      } else if (schema.partition_type === "time") {
        // 时间分表逻辑 - 使用配置的时间分区设置
        await this.migrateTimePartitionedTableWithConfig(
          connection,
          tableDefinition,
          schema,
          enterprise
        );
      } else {
        await this.migrateTableWithConnection(connection, tableDefinition, enterprise.enterprise_id, undefined, schema);
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
    } finally {
      // 清理当前schema
      this.currentSchema = null;
    }
  }

  /**
   * 使用指定连接迁移表（统一的创建/升级/删除逻辑）
   */
  private async migrateTableWithConnection(
    connection: Sequelize,
    tableDefinition: TableDefinition,
    enterpriseId: number,
    storeId?: string,
    schema?: TableSchema
  ): Promise<void> {
    try {
      // 验证并设置当前企业ID
      if (enterpriseId === undefined) {
        throw new Error(`企业ID是必填参数，不能为空`);
      }
      
      this.currentEnterpriseId = enterpriseId;
      
      const tableName = this.getTableName(tableDefinition.tableName, storeId);
      
      // 如果提供了schema信息，进行版本检查
      if (schema) {
        const needsMigration = await MigrationVersionService.shouldMigrate(
          tableName, // 使用实际的完整表名（包含后缀）
          schema.database_type,
          schema.schema_version,
          enterpriseId,
          schema.partition_type,
          schema.time_interval || undefined
        );

        if (!needsMigration) {
          logger.info(`⏭️ 企业 ${enterpriseId} 表 ${tableName} 已经是版本 ${schema.schema_version}，跳过迁移`);
          return;
        }
      }

      logger.info(`🚀 开始迁移表:`);
      logger.info(`   - 原始表名: ${tableDefinition.tableName}`);
      logger.info(`   - 后缀ID: ${storeId || "none"}`);
      logger.info(`   - 最终表名: ${tableName}`);
      logger.info(`   - 迁移动作: ${tableDefinition.action || "自动检测"}`);
      if (schema) {
        logger.info(`   - 目标版本: ${schema.schema_version}`);
      }

      // 检查是否是删除操作
      if (tableDefinition.action === "DROP") {
        logger.info(`🗑️ 执行删除表操作: ${tableName}`);
        await this.dropTableWithConnection(connection, tableName);
        // 记录删除操作的版本
        if (schema) {
          await MigrationVersionService.recordMigrationVersion(
            tableName, // 使用实际的完整表名（包含后缀）
            schema.database_type,
            schema.schema_version,
            enterpriseId,
            schema.partition_type,
            schema.time_interval || undefined
          );
        }
        return;
      }

      // 检查表是否存在
      const tableExists = await this.tableExistsWithConnection(
        connection,
        tableName
      );

      if (tableExists) {
        await this.upgradeTableWithConnection(
          connection,
          tableName,
          tableDefinition
        );
      } else {
        logger.info(`➕ 表 ${tableName} 不存在，执行创建操作`);
        await this.createTableWithConnection(
          connection,
          tableName,
          tableDefinition
        );
      }

      // 记录成功的迁移版本
      if (schema) {
        await MigrationVersionService.recordMigrationVersion(
          tableName, // 使用实际的完整表名（包含后缀）
          schema.database_type,
          schema.schema_version,
          enterpriseId,
          schema.partition_type,
          schema.time_interval || undefined
        );
      }

    } catch (error) {
      logger.error(
        `❌ 迁移表 ${tableDefinition.tableName} (最终表名: ${this.getTableName(
          tableDefinition.tableName,
          storeId
        )}) 失败:`,
        error
      );
      throw error;
    }
  }

  /**
   * 根据配置迁移时间分表
   */
  private async migrateTimePartitionedTableWithConfig(
    connection: Sequelize,
    tableDefinition: TableDefinition,
    schema: TableSchema,
    enterprise: Enterprise
  ): Promise<void> {
    // 获取时间分区配置
    const interval = schema.time_interval || "month";

    // 使用企业创建时间作为开始时间，如果企业没有创建时间则使用当前时间
    const startDate = enterprise.create_time || new Date();

    // 结束时间固定为当前时间，确保至少包含当前时间的分区
    const endDate = new Date();

    logger.info(`🕒 开始时间分区表迁移:`);
    logger.info(
      `   - 企业: ${enterprise.enterprise_name} (${enterprise.enterprise_id})`
    );
    logger.info(
      `   - 企业创建时间: ${enterprise.create_time?.toISOString() || "未设置"}`
    );
    logger.info(`   - 分区间隔: ${interval}`);
    logger.info(`   - 开始时间: ${startDate.toISOString()}`);
    logger.info(`   - 结束时间: ${endDate.toISOString()}`);
    logger.info(`   - 时间格式: ${schema.time_format || "自动"}`);

    await this.migrateTimePartitionedTable(
      connection,
      tableDefinition,
      startDate,
      endDate,
      interval,
      enterprise.enterprise_id,
      schema.time_format,
      schema
    );
  }

  /**
   * 迁移门店分表
   */
  private async migrateStorePartitionedTable(
    connection: Sequelize,
    tableDefinition: TableDefinition,
    enterprise: Enterprise,
    schema?: TableSchema
  ): Promise<void> {
    try {
      logger.info(`🏪 开始门店分表迁移:`);
      logger.info(
        `   - 企业: ${enterprise.enterprise_name} (${enterprise.enterprise_id})`
      );

      // 从企业主数据库查询所有门店
      const mainConnection = await this.connectionManager.getConnection(
        enterprise,
        "main"
      );

      const stores = await this.queryStoreList(mainConnection);

      if (stores.length === 0) {
        logger.warn(
          `   ⚠️ 企业 ${enterprise.enterprise_name} 没有找到任何门店，跳过门店分表`
        );
        return;
      }

      logger.info(`   - 找到 ${stores.length} 个门店，开始创建分表`);

      for (const store of stores) {
        const storeId = store.store_id || store.id;
        await this.migrateTableWithConnection(
          connection,
          tableDefinition,
          enterprise.enterprise_id,
          storeId.toString(),
          schema
        );

        logger.info(
          `   ✅ 已创建门店分表: ${
            tableDefinition.tableName
          }${storeId} (门店: ${store.store_name || store.name || storeId})`
        );
      }

    } catch (error) {
      logger.error(`门店分表迁移失败:`, error);
      throw error;
    }
  }

  /**
   * 查询门店列表
   */
  private async queryStoreList(connection: Sequelize): Promise<any[]> {
    try {
      // 尝试不同的门店表名

      const [results] = await connection.query(
        `SELECT store_id,store_name FROM qc_store WHERE status = 1`
      );

      if (Array.isArray(results) && results.length > 0) {
        logger.info(`   - 从表 qc_store 查询到 ${results.length} 个门店`);
        return results;
      }

      // 如果所有常见表名都不存在，抛出错误
      throw new Error(`未找到门店表`);
    } catch (error) {
      logger.error(`查询门店列表失败:`, error);
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
    interval: "day" | "month" | "year",
    enterpriseId: number,
    timeFormat?: string,
    schema?: TableSchema
  ): Promise<void> {
    const currentDate = new Date(startDate);

    // 修改循环条件：确保至少执行一次，即使开始时间和结束时间相同
    do {
      const timeSuffix = this.formatDateForTable(
        currentDate,
        interval,
        timeFormat
      );
      await this.migrateTableWithConnection(
        connection,
        tableDefinition,
        enterpriseId,
        timeSuffix,
        schema
      );

      // 移动到下一个时间间隔
      if (interval === "day") {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (interval === "month") {
        currentDate.setMonth(currentDate.getMonth() + 1);
      } else {
        currentDate.setFullYear(currentDate.getFullYear() + 1);
      }
    } while (currentDate <= endDate);
  }

  /**
   * 获取分表后的表名
   */
  private getTableName(baseTableName: string, suffix?: string): string {
    if (suffix) {
      return `${baseTableName}${suffix}`;
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
        await connection.query(`SELECT 1 FROM \`${tableName}\` LIMIT 1`);
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
    tableDefinition: TableDefinition,
    databaseType?: string,
    partitionType?: string,
    schemaVersion?: string
  ): Promise<void> {
    try {
      // 先检查主键列的情况
      const primaryKeyColumns = tableDefinition.columns.filter(
        (col) => col.primaryKey
      );
      const hasSinglePrimaryKey = primaryKeyColumns.length === 1;
      const hasCompositePrimaryKey = primaryKeyColumns.length > 1;

      const columnDefinitions = tableDefinition.columns
        .map((col) => {
          let definition = `\`${col.name}\` ${this.getDataType(col)}`;

          // 只有单个主键时才在列定义中添加PRIMARY KEY
          if (col.primaryKey && hasSinglePrimaryKey)
            definition += " PRIMARY KEY";
          if (col.autoIncrement) definition += " AUTO_INCREMENT";
          if (col.allowNull === false) definition += " NOT NULL";
          if (col.unique) definition += " UNIQUE";

          // 处理默认值
          if (col.defaultValue !== undefined) {
            definition += this.getDefaultValue(col);
          }

          if (col.comment)
            definition += ` COMMENT '${this.escapeComment(col.comment)}'`;

          return definition;
        })
        .join(", ");

      let createTableSQL = `CREATE TABLE \`${tableName}\` (${columnDefinitions}`;

      // 如果有复合主键，添加复合主键约束
      if (hasCompositePrimaryKey) {
        const primaryKeyFields = primaryKeyColumns
          .map((col) => `\`${col.name}\``)
          .join(", ");
        createTableSQL += `, PRIMARY KEY (${primaryKeyFields})`;
      }

      // 添加索引
      if (tableDefinition.indexes && tableDefinition.indexes.length > 0) {
        const indexDefinitions = tableDefinition.indexes.map((index) => {
          const unique = index.unique ? "UNIQUE" : "";
          const fields = index.fields.map((field) => `\`${field}\``).join(", ");
          return `${unique} KEY \`${index.name}\` (${fields})`;
        });
        createTableSQL += `, ${indexDefinitions.join(", ")}`;
      }

      createTableSQL += ")";

      // 如果有数据库类型等信息，记录SQL执行历史
      if (databaseType && partitionType && schemaVersion) {
        await this.executeAndRecordSql(
          connection,
          tableName,
          databaseType,
          partitionType,
          schemaVersion,
          "CREATE",
          createTableSQL
        );
      } else if (this.currentSchema) {
        // 使用当前schema信息记录SQL
        await this.executeAndRecordSql(
          connection,
          tableName,
          this.currentSchema.database_type,
          this.currentSchema.partition_type,
          this.currentSchema.schema_version,
          "CREATE",
          createTableSQL
        );
      } else {
        // 向后兼容，直接执行SQL
        await connection.query(createTableSQL);
      }
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
          tableDefinition.indexes || [],
          tableDefinition
        );
      } catch (columnQueryError) {
        logger.error(`查询表 ${tableName} 的列信息失败:`, columnQueryError);

        // 备用方案：使用DESCRIBE命令和单独的comment查询
        try {
          logger.info(`尝试使用DESCRIBE命令获取列信息...`);
          const [describeResult] = await connection.query(
            `DESCRIBE \`${tableName}\``
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
            tableDefinition.indexes || [],
            tableDefinition
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
          const dropSQL = `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``;
          logger.info(`执行SQL: ${dropSQL}`);

          // 记录SQL执行历史
          if (this.currentSchema) {
            await this.executeAndRecordSql(
              connection,
              tableName,
              this.currentSchema.database_type,
              this.currentSchema.partition_type,
              this.currentSchema.schema_version,
              "ALTER",
              dropSQL
            );
          } else {
            await connection.query(dropSQL);
          }
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
      const currentKey = existingColumn.COLUMN_KEY || existingColumn.Key || "";
      const currentExtra = existingColumn.EXTRA || existingColumn.Extra || "";

      // 判断是否为主键和自增
      const currentIsPrimaryKey = currentKey.toUpperCase() === "PRI";
      const currentIsAutoIncrement = currentExtra
        .toUpperCase()
        .includes("AUTO_INCREMENT");

      logger.info(`  - 最终currentComment: "${currentComment}"`);
      logger.info(`  - 期望comment: "${definedColumn.comment || ""}"`);

      // 检查是否需要更新
      let needsUpdate = false;
      const updateReasons: string[] = [];

      // 检查comment（标准化比较，处理转义字符）
      const expectedComment = (definedColumn.comment || "").trim();
      const normalizedCurrentComment = this.normalizeComment(currentComment);
      const normalizedExpectedComment = this.normalizeComment(expectedComment);

      if (normalizedCurrentComment !== normalizedExpectedComment) {
        needsUpdate = true;
        updateReasons.push(
          `comment: "${currentComment}" → "${expectedComment}"`
        );
      }

      // 检查nullable - 直接使用TableSchema中明确设置的allowNull值
      // SchemaDetectionService已经明确设置了allowNull为true/false，不需要默认值推断
      const expectedNullable = definedColumn.allowNull === true;

      if (currentNullable !== expectedNullable) {
        needsUpdate = true;
        updateReasons.push(
          `nullable: ${currentNullable} → ${expectedNullable}`
        );
      }

      // 检查默认值（智能比较）
      const expectedDefault = definedColumn.defaultValue;

      // 只有当明确设置了defaultValue时才进行比较
      if (expectedDefault !== undefined) {
        // 标准化当前默认值和期望默认值
        const normalizedCurrent = this.normalizeDefaultValue(currentDefault);
        const normalizedExpected = this.normalizeDefaultValue(expectedDefault);

        if (normalizedCurrent !== normalizedExpected) {
          needsUpdate = true;
          updateReasons.push(
            `default: "${currentDefault}" (${typeof currentDefault}) → "${expectedDefault}" (${typeof expectedDefault})`
          );
        }
      }

      // 检查数据类型（包含ENUM/SET的特殊处理）
      const expectedDataType = this.getDataType(definedColumn).toUpperCase();
      const normalizedCurrentType = this.normalizeDataType(currentType);
      const normalizedExpectedType = this.normalizeDataType(expectedDataType);

      // 特殊处理ENUM和SET类型
      const definedType = definedColumn.type.toUpperCase();
      if (definedType === "ENUM" || definedType === "SET") {
        // 使用专门的ENUM比较方法
        const currentFullType =
          existingColumn.COLUMN_TYPE || existingColumn.Type || "";
        if (this.isEnumTypeNeedsUpdate(currentFullType, definedColumn)) {
          needsUpdate = true;
          updateReasons.push(
            `${definedType} values: ${currentFullType} → ${expectedDataType}`
          );
        }
      } else if (normalizedCurrentType !== normalizedExpectedType) {
        needsUpdate = true;
        updateReasons.push(
          `type: ${normalizedCurrentType} → ${normalizedExpectedType}`
        );
      }

      // 检查主键属性
      const expectedIsPrimaryKey = definedColumn.primaryKey === true;
      if (currentIsPrimaryKey !== expectedIsPrimaryKey) {
        needsUpdate = true;
        updateReasons.push(
          `primaryKey: ${currentIsPrimaryKey} → ${expectedIsPrimaryKey}`
        );
      }

      // 检查自增属性
      const expectedIsAutoIncrement = definedColumn.autoIncrement === true;
      if (currentIsAutoIncrement !== expectedIsAutoIncrement) {
        needsUpdate = true;
        updateReasons.push(
          `autoIncrement: ${currentIsAutoIncrement} → ${expectedIsAutoIncrement}`
        );
      }

      if (needsUpdate) {
        try {
          logger.info(
            `🔄 更新列 ${columnName} 的属性: ${updateReasons.join(", ")}`
          );

          // 分步处理主键变更
          await this.handlePrimaryKeyChanges(
            connection,
            tableName,
            columnName,
            currentIsPrimaryKey,
            expectedIsPrimaryKey
          );

          // 构建ALTER COLUMN语句（不包含PRIMARY KEY，因为已单独处理）
          let columnDefinition = `\`${definedColumn.name}\` ${this.getDataType(
            definedColumn
          )}`;

          // 添加自增属性
          if (definedColumn.autoIncrement) {
            columnDefinition += " AUTO_INCREMENT";
          }

          // 使用明确的boolean值判断，避免undefined导致的错误
          if (definedColumn.allowNull === false) {
            columnDefinition += " NOT NULL";
          } else {
            columnDefinition += " NULL";
          }

          if (definedColumn.unique) {
            columnDefinition += " UNIQUE";
          }

          // 处理默认值
          if (definedColumn.defaultValue !== undefined) {
            columnDefinition += this.getDefaultValue(definedColumn);
          }

          if (definedColumn.comment) {
            columnDefinition += ` COMMENT '${this.escapeComment(
              definedColumn.comment
            )}'`;
          }

          let alterSQL = `ALTER TABLE \`${tableName}\` MODIFY COLUMN ${columnDefinition}`;

          logger.info(`执行SQL: ${alterSQL}`);

          // 记录SQL执行历史
          if (this.currentSchema) {
            await this.executeAndRecordSql(
              connection,
              tableName,
              this.currentSchema.database_type,
              this.currentSchema.partition_type,
              this.currentSchema.schema_version,
              "ALTER",
              alterSQL
            );
          } else {
            await connection.query(alterSQL);
          }

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
   * 处理主键变更（添加或移除主键）
   */
  private async handlePrimaryKeyChanges(
    connection: Sequelize,
    tableName: string,
    columnName: string,
    currentIsPrimaryKey: boolean,
    expectedIsPrimaryKey: boolean
  ): Promise<void> {
    if (currentIsPrimaryKey === expectedIsPrimaryKey) {
      return; // 无需变更
    }

    try {
      if (currentIsPrimaryKey && !expectedIsPrimaryKey) {
        // 移除主键
        logger.info(`🔄 移除表 ${tableName} 列 ${columnName} 的主键约束`);
        const dropPrimaryKeySQL = `ALTER TABLE \`${tableName}\` DROP PRIMARY KEY`;
        logger.info(`执行SQL: ${dropPrimaryKeySQL}`);

        // 记录SQL执行历史
        if (this.currentSchema) {
          await this.executeAndRecordSql(
            connection,
            tableName,
            this.currentSchema.database_type,
            this.currentSchema.partition_type,
            this.currentSchema.schema_version,
            "ALTER",
            dropPrimaryKeySQL
          );
        } else {
          await connection.query(dropPrimaryKeySQL);
        }

      } else if (!currentIsPrimaryKey && expectedIsPrimaryKey) {
        // 添加主键
        logger.info(`🔄 为表 ${tableName} 列 ${columnName} 添加主键约束`);
        const addPrimaryKeySQL = `ALTER TABLE \`${tableName}\` ADD PRIMARY KEY (\`${columnName}\`)`;
        logger.info(`执行SQL: ${addPrimaryKeySQL}`);

        // 记录SQL执行历史
        if (this.currentSchema) {
          await this.executeAndRecordSql(
            connection,
            tableName,
            this.currentSchema.database_type,
            this.currentSchema.partition_type,
            this.currentSchema.schema_version,
            "ALTER",
            addPrimaryKeySQL
          );
        } else {
          await connection.query(addPrimaryKeySQL);
        }
      }
    } catch (error) {
      logger.error(`❌ 处理主键变更失败:`, error);
      throw error; // 主键变更失败比较严重，抛出错误
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
   * 比较ENUM/SET类型是否需要更新
   */
  private isEnumTypeNeedsUpdate(
    currentColumnType: string,
    definedColumn: ColumnDefinition
  ): boolean {
    const definedType = definedColumn.type.toUpperCase();

    // 只处理ENUM和SET类型
    if (definedType !== "ENUM" && definedType !== "SET") {
      return false;
    }

    // 检查定义的配置
    if (!definedColumn.values || definedColumn.values.length === 0) {
      // 如果没有定义values，检查是否使用了过时的length配置
      if (definedColumn.length) {
        logger.warn(`⚠️  ${definedType}类型建议使用values数组替代length参数`);
        // 对于使用length的情况，暂时认为不需要更新（保持兼容性）
        return false;
      } else {
        logger.error(`❌ ${definedType}类型必须定义values数组`);
        return true; // 强制更新
      }
    }

    // 解析当前数据库中的ENUM/SET值
    const currentEnumMatch = currentColumnType.match(/^(enum|set)\((.*)\)$/i);
    if (!currentEnumMatch) {
      // 如果当前不是ENUM/SET格式，需要更新
      return true;
    }

    const currentValuesStr = currentEnumMatch[2] || "";
    const currentValues = this.parseEnumValues(currentValuesStr);
    const definedValues = definedColumn.values;

    // 比较值数组
    if (currentValues.length !== definedValues.length) {
      return true;
    }

    // 逐个比较值（顺序敏感）
    for (let i = 0; i < currentValues.length; i++) {
      if (currentValues[i] !== definedValues[i]) {
        return true;
      }
    }

    return false;
  }

  /**
   * 解析ENUM/SET值字符串
   * 输入: "'value1','value2','value3'"
   * 输出: ["value1", "value2", "value3"]
   */
  private parseEnumValues(valuesStr: string): string[] {
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
   * 标准化comment，用于比较（处理转义字符差异）
   */
  private normalizeComment(comment: string): string {
    if (!comment) return "";

    // 统一处理反斜杠：将双反斜杠转换为单反斜杠进行比较
    // MySQL存储时会转义，JSON配置中也是转义的，需要统一标准
    return comment.replace(/\\\\/g, "\\").trim();
  }

  /**
   * 转义comment中的特殊字符，用于SQL生成
   */
  private escapeComment(comment: string): string {
    if (!comment) return "";

    // 转义单引号和反斜杠，用于SQL语句
    return comment
      .replace(/\\/g, "\\\\") // 反斜杠转义：\ -> \\
      .replace(/'/g, "\\'"); // 单引号转义：' -> \'
  }

  /**
   * 标准化默认值，用于比较
   */
  private normalizeDefaultValue(value: any): string {
    if (value === null || value === undefined) {
      return "";
    }

    // 如果是字符串，去除引号并转换
    if (typeof value === "string") {
      const trimmed = value.trim();

      // 特殊处理MySQL TIMESTAMP函数
      if (trimmed.toUpperCase().includes("CURRENT_TIMESTAMP")) {
        // 标准化CURRENT_TIMESTAMP相关的表达式
        let normalized = trimmed.toUpperCase();

        // 处理各种可能的格式，移除多余空格
        normalized = normalized
          .replace(/\s+/g, " ") // 标准化空格
          .replace(/\bCURRENT_TIMESTAMP\(\)/g, "CURRENT_TIMESTAMP") // 移除空括号
          .trim();

        // 对于包含 ON UPDATE 的表达式，只保留默认值部分进行比较
        // 因为MySQL的COLUMN_DEFAULT字段只存储默认值，ON UPDATE存储在EXTRA字段中
        if (normalized.includes("ON UPDATE")) {
          // 提取 ON UPDATE 之前的部分作为默认值
          const parts = normalized.split("ON UPDATE");
          if (parts.length > 0 && parts[0]) {
            const defaultPart = parts[0].trim();
            return defaultPart || "CURRENT_TIMESTAMP";
          }
        }

        // 如果只是 CURRENT_TIMESTAMP，直接返回
        if (normalized === "CURRENT_TIMESTAMP") {
          return "CURRENT_TIMESTAMP";
        }

        return normalized;
      }

      // 尝试转换为数字
      const numValue = Number(trimmed);
      if (!isNaN(numValue) && isFinite(numValue)) {
        return numValue.toString();
      }

      return trimmed;
    }

    // 如果是数字，转换为字符串
    if (typeof value === "number") {
      return value.toString();
    }

    // 如果是布尔值，转换为数字字符串
    if (typeof value === "boolean") {
      return value ? "1" : "0";
    }

    return String(value);
  }

  /**
   * 同步索引（删除不需要的，添加缺失的）
   */
  private async synchronizeIndexes(
    connection: Sequelize,
    tableName: string,
    definedIndexes: Array<{ name: string; fields: string[]; unique?: boolean }>,
    tableDefinition?: TableDefinition
  ): Promise<void> {
    try {
      logger.info(`🔄 开始同步表 ${tableName} 的索引...`);

      // 获取现有索引
      const [showIndexResult] = await connection.query(
        `SHOW INDEX FROM \`${tableName}\``
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

      // 收集所有应该存在的索引名称（包括在列上设置unique的字段）
      const definedIndexNames = definedIndexes.map((idx) => idx.name);

      // 如果提供了tableDefinition，检查列上的unique属性
      const uniqueColumnNames: string[] = [];
      if (tableDefinition) {
        const uniqueColumns = tableDefinition.columns.filter(
          (col) => col.unique
        );
        uniqueColumnNames.push(...uniqueColumns.map((col) => col.name));

        // 对于unique列，我们需要在现有索引中找到对应的唯一索引
        for (const col of uniqueColumns) {
          // 查找匹配此列的唯一索引
          const matchingUniqueIndexes = existingIndexNames.filter(
            (indexName) => {
              const indexRows = indexData.filter(
                (idx) => idx.Key_name === indexName
              );
              // 检查是否是单列唯一索引且列名匹配
              return (
                indexRows.length === 1 &&
                indexRows[0].Non_unique === 0 &&
                indexRows[0].Column_name === col.name
              );
            }
          );

          // 将找到的匹配索引名加入到定义列表中，避免被删除
          definedIndexNames.push(...matchingUniqueIndexes);
        }
      }

      logger.info(`现有索引: [${existingIndexNames.join(", ")}]`);
      logger.info(`定义索引: [${definedIndexNames.join(", ")}]`);
      if (uniqueColumnNames.length > 0) {
        logger.info(`UNIQUE列: [${uniqueColumnNames.join(", ")}]`);
      }

      // 1. 删除不再需要的索引
      for (const existingIndexName of existingIndexNames) {
        if (!definedIndexNames.includes(existingIndexName)) {
          try {
            logger.info(`🗑️ 删除不再需要的索引: ${existingIndexName}`);
            const dropSQL = `DROP INDEX \`${existingIndexName}\` ON \`${tableName}\``;
            logger.info(`执行SQL: ${dropSQL}`);

            // 记录SQL执行历史
            if (this.currentSchema) {
              await this.executeAndRecordSql(
                connection,
                tableName,
                this.currentSchema.database_type,
                this.currentSchema.partition_type,
                this.currentSchema.schema_version,
                "DROP",
                dropSQL
              );
            } else {
              await connection.query(dropSQL);
            }

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
            const fields = index.fields
              .map((field) => `\`${field}\``)
              .join(", ");
            const sql = `CREATE ${unique} INDEX \`${index.name}\` ON \`${tableName}\` (${fields})`;
            logger.info(`执行SQL: ${sql}`);

            // 记录SQL执行历史
            if (this.currentSchema) {
              await this.executeAndRecordSql(
                connection,
                tableName,
                this.currentSchema.database_type,
                this.currentSchema.partition_type,
                this.currentSchema.schema_version,
                "INDEX",
                sql
              );
            } else {
              await connection.query(sql);
            }
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
      // 如果新列要设置为主键，需要先检查表中是否已经有主键
      if (column.primaryKey) {
        logger.info(`🔍 检查表 ${tableName} 的现有主键情况...`);

        // 查询现有的主键信息
        const [existingPrimaryKeys] = await connection.query(
          "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND COLUMN_KEY = 'PRI'",
          { replacements: [tableName] }
        );

        let primaryKeyColumns: any[] = [];
        if (Array.isArray(existingPrimaryKeys)) {
          primaryKeyColumns = existingPrimaryKeys;
        } else if (
          existingPrimaryKeys &&
          typeof existingPrimaryKeys === "object"
        ) {
          primaryKeyColumns = Object.values(existingPrimaryKeys);
        }

        if (primaryKeyColumns.length > 0) {
          const existingPrimaryKeyNames = primaryKeyColumns.map(
            (col) => col.COLUMN_NAME
          );
          logger.warn(
            `⚠️ 表 ${tableName} 已存在主键: [${existingPrimaryKeyNames.join(
              ", "
            )}]`
          );
          logger.info(`🔄 先删除现有主键，然后添加新列并设为主键`);

          // 先删除现有主键
          const dropPrimaryKeySQL = `ALTER TABLE \`${tableName}\` DROP PRIMARY KEY`;
          logger.info(`执行SQL: ${dropPrimaryKeySQL}`);

          if (this.currentSchema) {
            await this.executeAndRecordSql(
              connection,
              tableName,
              this.currentSchema.database_type,
              this.currentSchema.partition_type,
              this.currentSchema.schema_version,
              "ALTER",
              dropPrimaryKeySQL
            );
          } else {
            await connection.query(dropPrimaryKeySQL);
          }
        }
      }

      // 特殊处理AUTO_INCREMENT列
      if (column.autoIncrement) {
        logger.info(`🔢 处理AUTO_INCREMENT列: ${column.name}`);

        // 检查表中是否已有AUTO_INCREMENT列
        const [existingAutoIncColumns] = await connection.query(
          "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND EXTRA LIKE '%auto_increment%'",
          { replacements: [tableName] }
        );

        let autoIncColumns: any[] = [];
        if (Array.isArray(existingAutoIncColumns)) {
          autoIncColumns = existingAutoIncColumns;
        } else if (
          existingAutoIncColumns &&
          typeof existingAutoIncColumns === "object"
        ) {
          autoIncColumns = Object.values(existingAutoIncColumns);
        }

        if (autoIncColumns.length > 0) {
          const existingAutoIncNames = autoIncColumns.map(
            (col) => col.COLUMN_NAME
          );
          logger.warn(
            `⚠️ 表 ${tableName} 已存在AUTO_INCREMENT列: [${existingAutoIncNames.join(
              ", "
            )}]`
          );
          logger.info(`🔄 先移除现有AUTO_INCREMENT属性`);

          // 移除现有AUTO_INCREMENT属性
          for (const existingCol of existingAutoIncNames) {
            const modifySQL = `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${existingCol}\` BIGINT NOT NULL`;
            logger.info(`执行SQL: ${modifySQL}`);

            if (this.currentSchema) {
              await this.executeAndRecordSql(
                connection,
                tableName,
                this.currentSchema.database_type,
                this.currentSchema.partition_type,
                this.currentSchema.schema_version,
                "ALTER",
                modifySQL
              );
            } else {
              await connection.query(modifySQL);
            }
          }
        }

        // AUTO_INCREMENT列必须是键，如果不是主键，至少要是唯一键
        if (!column.primaryKey && !column.unique) {
          logger.info(`⚠️ AUTO_INCREMENT列必须是键，自动设置为唯一键`);
          column.unique = true;
        }
      }

      // 构建列定义（不包含PRIMARY KEY和AUTO_INCREMENT，将在后面单独处理）
      let columnDefinition = `\`${column.name}\` ${this.getDataType(column)}`;

      if (column.allowNull === false) columnDefinition += " NOT NULL";
      if (column.unique && !column.primaryKey) columnDefinition += " UNIQUE"; // 主键自动包含唯一性

      // 处理默认值
      if (column.defaultValue !== undefined) {
        columnDefinition += this.getDefaultValue(column);
      }

      if (column.comment)
        columnDefinition += ` COMMENT '${this.escapeComment(column.comment)}'`;

      // 先添加列（不设置主键和AUTO_INCREMENT）
      let alterSQL = `ALTER TABLE \`${tableName}\` ADD COLUMN ${columnDefinition}`;
      logger.info(`执行SQL: ${alterSQL}`);

      if (this.currentSchema) {
        await this.executeAndRecordSql(
          connection,
          tableName,
          this.currentSchema.database_type,
          this.currentSchema.partition_type,
          this.currentSchema.schema_version,
          "ALTER",
          alterSQL
        );
      } else {
        await connection.query(alterSQL);
      }

      // 如果需要设置为主键，单独执行
      if (column.primaryKey) {
        logger.info(`🔑 设置列 ${column.name} 为主键`);
        const addPrimaryKeySQL = `ALTER TABLE \`${tableName}\` ADD PRIMARY KEY (\`${column.name}\`)`;
        logger.info(`执行SQL: ${addPrimaryKeySQL}`);

        if (this.currentSchema) {
          await this.executeAndRecordSql(
            connection,
            tableName,
            this.currentSchema.database_type,
            this.currentSchema.partition_type,
            this.currentSchema.schema_version,
            "ALTER",
            addPrimaryKeySQL
          );
        } else {
          await connection.query(addPrimaryKeySQL);
        }
      }

      // 最后设置AUTO_INCREMENT属性（必须在设置键之后）
      if (column.autoIncrement) {
        logger.info(`🔢 设置列 ${column.name} 为AUTO_INCREMENT`);
        let modifyColumnDefinition = `\`${column.name}\` ${this.getDataType(
          column
        )} AUTO_INCREMENT`;

        if (column.allowNull === false) modifyColumnDefinition += " NOT NULL";
        if (column.unique && !column.primaryKey)
          modifyColumnDefinition += " UNIQUE";
        if (column.comment)
          modifyColumnDefinition += ` COMMENT '${this.escapeComment(
            column.comment
          )}'`;

        const modifyAutoIncSQL = `ALTER TABLE \`${tableName}\` MODIFY COLUMN ${modifyColumnDefinition}`;
        logger.info(`执行SQL: ${modifyAutoIncSQL}`);

        if (this.currentSchema) {
          await this.executeAndRecordSql(
            connection,
            tableName,
            this.currentSchema.database_type,
            this.currentSchema.partition_type,
            this.currentSchema.schema_version,
            "ALTER",
            modifyAutoIncSQL
          );
        } else {
          await connection.query(modifyAutoIncSQL);
        }
      }
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

      // 检查是否是多主键错误
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("multiple primary key")
      ) {
        logger.error(`❌ 多主键错误: ${error.message}`);
        logger.info(`💡 建议: 请检查表结构定义，确保只有一个主键列`);
      }

      // 检查是否是AUTO_INCREMENT相关错误
      if (
        error instanceof Error &&
        (error.message
          .toLowerCase()
          .includes("there can be only one auto column") ||
          error.message.toLowerCase().includes("must be defined as a key"))
      ) {
        logger.error(`❌ AUTO_INCREMENT错误: ${error.message}`);
        logger.info(
          `💡 建议: AUTO_INCREMENT列必须是主键或唯一键，且一个表只能有一个AUTO_INCREMENT列`
        );
      }

      throw error;
    }
  }

  /**
   * 获取数据类型字符串
   */
  private getDataType(column: ColumnDefinition): string {
    let type = column.type.toUpperCase();

    // 特殊处理不同的数据类型
    if (type === "ENUM" || type === "SET") {
      // ENUM和SET类型需要定义具体的枚举值
      if (column.values && column.values.length > 0) {
        // 正确格式: ENUM('value1', 'value2', 'value3')
        const enumValues = column.values
          .map((value) => `'${value.replace(/'/g, "''")}'`) // 转义单引号
          .join(", ");
        return `${type}(${enumValues})`;
      } else {
        // 如果没有提供values，检查是否使用了length（向后兼容）
        if (column.length) {
          logger.warn(
            `⚠️  ${type}类型使用length参数已过时，建议使用values数组定义枚举值`
          );
          logger.warn(`💡 建议配置: "values": ["value1", "value2", "value3"]`);
          // 生成一个基于length的默认枚举（向后兼容）
          return `${type}('default')`;
        } else {
          logger.error(`❌ ${type}类型必须定义values数组或length参数`);
          throw new Error(
            `${type}类型必须定义values数组，例如: values: ["value1", "value2"]`
          );
        }
      }
    } else if (type === "DECIMAL" || type === "NUMERIC") {
      // DECIMAL/NUMERIC类型支持precision和scale
      if (column.precision) {
        if (column.scale !== undefined) {
          return `${type}(${column.precision}, ${column.scale})`;
        } else {
          return `${type}(${column.precision})`;
        }
      } else if (column.length) {
        return `${type}(${column.length})`;
      }
      return type;
    } else if (column.length && this.shouldHaveLength(type)) {
      type += `(${column.length})`;
    }

    return type;
  }

  /**
   * 判断数据类型是否应该有长度参数
   */
  private shouldHaveLength(dataType: string): boolean {
    const typesWithLength = [
      "VARCHAR",
      "CHAR",
      "VARBINARY",
      "BINARY",
      "DECIMAL",
      "NUMERIC",
      "FLOAT",
      "DOUBLE",
      "BIT",
      "TINYINT",
      "SMALLINT",
      "MEDIUMINT",
      "INT",
      "BIGINT",
    ];

    const typesWithoutLength = [
      "TINYBLOB",
      "BLOB",
      "MEDIUMBLOB",
      "LONGBLOB",
      "TINYTEXT",
      "TEXT",
      "MEDIUMTEXT",
      "LONGTEXT",
      "JSON",
      "DATE",
      "TIME",
      "DATETIME",
      "TIMESTAMP",
      "YEAR",
      "ENUM",
      "SET", // ENUM和SET需要特殊处理
    ];

    return (
      typesWithLength.includes(dataType) &&
      !typesWithoutLength.includes(dataType)
    );
  }

  /**
   * 处理默认值
   */
  private getDefaultValue(column: ColumnDefinition): string {
    if (column.defaultValue === undefined) {
      return "";
    }

    // 处理NULL默认值
    if (column.defaultValue === null) {
      return " DEFAULT NULL";
    }

    const columnType = column.type.toUpperCase();

    // 特殊处理TIMESTAMP和DATETIME类型的默认值
    if (columnType === "TIMESTAMP" || columnType === "DATETIME") {
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
  private formatDateForTable(
    date: Date,
    interval: "day" | "month" | "year",
    customFormat?: string
  ): string {
    // 如果提供了自定义格式，使用自定义格式
    if (customFormat) {
      return this.applyDateFormat(date, customFormat);
    }

    // 默认格式
    if (interval === "day") {
      return `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}_${String(date.getDate()).padStart(2, "0")}`;
    } else if (interval === "month") {
      return `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
    } else {
      return `${date.getFullYear()}`;
    }
  }

  /**
   * 应用自定义日期格式
   * 支持的占位符：
   * - YYYY: 四位年份
   * - YY: 两位年份
   * - MM: 两位月份
   * - M: 一位或两位月份
   * - DD: 两位日期
   * - D: 一位或两位日期
   */
  private applyDateFormat(date: Date, format: string): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    return format
      .replace(/YYYY/g, year.toString())
      .replace(/YY/g, year.toString().slice(-2))
      .replace(/MM/g, String(month).padStart(2, "0"))
      .replace(/M/g, month.toString())
      .replace(/DD/g, String(day).padStart(2, "0"))
      .replace(/D/g, day.toString());
  }

  /**
   * 使用指定连接删除单个表
   */
  private async dropTableWithConnection(
    connection: Sequelize,
    tableName: string
  ): Promise<void> {
    try {
      // 检查表是否存在
      const tableExists = await this.tableExistsWithConnection(
        connection,
        tableName
      );

      if (!tableExists) {
        logger.info(`ℹ️ 表 ${tableName} 不存在，跳过删除`);
        return;
      }

      const dropSQL = `DROP TABLE IF EXISTS \`${tableName}\``;
      logger.info(`执行删除SQL: ${dropSQL}`);

      // 记录SQL执行历史
      if (this.currentSchema) {
        await this.executeAndRecordSql(
          connection,
          tableName,
          this.currentSchema.database_type,
          this.currentSchema.partition_type,
          this.currentSchema.schema_version,
          "DROP",
          dropSQL
        );
      } else {
        await connection.query(dropSQL);
      }
    } catch (error) {
      logger.error(`删除表 ${tableName} 失败:`, error);
      throw error;
    }
  }

  /**
   * 删除表
   * 根据表名、数据库类型删除对应的表
   */
  async dropTable(
    tableName: string,
    databaseType: "main" | "log" | "order" | "static",
    partitionType?: string
  ): Promise<{
    success: boolean;
    message: string;
    droppedTables: string[];
    errors?: string[];
  }> {
    try {
      // 生成删除批次ID
      this.currentMigrationBatch = `drop_${tableName}_${databaseType}_${Date.now()}_${uuidv4().substring(
        0,
        8
      )}`;

      logger.info(
        `🗑️ 开始删除表: ${tableName}, 数据库类型: ${databaseType}, 分区类型: ${
          partitionType || "自动检测"
        }, 批次: ${this.currentMigrationBatch}`
      );

      // 获取所有企业
      const enterprises = await Enterprise.findAll({
        where: { status: 1 },
      });

      const droppedTables: string[] = [];
      const errors: string[] = [];

      for (const enterprise of enterprises) {
        try {
          const result = await this.dropTableForEnterprise(
            enterprise,
            tableName,
            databaseType,
            partitionType
          );
          droppedTables.push(...result.droppedTables);
          if (result.errors && result.errors.length > 0) {
            errors.push(...result.errors);
          }
        } catch (error) {
          const errorMsg = `企业 ${enterprise.enterprise_name} (${
            enterprise.enterprise_id
          }) 删除表失败: ${
            error instanceof Error ? error.message : "未知错误"
          }`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      const success = errors.length === 0;
      const message = success
        ? `表 ${tableName} 删除成功，共删除 ${droppedTables.length} 个表`
        : `表 ${tableName} 删除完成，但有 ${errors.length} 个错误`;

      logger.info(
        `🎉 删除操作完成 - 成功删除: ${droppedTables.length} 个表, 错误: ${errors.length} 个`
      );

      const result: {
        success: boolean;
        message: string;
        droppedTables: string[];
        errors?: string[];
      } = {
        success,
        message,
        droppedTables,
      };

      if (errors.length > 0) {
        result.errors = errors;
      }

      return result;
    } catch (error) {
      logger.error("删除表操作失败:", error);
      throw error;
    }
  }

  /**
   * 为单个企业删除表
   */
  private async dropTableForEnterprise(
    enterprise: Enterprise,
    tableName: string,
    databaseType: "main" | "log" | "order" | "static",
    partitionType?: string
  ): Promise<{
    droppedTables: string[];
    errors?: string[];
  }> {
    try {
      logger.info(
        `🗑️ 为企业 ${enterprise.enterprise_name} (${enterprise.enterprise_id}) 删除表: ${tableName}`
      );

      // 获取对应数据库类型的连接
      const connection = await this.connectionManager.getConnection(
        enterprise,
        databaseType
      );

      const droppedTables: string[] = [];
      const errors: string[] = [];

      // 根据分区类型确定要删除的表
      if (partitionType === "store") {
        // 门店分表：删除所有门店相关的表
        const storePattern = `${tableName}_store_%`;
        const tables = await this.getTablesMatchingPattern(
          connection,
          storePattern
        );

        for (const table of tables) {
          try {
            await this.dropSingleTable(
              connection,
              table,
              databaseType,
              partitionType,
              "1.0.0"
            );
            droppedTables.push(table);
          } catch (error) {
            const errorMsg = `删除门店分表 ${table} 失败: ${
              error instanceof Error ? error.message : "未知错误"
            }`;
            logger.error(errorMsg);
            errors.push(errorMsg);
          }
        }
      } else if (partitionType === "time") {
        // 时间分表：删除所有时间相关的表
        const timePattern = `${tableName}%`;
        const tables = await this.getTablesMatchingPattern(
          connection,
          timePattern
        );

        for (const table of tables) {
          // 验证是否是时间分表格式
          if (table !== tableName && table.startsWith(tableName)) {
            try {
              await this.dropSingleTable(
                connection,
                table,
                databaseType,
                partitionType,
                "1.0.0"
              );
              droppedTables.push(table);
            } catch (error) {
              const errorMsg = `删除时间分表 ${table} 失败: ${
                error instanceof Error ? error.message : "未知错误"
              }`;
              logger.error(errorMsg);
              errors.push(errorMsg);
            }
          }
        }
      } else {
        // 普通表：只删除指定表名的表
        const tableExists = await this.tableExistsWithConnection(
          connection,
          tableName
        );

        if (tableExists) {
          try {
            await this.dropSingleTable(
              connection,
              tableName,
              databaseType,
              partitionType || "none",
              "1.0.0"
            );
            droppedTables.push(tableName);
          } catch (error) {
            const errorMsg = `删除表 ${tableName} 失败: ${
              error instanceof Error ? error.message : "未知错误"
            }`;
            logger.error(errorMsg);
            errors.push(errorMsg);
          }
        } else {
          logger.info(`ℹ️ 表 ${tableName} 不存在，跳过删除`);
        }
      }

      const result: {
        droppedTables: string[];
        errors?: string[];
      } = {
        droppedTables,
      };

      if (errors.length > 0) {
        result.errors = errors;
      }

      return result;
    } catch (error) {
      logger.error(
        `企业 ${enterprise.enterprise_name} (${enterprise.enterprise_id}) 删除表失败:`,
        error
      );
      throw error;
    }
  }

  /**
   * 获取匹配模式的表名列表
   */
  private async getTablesMatchingPattern(
    connection: Sequelize,
    pattern: string
  ): Promise<string[]> {
    try {
      const query = `
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME LIKE ?
        ORDER BY TABLE_NAME
      `;

      const [results] = await connection.query(query, {
        replacements: [pattern],
        type: "SELECT",
      });

      let tables: string[] = [];
      if (Array.isArray(results)) {
        tables = results.map((row: any) => row.TABLE_NAME);
      } else if (results && typeof results === "object") {
        tables = Object.values(results).map((row: any) => row.TABLE_NAME);
      }

      return tables;
    } catch (error) {
      logger.error(`获取匹配模式 ${pattern} 的表列表失败:`, error);
      return [];
    }
  }

  /**
   * 删除单个表
   */
  private async dropSingleTable(
    connection: Sequelize,
    tableName: string,
    databaseType: string,
    partitionType: string,
    schemaVersion: string
  ): Promise<void> {
    try {
      const dropSQL = `DROP TABLE IF EXISTS \`${tableName}\``;
      logger.info(`执行删除SQL: ${dropSQL}`);

      // 记录SQL执行历史
      await this.executeAndRecordSql(
        connection,
        tableName,
        databaseType,
        partitionType,
        schemaVersion,
        "DROP",
        dropSQL
      );
    } catch (error) {
      logger.error(`删除表 ${tableName} 失败:`, error);
      throw error;
    }
  }

  /**
   * 批量删除表（根据检测到的删除表列表）
   */
  async dropDeletedTables(
    deletedTables: string[],
    databaseType: "main" | "log" | "order" | "static"
  ): Promise<{
    success: boolean;
    message: string;
    totalDeleted: number;
    results: Array<{
      tableName: string;
      success: boolean;
      message: string;
      droppedTables: string[];
      errors?: string[];
    }>;
  }> {
    try {
      logger.info(
        `🗑️ 开始批量删除表: ${deletedTables.length} 个, 数据库类型: ${databaseType}`
      );

      const results: Array<{
        tableName: string;
        success: boolean;
        message: string;
        droppedTables: string[];
        errors?: string[];
      }> = [];

      let totalDeleted = 0;

      for (const tableName of deletedTables) {
        try {
          const result = await this.dropTable(tableName, databaseType);
          const resultItem: {
            tableName: string;
            success: boolean;
            message: string;
            droppedTables: string[];
            errors?: string[];
          } = {
            tableName,
            success: result.success,
            message: result.message,
            droppedTables: result.droppedTables,
          };

          if (result.errors) {
            resultItem.errors = result.errors;
          }

          results.push(resultItem);
          totalDeleted += result.droppedTables.length;
        } catch (error) {
          const errorMsg = `删除表 ${tableName} 失败: ${
            error instanceof Error ? error.message : "未知错误"
          }`;
          logger.error(errorMsg);
          results.push({
            tableName,
            success: false,
            message: errorMsg,
            droppedTables: [],
            errors: [errorMsg],
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const success = successCount === deletedTables.length;
      const message = success
        ? `批量删除表成功，共删除 ${totalDeleted} 个表`
        : `批量删除表完成，成功: ${successCount}/${deletedTables.length} 个表，共删除 ${totalDeleted} 个表`;

      logger.info(
        `🎉 批量删除操作完成 - 成功: ${successCount}/${deletedTables.length} 个表, 总删除: ${totalDeleted} 个表`
      );

      return {
        success,
        message,
        totalDeleted,
        results,
      };
    } catch (error) {
      logger.error("批量删除表操作失败:", error);
      throw error;
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

  /**
   * 迁移指定门店的单个表
   */
  async migrateStoreTable(
    tableName: string,
    databaseType: string,
    schemaVersion: string,
    storeId: string,
    enterpriseId: number
  ): Promise<void> {
    try {
      // 生成迁移批次ID
      this.currentMigrationBatch = `${tableName}_${databaseType}_store_${storeId}_${Date.now()}_${uuidv4().substring(
        0,
        8
      )}`;

      logger.info(
        `🚀 开始迁移门店分表: ${tableName}, 门店ID: ${storeId}, 企业ID: ${enterpriseId}, 数据库类型: ${databaseType}, 版本: ${schemaVersion}, 批次: ${this.currentMigrationBatch}`
      );

      // 获取门店分表的表结构定义
      const schema = await this.getTableSchema(
        tableName,
        databaseType,
        "store", // 固定为store分区类型
        schemaVersion
      );

      if (!schema) {
        throw new Error(
          `未找到门店分表结构定义: ${tableName} (database_type: ${databaseType}, partition_type: store, version: ${schemaVersion})`
        );
      }

      // 获取指定企业
      const targetEnterprise = await Enterprise.findOne({
        where: {
          enterprise_id: enterpriseId,
          status: 1,
        },
      });

      if (!targetEnterprise) {
        throw new Error(`未找到企业ID为 ${enterpriseId} 的有效企业`);
      }

      logger.info(
        `🎯 企业门店迁移: ${targetEnterprise.enterprise_name} (ID: ${enterpriseId}), 门店: ${storeId}`
      );

      // 执行迁移
      await this.migrateStoreTableForEnterprise(
        targetEnterprise,
        schema,
        storeId
      );

      logger.info(
        `🏁 企业 ${targetEnterprise.enterprise_name} 门店 ${storeId} 的表 ${tableName} 迁移完成`
      );
    } catch (error) {
      logger.error(
        `迁移门店分表 ${tableName} (门店: ${storeId}, 企业: ${enterpriseId}) 失败:`,
        error
      );
      throw error;
    }
  }

  /**
   * 为指定企业迁移指定门店的表
   */
  private async migrateStoreTableForEnterprise(
    enterprise: Enterprise,
    schema: TableSchema,
    storeId: string
  ): Promise<void> {
    try {
      // 设置当前schema
      this.currentSchema = schema;

      // 解析表结构定义
      const tableDefinition: TableDefinition = JSON.parse(
        schema.schema_definition
      );

      // 获取数据库连接
      const connection = await this.connectionManager.getConnection(
        enterprise,
        schema.database_type
      );

      // 直接为指定门店创建分表，不查询门店列表
      await this.migrateTableWithConnection(
        connection,
        tableDefinition,
        enterprise.enterprise_id,
        storeId,
        schema
      );

      logger.info(
        `企业 ${enterprise.enterprise_name} (${enterprise.enterprise_id}) 的门店 ${storeId} 表 ${schema.table_name} 迁移成功`
      );
    } catch (error) {
      logger.error(
        `企业 ${enterprise.enterprise_name} (${enterprise.enterprise_id}) 门店 ${storeId} 迁移失败:`,
        error
      );
      throw error;
    } finally {
      // 清理当前schema
      this.currentSchema = null;
    }
  }

  // 新增：用于收集SQL的私有属性和方法
  private collectedSqls: Array<{
    enterprise_name: string;
    enterprise_id: number;
    database_type: string;
    table_name: string;
    actual_table_name: string;
    partition_type: string;
    schema_version: string;
    migration_type: "CREATE" | "ALTER" | "DROP" | "INDEX";
    sql_statement: string;
    description: string;
  }> = [];

  /**
   * 收集SQL而不执行（用于预览）
   */
  private async collectSql(
    enterprise: Enterprise,
    tableName: string,
    actualTableName: string,
    databaseType: string,
    partitionType: string,
    schemaVersion: string,
    migrationType: "CREATE" | "ALTER" | "DROP" | "INDEX",
    sqlStatement: string,
    description: string
  ): Promise<void> {
    this.collectedSqls.push({
      enterprise_name: enterprise.enterprise_name || "",
      enterprise_id: enterprise.enterprise_id,
      database_type: databaseType,
      table_name: tableName,
      actual_table_name: actualTableName,
      partition_type: partitionType,
      schema_version: schemaVersion,
      migration_type: migrationType,
      sql_statement: sqlStatement,
      description: description,
    });

    logger.info(
      `收集SQL [${migrationType}]: ${sqlStatement.substring(0, 100)}...`
    );
  }

  /**
   * 一键迁移检查 - 收集所有会执行的SQL但不执行
   * @param enterpriseId 可选，指定特定企业进行检查
   */
  async checkMigrateAllTables(enterpriseId?: number): Promise<{
    total_schemas: number;
    total_enterprises: number;
    total_sql_statements: number;
    migration_plan: Array<{
      enterprise_name: string;
      enterprise_id: number;
      database_type: string;
      table_name: string;
      actual_table_name: string;
      partition_type: string;
      schema_version: string;
      migration_type: "CREATE" | "ALTER" | "DROP" | "INDEX";
      sql_statement: string;
      description: string;
    }>;
    summary_by_database_type: {
      [key: string]: {
        total_tables: number;
        total_sql_statements: number;
        enterprises_count: number;
      };
    };
    summary_by_enterprise: {
      [key: string]: {
        enterprise_name: string;
        total_tables: number;
        total_sql_statements: number;
        by_database_type: {
          [key: string]: {
            total_tables: number;
            total_sql_statements: number;
          };
        };
      };
    };
  }> {
    try {
      // 清空之前收集的SQL
      this.collectedSqls = [];

      logger.info(`🔍 开始一键迁移检查，预览所有会执行的SQL语句`);

      // 1. 获取TableSchema表中所有激活的表结构定义
      const allSchemas = await TableSchema.findAll({
        where: {
          is_active: true,
        },
        order: [
          ["database_type", "ASC"],
          ["table_name", "ASC"],
          ["schema_version", "DESC"],
        ],
      });

      if (allSchemas.length === 0) {
        return {
          total_schemas: 0,
          total_enterprises: 0,
          total_sql_statements: 0,
          migration_plan: [],
          summary_by_database_type: {},
          summary_by_enterprise: {},
        };
      }

      // 2. 获取需要检查的企业
      let enterprises: Enterprise[];
      if (enterpriseId) {
        const targetEnterprise = await Enterprise.findOne({
          where: {
            enterprise_id: enterpriseId,
            status: 1,
          },
        });

        if (!targetEnterprise) {
          throw new Error(`未找到企业ID为 ${enterpriseId} 的有效企业`);
        }

        enterprises = [targetEnterprise];
        logger.info(
          `🎯 指定企业检查: ${targetEnterprise.enterprise_name} (ID: ${enterpriseId})`
        );
      } else {
        enterprises = await Enterprise.findAll({
          where: { status: 1 },
        });
        logger.info(`🌍 全企业检查: 共 ${enterprises.length} 个企业`);
      }

      // 3. 为每个企业和每个表结构定义收集SQL
      for (const enterprise of enterprises) {
        for (const schema of allSchemas) {
          try {
            await this.checkTableForEnterprise(enterprise, schema);
          } catch (error) {
            logger.error(
              `检查企业 ${enterprise.enterprise_name} 的表 ${schema.table_name} 失败:`,
              error
            );
            // 继续处理其他表，不中断整个检查过程
          }
        }
      }

      // 4. 生成统计信息
      const summaryByDatabaseType: {
        [key: string]: {
          total_tables: number;
          total_sql_statements: number;
          enterprises_count: number;
        };
      } = {};

      const summaryByEnterprise: {
        [key: string]: {
          enterprise_name: string;
          total_tables: number;
          total_sql_statements: number;
          by_database_type: {
            [key: string]: {
              total_tables: number;
              total_sql_statements: number;
            };
          };
        };
      } = {};

      // 按数据库类型统计
      for (const sql of this.collectedSqls) {
        const dbType = sql.database_type;
        if (!summaryByDatabaseType[dbType]) {
          summaryByDatabaseType[dbType] = {
            total_tables: 0,
            total_sql_statements: 0,
            enterprises_count: 0,
          };
        }
        summaryByDatabaseType[dbType].total_sql_statements++;

        // 统计唯一的表数量（通过Set去重）
        const uniqueTables = new Set(
          this.collectedSqls
            .filter((s) => s.database_type === dbType)
            .map((s) => `${s.enterprise_id}_${s.table_name}`)
        );
        summaryByDatabaseType[dbType].total_tables = uniqueTables.size;

        // 统计涉及的企业数量
        const uniqueEnterprises = new Set(
          this.collectedSqls
            .filter((s) => s.database_type === dbType)
            .map((s) => s.enterprise_id)
        );
        summaryByDatabaseType[dbType].enterprises_count =
          uniqueEnterprises.size;
      }

      // 按企业统计
      for (const sql of this.collectedSqls) {
        const enterpriseKey = sql.enterprise_id.toString();
        if (!summaryByEnterprise[enterpriseKey]) {
          summaryByEnterprise[enterpriseKey] = {
            enterprise_name: sql.enterprise_name,
            total_tables: 0,
            total_sql_statements: 0,
            by_database_type: {},
          };
        }

        summaryByEnterprise[enterpriseKey].total_sql_statements++;

        // 按企业的数据库类型统计
        const dbType = sql.database_type;
        if (!summaryByEnterprise[enterpriseKey].by_database_type[dbType]) {
          summaryByEnterprise[enterpriseKey].by_database_type[dbType] = {
            total_tables: 0,
            total_sql_statements: 0,
          };
        }
        summaryByEnterprise[enterpriseKey].by_database_type[dbType]
          .total_sql_statements++;

        // 统计每个企业的唯一表数量
        const uniqueTablesForEnterprise = new Set(
          this.collectedSqls
            .filter((s) => s.enterprise_id === sql.enterprise_id)
            .map((s) => s.table_name)
        );
        summaryByEnterprise[enterpriseKey].total_tables =
          uniqueTablesForEnterprise.size;

        // 统计每个企业按数据库类型的唯一表数量
        const uniqueTablesForEnterpriseByDb = new Set(
          this.collectedSqls
            .filter(
              (s) =>
                s.enterprise_id === sql.enterprise_id &&
                s.database_type === dbType
            )
            .map((s) => s.table_name)
        );
        summaryByEnterprise[enterpriseKey].by_database_type[
          dbType
        ].total_tables = uniqueTablesForEnterpriseByDb.size;
      }

      const migrationScope = enterpriseId ? "指定企业" : "全企业";
      logger.info(
        `🏁 ${migrationScope}迁移检查完成，共收集 ${this.collectedSqls.length} 条SQL语句`
      );

      return {
        total_schemas: allSchemas.length,
        total_enterprises: enterprises.length,
        total_sql_statements: this.collectedSqls.length,
        migration_plan: [...this.collectedSqls], // 创建副本
        summary_by_database_type: summaryByDatabaseType,
        summary_by_enterprise: summaryByEnterprise,
      };
    } catch (error) {
      logger.error("一键迁移检查失败:", error);
      throw error;
    } finally {
      // 清空收集的SQL
      this.collectedSqls = [];
    }
  }

  /**
   * 为单个企业检查表迁移计划
   */
  private async checkTableForEnterprise(
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
      if (schema.partition_type === "store") {
        // 门店分表逻辑
        await this.checkStorePartitionedTable(
          connection,
          tableDefinition,
          enterprise,
          schema
        );
      } else if (schema.partition_type === "time") {
        // 时间分表逻辑
        await this.checkTimePartitionedTableWithConfig(
          connection,
          tableDefinition,
          schema,
          enterprise
        );
      } else {
        // 普通表
        await this.checkTableWithConnection(
          connection,
          tableDefinition,
          enterprise,
          schema
        );
      }
    } catch (error) {
      logger.error(
        `检查企业 ${enterprise.enterprise_name} (${enterprise.enterprise_id}) 的表 ${schema.table_name} 失败:`,
        error
      );
      throw error;
    }
  }

  /**
   * 检查普通表的迁移计划
   */
  private async checkTableWithConnection(
    connection: Sequelize,
    tableDefinition: TableDefinition,
    enterprise: Enterprise,
    schema: TableSchema
  ): Promise<void> {
    const tableName = tableDefinition.tableName;

    // 检查表是否存在
    const tableExists = await this.tableExistsWithConnection(
      connection,
      tableName
    );

    if (tableDefinition.action === "DROP") {
      if (tableExists) {
        await this.collectSql(
          enterprise,
          tableName,
          tableName,
          schema.database_type,
          schema.partition_type,
          schema.schema_version,
          "DROP",
          `DROP TABLE \`${tableName}\`;`,
          `删除表 ${tableName}`
        );
      }
    } else if (!tableExists) {
      // 表不存在，需要创建
      const createSql = await this.generateCreateTableSql(
        tableName,
        tableDefinition
      );
      await this.collectSql(
        enterprise,
        tableName,
        tableName,
        schema.database_type,
        schema.partition_type,
        schema.schema_version,
        "CREATE",
        createSql,
        `创建表 ${tableName}`
      );

      // 创建索引
      if (tableDefinition.indexes && tableDefinition.indexes.length > 0) {
        for (const index of tableDefinition.indexes) {
          const indexSql = await this.generateCreateIndexSql(tableName, index);
          await this.collectSql(
            enterprise,
            tableName,
            tableName,
            schema.database_type,
            schema.partition_type,
            schema.schema_version,
            "INDEX",
            indexSql,
            `创建索引 ${index.name} 在表 ${tableName}`
          );
        }
      }
    } else {
      // 表存在，检查是否需要修改
      const alterSqls = await this.generateAlterTableSqls(
        connection,
        tableName,
        tableDefinition
      );
      for (const alterSql of alterSqls) {
        await this.collectSql(
          enterprise,
          tableName,
          tableName,
          schema.database_type,
          schema.partition_type,
          schema.schema_version,
          "ALTER",
          alterSql.sql,
          alterSql.description
        );
      }
    }
  }

  /**
   * 检查门店分表的迁移计划
   */
  private async checkStorePartitionedTable(
    connection: Sequelize,
    tableDefinition: TableDefinition,
    enterprise: Enterprise,
    schema: TableSchema
  ): Promise<void> {
    try {
      // 查询企业的所有门店
      const stores = await this.queryStoreList(connection);
      logger.info(
        `检查企业 ${enterprise.enterprise_name} 的门店分表，共 ${stores.length} 个门店`
      );

      for (const store of stores) {
        const storeId = store.submeter_id || store.store_id || store.id;
        if (storeId) {
          await this.checkTableWithConnection(
            connection,
            {
              ...tableDefinition,
              tableName: this.getTableName(
                tableDefinition.tableName,
                String(storeId)
              ),
            },
            enterprise,
            schema
          );
        }
      }
    } catch (error) {
      logger.error(
        `检查企业 ${enterprise.enterprise_name} 门店分表失败:`,
        error
      );
      throw error;
    }
  }

  /**
   * 检查时间分表的迁移计划
   */
  private async checkTimePartitionedTableWithConfig(
    connection: Sequelize,
    tableDefinition: TableDefinition,
    schema: TableSchema,
    enterprise: Enterprise
  ): Promise<void> {
    if (!schema.time_interval || !schema.time_format) {
      logger.warn(
        `时间分表 ${tableDefinition.tableName} 缺少时间配置，跳过检查`
      );
      return;
    }

    // 生成最近一段时间的分表（比如最近3个月到未来3个月）
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1); // 3个月前
    const endDate = new Date(now.getFullYear(), now.getMonth() + 4, 0); // 3个月后

    await this.checkTimePartitionedTable(
      connection,
      tableDefinition,
      startDate,
      endDate,
      schema.time_interval || "day",
      schema.time_format || "YYYYMMDD",
      enterprise,
      schema
    );
  }

  /**
   * 检查时间分表的迁移计划（具体实现）
   */
  private async checkTimePartitionedTable(
    connection: Sequelize,
    tableDefinition: TableDefinition,
    startDate: Date,
    endDate: Date,
    interval: "day" | "month" | "year",
    timeFormat: string,
    enterprise: Enterprise,
    schema: TableSchema
  ): Promise<void> {
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const suffix = this.formatDateForTable(currentDate, interval, timeFormat);
      const partitionTableName = this.getTableName(
        tableDefinition.tableName,
        suffix
      );

      await this.checkTableWithConnection(
        connection,
        { ...tableDefinition, tableName: partitionTableName },
        enterprise,
        schema
      );

      // 递增日期
      if (interval === "day") {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (interval === "month") {
        currentDate.setMonth(currentDate.getMonth() + 1);
      } else if (interval === "year") {
        currentDate.setFullYear(currentDate.getFullYear() + 1);
      }
    }
  }

  /**
   * 生成创建表的SQL语句
   */
  private async generateCreateTableSql(
    tableName: string,
    tableDefinition: TableDefinition
  ): Promise<string> {
    let sql = `CREATE TABLE \`${tableName}\` (\n`;

    // 处理列定义
    const columnDefinitions: string[] = [];
    const primaryKeys: string[] = [];

    for (const column of tableDefinition.columns) {
      let columnSql = `  \`${column.name}\` ${this.getDataType(column)}`;

      if (!column.allowNull) {
        columnSql += " NOT NULL";
      }

      if (column.autoIncrement) {
        columnSql += " AUTO_INCREMENT";
      }

      if (column.defaultValue !== undefined) {
        columnSql += ` DEFAULT ${this.getDefaultValue(column)}`;
      }

      if (column.comment) {
        columnSql += ` COMMENT '${this.escapeComment(column.comment)}'`;
      }

      columnDefinitions.push(columnSql);

      if (column.primaryKey) {
        primaryKeys.push(column.name);
      }
    }

    sql += columnDefinitions.join(",\n");

    // 添加主键
    if (primaryKeys.length > 0) {
      sql += `,\n  PRIMARY KEY (\`${primaryKeys.join("`, `")}\`)`;
    }

    sql +=
      "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

    return sql;
  }

  /**
   * 生成创建索引的SQL语句
   */
  private async generateCreateIndexSql(
    tableName: string,
    index: { name: string; fields: string[]; unique?: boolean }
  ): Promise<string> {
    const indexType = index.unique ? "UNIQUE INDEX" : "INDEX";
    const fields = index.fields.map((field) => `\`${field}\``).join(", ");
    return `CREATE ${indexType} \`${index.name}\` ON \`${tableName}\` (${fields});`;
  }

  /**
   * 生成修改表的SQL语句
   */
  private async generateAlterTableSqls(
    connection: Sequelize,
    tableName: string,
    tableDefinition: TableDefinition
  ): Promise<Array<{ sql: string; description: string }>> {
    const alterSqls: Array<{ sql: string; description: string }> = [];

    // 获取现有表结构
    const existingColumns = await this.getExistingColumns(
      connection,
      tableName
    );
    const existingColumnNames = existingColumns.map(
      (col: any) => col.COLUMN_NAME
    );
    const definedColumnNames = tableDefinition.columns.map((col) => col.name);

    // 检查需要添加的列
    const columnsToAdd = tableDefinition.columns.filter(
      (col) => !existingColumnNames.includes(col.name)
    );

    for (const column of columnsToAdd) {
      const sql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${
        column.name
      }\` ${this.getDataType(column)}${!column.allowNull ? " NOT NULL" : ""}${
        column.defaultValue !== undefined
          ? ` DEFAULT ${this.getDefaultValue(column)}`
          : ""
      }${
        column.comment ? ` COMMENT '${this.escapeComment(column.comment)}'` : ""
      };`;

      alterSqls.push({
        sql,
        description: `添加列 ${column.name} 到表 ${tableName}`,
      });
    }

    // 检查需要删除的列
    const columnsToRemove = existingColumnNames.filter(
      (colName) => !definedColumnNames.includes(colName)
    );

    for (const columnName of columnsToRemove) {
      alterSqls.push({
        sql: `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\`;`,
        description: `删除表 ${tableName} 的列 ${columnName}`,
      });
    }

    // 这里可以继续添加列修改、索引变更等检查逻辑...

    return alterSqls;
  }

  /**
   * 获取现有表的列信息
   */
  private async getExistingColumns(
    connection: Sequelize,
    tableName: string
  ): Promise<any[]> {
    const query = `
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, 
             COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLUMN_COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName
      ORDER BY ORDINAL_POSITION
    `;

    return await connection.query(query, {
      replacements: { tableName },
      type: QueryTypes.SELECT,
    });
  }
}

export default DatabaseMigrationService;
