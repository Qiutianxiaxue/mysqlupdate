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
   * 为所有企业执行表迁移
   */
  async migrateAllEnterprises(
    schemaId: number
  ): Promise<{ success: number; failed: number; details: any[] }> {
    try {
      const schema = await TableSchema.findByPk(schemaId);
      if (!schema) {
        throw new Error(`表结构定义 ${schemaId} 不存在`);
      }

      // 获取所有正常状态的企业
      const enterprises = await Enterprise.findAll({
        where: { status: 1 }, // 1表示正常状态
      });

      if (enterprises.length === 0) {
        logger.warn("没有找到正常状态的企业");
        return { success: 0, failed: 0, details: [] };
      }

      const results = [];
      let successCount = 0;
      let failedCount = 0;

      for (const enterprise of enterprises) {
        try {
          await this.migrateEnterprise(enterprise, schema);
          results.push({
            enterprise_id: enterprise.enterprise_id,
            enterprise_name: enterprise.enterprise_name,
            status: "success",
            message: "迁移成功",
          });
          successCount++;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "未知错误";
          results.push({
            enterprise_id: enterprise.enterprise_id,
            enterprise_name: enterprise.enterprise_name,
            status: "failed",
            message: errorMessage,
          });
          failedCount++;
          logger.error(
            `企业 ${enterprise.enterprise_name} (${enterprise.enterprise_id}) 迁移失败:`,
            error
          );
        }
      }

      logger.info(
        `批量迁移完成: 成功 ${successCount} 个企业，失败 ${failedCount} 个企业`
      );
      return { success: successCount, failed: failedCount, details: results };
    } catch (error) {
      logger.error("批量迁移失败:", error);
      throw error;
    }
  }

  /**
   * 为指定企业执行表迁移
   */
  async migrateEnterprise(
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

      if (schema.partition_type === "store" && schema.store_id) {
        await this.createOrUpdateTableWithConnection(
          connection,
          tableDefinition,
          schema.store_id
        );
      } else if (schema.partition_type === "time") {
        // 这里需要根据实际情况设置时间范围
        const now = new Date();
        const startDate = new Date(now.getFullYear(), 0, 1); // 今年开始
        const endDate = new Date(now.getFullYear(), 11, 31); // 今年结束
        await this.createTimePartitionedTableWithConnection(
          connection,
          tableDefinition,
          startDate,
          endDate,
          "month"
        );
      } else {
        await this.createOrUpdateTableWithConnection(
          connection,
          tableDefinition
        );
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
   * 使用指定连接创建或更新表结构
   */
  async createOrUpdateTableWithConnection(
    connection: Sequelize,
    tableDefinition: TableDefinition,
    storeId?: string
  ): Promise<void> {
    try {
      const tableName = this.getTableName(tableDefinition.tableName, storeId);
      logger.info(`开始处理表: ${tableName}`);

      // 检查表是否存在
      const tableExists = await this.tableExistsWithConnection(
        connection,
        tableName
      );

      if (tableExists) {
        await this.updateTableWithConnection(
          connection,
          tableName,
          tableDefinition
        );
      } else {
        await this.createTableWithConnection(
          connection,
          tableName,
          tableDefinition
        );
      }

      logger.info(`表 ${tableName} 处理完成`);
    } catch (error) {
      logger.error(`处理表 ${tableDefinition.tableName} 失败:`, error);
      throw error;
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
      const [results] = await connection.query(
        "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
        {
          replacements: [tableName],
          type: "SELECT",
        }
      );

      // 修复结果访问方式
      const resultArray = results as any[];
      if (resultArray && resultArray.length > 0) {
        return resultArray[0].count > 0;
      }
      return false;
    } catch (error) {
      logger.error(`检查表 ${tableName} 是否存在时出错:`, error);
      return false;
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
            if (typeof col.defaultValue === "string") {
              definition += ` DEFAULT '${col.defaultValue}'`;
            } else {
              definition += ` DEFAULT ${col.defaultValue}`;
            }
          }
          if (col.comment) definition += ` COMMENT '${col.comment}'`;

          return definition;
        })
        .join(", ");

      let createTableSQL = `CREATE TABLE ${tableName} (${columnDefinitions})`;

      // 添加索引
      if (tableDefinition.indexes) {
        const indexDefinitions = tableDefinition.indexes.map((index) => {
          const unique = index.unique ? "UNIQUE" : "";
          return `${unique} INDEX ${index.name} (${index.fields.join(", ")})`;
        });
        createTableSQL += `, ${indexDefinitions.join(", ")}`;
      }

      await connection.query(createTableSQL);
      logger.info(`创建表 ${tableName} 成功`);
    } catch (error) {
      logger.error(`创建表 ${tableName} 失败:`, error);
      throw error;
    }
  }

  /**
   * 更新现有表（使用指定连接）
   */
  private async updateTableWithConnection(
    connection: Sequelize,
    tableName: string,
    tableDefinition: TableDefinition
  ): Promise<void> {
    try {
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

      // 添加新列
      for (const column of tableDefinition.columns) {
        if (!existingColumnNames.includes(column.name)) {
          await this.addColumnWithConnection(connection, tableName, column);
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
    } catch (error) {
      logger.error(`更新表 ${tableName} 时出错:`, error);
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
    const columnDefinition = `${column.name} ${this.getDataType(column)}`;
    let alterSQL = `ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`;

    if (!column.allowNull) alterSQL += " NOT NULL";
    if (column.unique) alterSQL += " UNIQUE";
    if (column.defaultValue !== undefined) {
      if (typeof column.defaultValue === "string") {
        alterSQL += ` DEFAULT '${column.defaultValue}'`;
      } else {
        alterSQL += ` DEFAULT ${column.defaultValue}`;
      }
    }
    if (column.comment) alterSQL += ` COMMENT '${column.comment}'`;

    await connection.query(alterSQL);
    logger.info(`为表 ${tableName} 添加列 ${column.name} 成功`);
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
        "SELECT INDEX_NAME FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ?",
        {
          replacements: [tableName],
          type: "SELECT",
        }
      );

      const existingIndexNames = ((existingIndexes as any[]) || []).map(
        (idx) => idx.INDEX_NAME
      );

      // 删除不存在的索引
      for (const index of indexes) {
        if (existingIndexNames.includes(index.name)) {
          await connection.query(`DROP INDEX ${index.name} ON ${tableName}`);
        }
      }

      // 添加新索引
      for (const index of indexes) {
        const unique = index.unique ? "UNIQUE" : "";
        await connection.query(
          `CREATE ${unique} INDEX ${
            index.name
          } ON ${tableName} (${index.fields.join(", ")})`
        );
      }
    } catch (error) {
      logger.error(`更新表 ${tableName} 的索引时出错:`, error);
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
   * 按时间分表（使用指定连接）
   */
  async createTimePartitionedTableWithConnection(
    connection: Sequelize,
    tableDefinition: TableDefinition,
    startDate: Date,
    endDate: Date,
    interval: "month" | "year"
  ): Promise<void> {
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const timeSuffix = this.formatDateForTable(currentDate, interval);
      await this.createOrUpdateTableWithConnection(
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
   * 从表结构定义创建表（兼容旧版本）
   */
  async createTableFromSchema(schemaId: number): Promise<void> {
    try {
      const schema = await TableSchema.findByPk(schemaId);
      if (!schema) {
        throw new Error(`表结构定义 ${schemaId} 不存在`);
      }

      // 获取所有正常状态的企业
      const enterprises = await Enterprise.findAll({
        where: { status: 1 },
      });

      for (const enterprise of enterprises) {
        await this.migrateEnterprise(enterprise, schema);
      }

      logger.info(`从表结构定义 ${schemaId} 创建表成功`);
    } catch (error) {
      logger.error(`从表结构定义创建表失败:`, error);
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
}

export default DatabaseMigrationService;
