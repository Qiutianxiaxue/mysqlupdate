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
   * 统一的表升级方法（无论表是否存在）
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
      const [existingColumns] = await connection.query(
        "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLUMN_COMMENT FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION",
        {
          replacements: [tableName],
          type: "SELECT",
        }
      );

      const existingColumnNames = ((existingColumns as any[]) || []).map(
        (col) => col.COLUMN_NAME
      );

      logger.info(`现有列: ${existingColumnNames.join(", ")}`);

      // 添加新列
      for (const column of tableDefinition.columns) {
        if (!existingColumnNames.includes(column.name)) {
          logger.info(`添加新列: ${column.name}`);
          await this.addColumnWithConnection(connection, tableName, column);
        } else {
          logger.info(`列 ${column.name} 已存在，跳过`);
        }
      }

      // 更新索引
      if (tableDefinition.indexes) {
        await this.updateIndexesWithConnection(
          connection,
          tableName,
          tableDefinition.indexes
        );
      }

      logger.info(`表 ${tableName} 升级完成`);
    } catch (error) {
      logger.error(`升级表 ${tableName} 时出错:`, error);
      throw error;
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
   * 更新索引（使用指定连接）
   */
  private async updateIndexesWithConnection(
    connection: Sequelize,
    tableName: string,
    indexes: Array<{ name: string; fields: string[]; unique?: boolean }>
  ): Promise<void> {
    try {
      // 获取现有索引
      const [existingIndexes] = await connection.query(
        "SELECT DISTINCT INDEX_NAME FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND INDEX_NAME != 'PRIMARY'",
        {
          replacements: [tableName],
          type: "SELECT",
        }
      );

      const existingIndexNames = ((existingIndexes as any[]) || []).map(
        (idx) => idx.INDEX_NAME
      );

      logger.info(`表 ${tableName} 现有索引: ${existingIndexNames.join(", ")}`);

      // 只添加不存在的索引
      for (const index of indexes) {
        if (!existingIndexNames.includes(index.name)) {
          try {
            const unique = index.unique ? "UNIQUE" : "";
            const sql = `CREATE ${unique} INDEX ${
              index.name
            } ON ${tableName} (${index.fields.join(", ")})`;
            logger.info(`创建索引: ${sql}`);
            await connection.query(sql);
            logger.info(`为表 ${tableName} 创建索引 ${index.name} 成功`);
          } catch (indexError) {
            logger.warn(
              `为表 ${tableName} 创建索引 ${index.name} 失败:`,
              indexError
            );
            // 索引创建失败不应该中断整个迁移过程
          }
        } else {
          logger.info(`索引 ${index.name} 已存在，跳过创建`);
        }
      }
    } catch (error) {
      logger.error(`更新表 ${tableName} 的索引时出错:`, error);
      // 索引更新失败不应该中断迁移，只记录警告
      logger.warn(`索引更新失败，但表迁移继续进行`);
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
