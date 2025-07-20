import { Sequelize } from "sequelize";
import Enterprise from "@/models/Enterprise";
import logger from "@/utils/logger";

export interface DatabaseConfig {
  hostname: string;
  username: string;
  password: string;
  hostport: string;
  database: string;
}

export class DatabaseConnectionManager {
  private connections: Map<string, Sequelize> = new Map();

  /**
   * 获取企业数据库配置
   */
  private getDatabaseConfig(
    enterprise: Enterprise,
    databaseType: "main" | "log" | "order" | "static"
  ): DatabaseConfig {
    switch (databaseType) {
      case "main":
        return {
          hostname: enterprise.database_hostname,
          username: enterprise.database_username,
          password: enterprise.database_password,
          hostport: enterprise.database_hostport,
          database: enterprise.database_name,
        };
      case "log":
        return {
          hostname:
            enterprise.log_database_hostname || enterprise.database_hostname,
          username:
            enterprise.log_database_username || enterprise.database_username,
          password:
            enterprise.log_database_password || enterprise.database_password,
          hostport:
            enterprise.log_database_hostport || enterprise.database_hostport,
          database:
            enterprise.log_database_name || `${enterprise.database_name}_log`,
        };
      case "order":
        return {
          hostname:
            enterprise.order_database_hostname || enterprise.database_hostname,
          username:
            enterprise.order_database_username || enterprise.database_username,
          password:
            enterprise.order_database_password || enterprise.database_password,
          hostport:
            enterprise.order_database_hostport || enterprise.database_hostport,
          database:
            enterprise.order_database_name ||
            `${enterprise.database_name}_order`,
        };
      case "static":
        return {
          hostname:
            enterprise.static_database_hostname || enterprise.database_hostname,
          username:
            enterprise.static_database_username || enterprise.database_username,
          password:
            enterprise.static_database_password || enterprise.database_password,
          hostport:
            enterprise.static_database_hostport || enterprise.database_hostport,
          database:
            enterprise.static_database_name ||
            `${enterprise.database_name}_static`,
        };
      default:
        throw new Error(`不支持的数据库类型: ${databaseType}`);
    }
  }

  /**
   * 创建数据库（如果不存在）
   */
  private async createDatabaseIfNotExists(
    config: DatabaseConfig
  ): Promise<void> {
    try {
      // 创建不指定数据库的连接
      const adminConnection = new Sequelize({
        dialect: "mysql",
        host: config.hostname,
        port: parseInt(config.hostport),
        username: config.username,
        password: config.password,
        logging: false,
        pool: {
          max: 1,
          min: 0,
          acquire: 30000,
          idle: 10000,
        },
      });

      // 检查数据库是否存在
      const [results] = await adminConnection.query(
        `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${config.database}'`
      );

      if ((results as any[]).length === 0) {
        // 数据库不存在，创建它
        await adminConnection.query(
          `CREATE DATABASE \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        logger.info(`数据库 ${config.database} 创建成功`);
      }

      await adminConnection.close();
    } catch (error) {
      logger.error(`创建数据库 ${config.database} 失败:`, error);
      throw error;
    }
  }

  /**
   * 获取数据库连接
   */
  async getConnection(
    enterprise: Enterprise,
    databaseType: "main" | "log" | "order" | "static"
  ): Promise<Sequelize> {
    const connectionKey = `${enterprise.enterprise_id}_${databaseType}`;

    // 检查是否已有连接
    if (this.connections.has(connectionKey)) {
      const connection = this.connections.get(connectionKey)!;
      try {
        // 测试连接是否有效
        await connection.authenticate();
        return connection;
      } catch {
        logger.warn(`连接 ${connectionKey} 已失效，重新创建连接`);
        this.connections.delete(connectionKey);
      }
    }

    // 创建新连接
    const config = this.getDatabaseConfig(enterprise, databaseType);

    // 首先确保数据库存在
    await this.createDatabaseIfNotExists(config);

    const connection = new Sequelize({
      dialect: "mysql",
      host: config.hostname,
      port: parseInt(config.hostport),
      database: config.database,
      username: config.username,
      password: config.password,
      logging: false, // 生产环境关闭SQL日志
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      define: {
        timestamps: true,
        underscored: true,
        freezeTableName: true,
      },
    });

    try {
      // 测试连接
      await connection.authenticate();
      
      // 存储连接
      this.connections.set(connectionKey, connection);
      return connection;
    } catch (error) {
      logger.error(
        `连接企业 ${enterprise.enterprise_name} (${enterprise.enterprise_id}) 的 ${databaseType} 数据库失败:`,
        error
      );
      throw error;
    }
  }

  /**
   * 关闭所有连接
   */
  async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connections.values()).map(
      (connection) => connection.close()
    );
    await Promise.all(closePromises);
    this.connections.clear();
  }

  /**
   * 关闭指定企业的连接
   */
  async closeEnterpriseConnections(enterpriseId: number): Promise<void> {
    const keysToClose = Array.from(this.connections.keys()).filter((key) =>
      key.startsWith(`${enterpriseId}_`)
    );

    for (const key of keysToClose) {
      const connection = this.connections.get(key);
      if (connection) {
        await connection.close();
        this.connections.delete(key);
      }
    }
  }

  /**
   * 获取连接统计信息
   */
  getConnectionStats(): { total: number; connections: string[] } {
    return {
      total: this.connections.size,
      connections: Array.from(this.connections.keys()),
    };
  }
}

export default DatabaseConnectionManager;
