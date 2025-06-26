import { Request, Response } from "express";
import DatabaseMigrationService from "@/services/DatabaseMigrationService";
import TableSchema from "@/models/TableSchema";
import Enterprise from "@/models/Enterprise";
import logger from "@/utils/logger";

export class MigrationController {
  private migrationService: DatabaseMigrationService;

  constructor() {
    this.migrationService = new DatabaseMigrationService();
  }

  /**
   * 创建表结构定义
   */
  async createTableSchema(req: Request, res: Response): Promise<void> {
    try {
      const {
        table_name,
        database_type,
        store_id,
        partition_type,
        partition_key,
        schema_version,
        schema_definition,
      } = req.body;

      // 验证必需字段
      if (
        !table_name ||
        !database_type ||
        !schema_version ||
        !schema_definition
      ) {
        res.status(400).json({
          success: false,
          message:
            "缺少必需字段: table_name, database_type, schema_version, schema_definition",
        });
        return;
      }

      // 验证数据库类型
      if (!["main", "log", "order", "static"].includes(database_type)) {
        res.status(400).json({
          success: false,
          message: "database_type 必须是: main, log, order, static 之一",
        });
        return;
      }

      // 验证JSON格式
      try {
        JSON.parse(schema_definition);
      } catch {
        res.status(400).json({
          success: false,
          message: "schema_definition 必须是有效的JSON格式",
        });
        return;
      }

      const schema = await TableSchema.create({
        table_name,
        database_type,
        store_id,
        partition_type: partition_type || "none",
        partition_key,
        schema_version,
        schema_definition,
        is_active: true,
      });

      res.status(201).json({
        success: true,
        data: schema,
        message: "表结构定义创建成功",
      });
    } catch (error) {
      logger.error("创建表结构定义失败:", error);
      res.status(500).json({
        success: false,
        message: "创建表结构定义失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 获取所有表结构定义
   */
  async getAllTableSchemas(req: Request, res: Response): Promise<void> {
    try {
      const schemas = await TableSchema.findAll({
        where: { is_active: true },
        order: [["created_at", "DESC"]],
      });

      res.json({
        success: true,
        data: schemas,
        message: "获取表结构定义列表成功",
      });
    } catch (error) {
      logger.error("获取表结构定义列表失败:", error);
      res.status(500).json({
        success: false,
        message: "获取表结构定义列表失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 根据ID获取表结构定义
   */
  async getTableSchemaById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const schema = await TableSchema.findByPk(id);

      if (!schema) {
        res.status(404).json({
          success: false,
          message: "表结构定义不存在",
        });
        return;
      }

      res.json({
        success: true,
        data: schema,
        message: "获取表结构定义成功",
      });
    } catch (error) {
      logger.error("获取表结构定义失败:", error);
      res.status(500).json({
        success: false,
        message: "获取表结构定义失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 更新表结构定义
   */
  async updateTableSchema(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const schema = await TableSchema.findByPk(id);
      if (!schema) {
        res.status(404).json({
          success: false,
          message: "表结构定义不存在",
        });
        return;
      }

      // 如果更新了schema_definition，验证JSON格式
      if (updateData.schema_definition) {
        try {
          JSON.parse(updateData.schema_definition);
        } catch {
          res.status(400).json({
            success: false,
            message: "schema_definition 必须是有效的JSON格式",
          });
          return;
        }
      }

      await schema.update(updateData);

      res.json({
        success: true,
        data: schema,
        message: "表结构定义更新成功",
      });
    } catch (error) {
      logger.error("更新表结构定义失败:", error);
      res.status(500).json({
        success: false,
        message: "更新表结构定义失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 删除表结构定义
   */
  async deleteTableSchema(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const schema = await TableSchema.findByPk(id);

      if (!schema) {
        res.status(404).json({
          success: false,
          message: "表结构定义不存在",
        });
        return;
      }

      await schema.update({ is_active: false });

      res.json({
        success: true,
        message: "表结构定义删除成功",
      });
    } catch (error) {
      logger.error("删除表结构定义失败:", error);
      res.status(500).json({
        success: false,
        message: "删除表结构定义失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 执行表迁移（为所有企业）
   */
  async executeMigration(req: Request, res: Response): Promise<void> {
    try {
      const { schema_id } = req.body;

      if (!schema_id) {
        res.status(400).json({
          success: false,
          message: "缺少必需字段: schema_id",
        });
        return;
      }

      const result = await this.migrationService.migrateAllEnterprises(
        schema_id
      );

      res.json({
        success: true,
        data: result,
        message: `迁移执行完成: 成功 ${result.success} 个企业，失败 ${result.failed} 个企业`,
      });
    } catch (error) {
      logger.error("执行表迁移失败:", error);
      res.status(500).json({
        success: false,
        message: "执行表迁移失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 为指定企业执行迁移
   */
  async executeMigrationForEnterprise(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { schema_id, enterprise_id } = req.body;

      if (!schema_id || !enterprise_id) {
        res.status(400).json({
          success: false,
          message: "缺少必需字段: schema_id, enterprise_id",
        });
        return;
      }

      const schema = await TableSchema.findByPk(schema_id);
      if (!schema) {
        res.status(404).json({
          success: false,
          message: "表结构定义不存在",
        });
        return;
      }

      const enterprise = await Enterprise.findByPk(enterprise_id);
      if (!enterprise) {
        res.status(404).json({
          success: false,
          message: "企业不存在",
        });
        return;
      }

      if (enterprise.status !== 1) {
        res.status(400).json({
          success: false,
          message: "企业状态异常，无法执行迁移",
        });
        return;
      }

      await this.migrationService.migrateEnterprise(enterprise, schema);

      res.json({
        success: true,
        message: `企业 ${enterprise.enterprise_name} 的迁移执行成功`,
      });
    } catch (error) {
      logger.error("执行企业迁移失败:", error);
      res.status(500).json({
        success: false,
        message: "执行企业迁移失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 批量执行迁移
   */
  async executeBatchMigration(req: Request, res: Response): Promise<void> {
    try {
      const { schema_ids } = req.body;

      if (!schema_ids || !Array.isArray(schema_ids)) {
        res.status(400).json({
          success: false,
          message: "缺少必需字段: schema_ids (数组)",
        });
        return;
      }

      const results = [];
      for (const schemaId of schema_ids) {
        try {
          const result = await this.migrationService.migrateAllEnterprises(
            schemaId
          );
          results.push({
            schema_id: schemaId,
            status: "success",
            data: result,
            message: `迁移成功: 成功 ${result.success} 个企业，失败 ${result.failed} 个企业`,
          });
        } catch (error) {
          results.push({
            schema_id: schemaId,
            status: "error",
            message: error instanceof Error ? error.message : "未知错误",
          });
        }
      }

      res.json({
        success: true,
        data: results,
        message: "批量迁移执行完成",
      });
    } catch (error) {
      logger.error("执行批量迁移失败:", error);
      res.status(500).json({
        success: false,
        message: "执行批量迁移失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 获取所有企业
   */
  async getEnterprises(req: Request, res: Response): Promise<void> {
    try {
      const enterprises = await Enterprise.findAll({
        where: { status: 1 }, // 只获取正常状态的企业
        order: [["created_at", "DESC"]],
      });

      res.json({
        success: true,
        data: enterprises,
        message: "获取企业列表成功",
      });
    } catch (error) {
      logger.error("获取企业列表失败:", error);
      res.status(500).json({
        success: false,
        message: "获取企业列表失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 获取连接统计信息
   */
  async getConnectionStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.migrationService.getConnectionStats();

      res.json({
        success: true,
        data: stats,
        message: "获取连接统计信息成功",
      });
    } catch (error) {
      logger.error("获取连接统计信息失败:", error);
      res.status(500).json({
        success: false,
        message: "获取连接统计信息失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 关闭所有数据库连接
   */
  async closeAllConnections(req: Request, res: Response): Promise<void> {
    try {
      await this.migrationService.closeAllConnections();

      res.json({
        success: true,
        message: "所有数据库连接已关闭",
      });
    } catch (error) {
      logger.error("关闭数据库连接失败:", error);
      res.status(500).json({
        success: false,
        message: "关闭数据库连接失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 创建企业
   */
  async createEnterprise(req: Request, res: Response): Promise<void> {
    try {
      const {
        enterprise_key,
        enterprise_code,
        enterprise_name,
        enterprise_logo,
        database_name,
        database_hostname,
        database_username,
        database_password,
        database_hostport,
        log_database_name,
        log_database_hostname,
        log_database_username,
        log_database_password,
        log_database_hostport,
        order_database_name,
        order_database_hostname,
        order_database_username,
        order_database_password,
        order_database_hostport,
        static_database_name,
        static_database_hostname,
        static_database_username,
        static_database_password,
        static_database_hostport,
        user_id,
        status,
      } = req.body;

      // 验证必需字段
      if (
        !enterprise_key ||
        !enterprise_code ||
        !enterprise_name ||
        !database_name
      ) {
        res.status(400).json({
          success: false,
          message:
            "缺少必需字段: enterprise_key, enterprise_code, enterprise_name, database_name",
        });
        return;
      }

      // 检查企业KEY是否已存在
      const existingByKey = await Enterprise.findOne({
        where: { enterprise_key },
      });
      if (existingByKey) {
        res.status(400).json({
          success: false,
          message: "企业KEY已存在",
        });
        return;
      }

      // 检查企业编号是否已存在
      const existingByCode = await Enterprise.findOne({
        where: { enterprise_code },
      });
      if (existingByCode) {
        res.status(400).json({
          success: false,
          message: "企业编号已存在",
        });
        return;
      }

      // 检查数据库名称是否已存在
      const existingByDb = await Enterprise.findOne({
        where: { database_name },
      });
      if (existingByDb) {
        res.status(400).json({
          success: false,
          message: "数据库名称已存在",
        });
        return;
      }

      const enterprise = await Enterprise.create({
        enterprise_key,
        enterprise_code,
        enterprise_name,
        enterprise_logo,
        database_name,
        database_hostname: database_hostname || "localhost",
        database_username: database_username || "root",
        database_password: database_password || "123456",
        database_hostport: database_hostport || "3306",
        log_database_name: log_database_name || `${database_name}_log`,
        log_database_hostname:
          log_database_hostname || database_hostname || "localhost",
        log_database_username:
          log_database_username || database_username || "root",
        log_database_password:
          log_database_password || database_password || "123456",
        log_database_hostport:
          log_database_hostport || database_hostport || "3306",
        order_database_name: order_database_name || `${database_name}_order`,
        order_database_hostname:
          order_database_hostname || database_hostname || "localhost",
        order_database_username:
          order_database_username || database_username || "root",
        order_database_password:
          order_database_password || database_password || "123456",
        order_database_hostport:
          order_database_hostport || database_hostport || "3306",
        static_database_name: static_database_name || `${database_name}_static`,
        static_database_hostname:
          static_database_hostname || database_hostname || "localhost",
        static_database_username:
          static_database_username || database_username || "root",
        static_database_password:
          static_database_password || database_password || "123456",
        static_database_hostport:
          static_database_hostport || database_hostport || "3306",
        user_id,
        status: status || 1,
      });

      res.status(201).json({
        success: true,
        data: enterprise,
        message: "企业创建成功",
      });
    } catch (error) {
      logger.error("创建企业失败:", error);
      res.status(500).json({
        success: false,
        message: "创建企业失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }
}

export default MigrationController;
