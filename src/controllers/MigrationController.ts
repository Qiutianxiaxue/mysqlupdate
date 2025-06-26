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
   * 创建或更新表结构定义
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
        upgrade_notes,
      } = req.body;

      // 验证必需字段
      if (
        !table_name ||
        !database_type ||
        !partition_type ||
        !schema_version ||
        !schema_definition
      ) {
        res.status(400).json({
          success: false,
          message:
            "缺少必需字段: table_name, database_type, partition_type, schema_version, schema_definition",
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

      // 验证分区类型
      if (!["store", "time", "none"].includes(partition_type)) {
        res.status(400).json({
          success: false,
          message: "partition_type 必须是: store, time, none 之一",
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

      let schema;
      let isUpdate = false;

      // 基于table_name、partition_type和database_type检查是否已存在
      const existingSchema = await TableSchema.findOne({
        where: {
          table_name,
          database_type,
          partition_type,
          is_active: true,
        },
      });

      if (existingSchema) {
        // 如果存在激活状态的表定义，检查版本号
        if (schema_version <= existingSchema.schema_version) {
          res.status(400).json({
            success: false,
            message: `表定义 ${table_name} (${database_type}, ${partition_type}) 已存在，新版本号 ${schema_version} 必须大于当前版本号 ${existingSchema.schema_version}`,
          });
          return;
        }

        // 自动升级：创建新版本并将旧版本标记为非激活
        isUpdate = true;
        const createData: any = {
          table_name: existingSchema.table_name,
          database_type: existingSchema.database_type,
          partition_type: existingSchema.partition_type,
          schema_version,
          schema_definition,
          is_active: true,
          upgrade_notes: upgrade_notes || `自动升级到版本 ${schema_version}`,
        };

        if (existingSchema.store_id) {
          createData.store_id = existingSchema.store_id;
        }

        if (existingSchema.partition_key) {
          createData.partition_key = existingSchema.partition_key;
        }

        schema = await TableSchema.create(createData);

        // 将旧版本标记为非活跃
        await existingSchema.update({ is_active: false });

        logger.info(
          `表定义升级成功: ${table_name} (${database_type}, ${partition_type}) 从版本 ${existingSchema.schema_version} 升级到 ${schema_version}`
        );
      } else {
        // 全新创建
        schema = await TableSchema.create({
          table_name,
          database_type,
          store_id,
          partition_type,
          partition_key,
          schema_version,
          schema_definition,
          is_active: true,
          upgrade_notes,
        });

        logger.info(
          `新表定义创建成功: ${table_name} (${database_type}, ${partition_type}) 版本 ${schema_version}`
        );
      }

      res.status(201).json({
        success: true,
        data: schema,
        message: isUpdate ? "表结构定义升级成功" : "表结构定义创建成功",
      });
    } catch (error) {
      logger.error("创建/更新表结构定义失败:", error);
      res.status(500).json({
        success: false,
        message: "创建/更新表结构定义失败",
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
   * 根据表定义信息获取表结构定义
   */
  async getTableSchemaById(req: Request, res: Response): Promise<void> {
    try {
      const { table_name, database_type, partition_type, schema_version } =
        req.body;

      if (!table_name || !database_type || !partition_type) {
        res.status(400).json({
          success: false,
          message: "缺少必需字段: table_name, database_type, partition_type",
        });
        return;
      }

      // 基于table_name、partition_type和database_type查找表结构定义
      const whereCondition: any = {
        table_name,
        database_type,
        partition_type,
        is_active: true,
      };

      // 如果指定了版本号，则查找特定版本
      if (schema_version) {
        whereCondition.schema_version = schema_version;
      }

      const schema = await TableSchema.findOne({
        where: whereCondition,
        order: [["schema_version", "DESC"]], // 如果没有指定版本，则使用最新版本
      });

      if (!schema) {
        res.status(404).json({
          success: false,
          message: `表结构定义不存在: ${table_name} (${database_type}, ${partition_type})${
            schema_version ? ` 版本 ${schema_version}` : ""
          }`,
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
   * 删除表结构定义（标记为非活跃）
   */
  async deleteTableSchema(req: Request, res: Response): Promise<void> {
    try {
      const { table_name, database_type, partition_type, schema_version } =
        req.body;

      if (!table_name || !database_type || !partition_type) {
        res.status(400).json({
          success: false,
          message: "缺少必需字段: table_name, database_type, partition_type",
        });
        return;
      }

      // 基于table_name、partition_type和database_type查找表结构定义
      const whereCondition: any = {
        table_name,
        database_type,
        partition_type,
        is_active: true,
      };

      // 如果指定了版本号，则删除特定版本
      if (schema_version) {
        whereCondition.schema_version = schema_version;
      }

      const schema = await TableSchema.findOne({
        where: whereCondition,
        order: [["schema_version", "DESC"]], // 如果没有指定版本，则删除最新版本
      });

      if (!schema) {
        res.status(404).json({
          success: false,
          message: `表结构定义不存在: ${table_name} (${database_type}, ${partition_type})${
            schema_version ? ` 版本 ${schema_version}` : ""
          }`,
        });
        return;
      }

      await schema.update({ is_active: false });

      res.json({
        success: true,
        message: `表结构定义删除成功: ${table_name} (${database_type}, ${partition_type}) 版本 ${schema.schema_version}`,
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
   * 执行表迁移（自动使用最新版本）
   */
  async executeMigration(req: Request, res: Response): Promise<void> {
    try {
      const { table_name, database_type } = req.body;

      if (!table_name || !database_type) {
        res.status(400).json({
          success: false,
          message: "缺少必需字段: table_name, database_type",
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

      // 查找该表的最新版本结构定义
      const latestSchema = await TableSchema.findOne({
        where: {
          table_name,
          database_type,
          is_active: true,
        },
        order: [["schema_version", "DESC"]], // 获取最新版本
      });

      if (!latestSchema) {
        res.status(404).json({
          success: false,
          message: `未找到表 ${table_name} (${database_type}) 的结构定义`,
        });
        return;
      }

      logger.info(
        `开始执行表 ${table_name} (${database_type}) 的迁移，使用版本 ${latestSchema.schema_version}`
      );

      // 使用最新版本执行迁移
      await this.migrationService.migrateTable(
        table_name,
        database_type,
        latestSchema.schema_version
      );

      res.json({
        success: true,
        message: `表 ${table_name} (${database_type}) 迁移执行完成，使用版本 ${latestSchema.schema_version}`,
        data: {
          table_name: latestSchema.table_name,
          database_type: latestSchema.database_type,
          partition_type: latestSchema.partition_type,
          schema_version: latestSchema.schema_version,
          upgrade_notes: latestSchema.upgrade_notes,
        },
      });
    } catch (error) {
      logger.error("执行迁移失败:", error);
      res.status(500).json({
        success: false,
        message: "执行迁移失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 通过表定义信息执行迁移
   */
  async executeMigrationBySchemaId(req: Request, res: Response): Promise<void> {
    try {
      const { table_name, database_type, partition_type, schema_version } =
        req.body;

      if (!table_name || !database_type || !partition_type) {
        res.status(400).json({
          success: false,
          message: "缺少必需字段: table_name, database_type, partition_type",
        });
        return;
      }

      // 基于table_name、partition_type和database_type查找表结构定义
      const whereCondition: any = {
        table_name,
        database_type,
        partition_type,
        is_active: true,
      };

      // 如果指定了版本号，则查找特定版本
      if (schema_version) {
        whereCondition.schema_version = schema_version;
      }

      const schema = await TableSchema.findOne({
        where: whereCondition,
        order: [["schema_version", "DESC"]], // 如果没有指定版本，则使用最新版本
      });

      if (!schema) {
        res.status(404).json({
          success: false,
          message: `表结构定义不存在: ${table_name} (${database_type}, ${partition_type})${
            schema_version ? ` 版本 ${schema_version}` : ""
          }`,
        });
        return;
      }

      await this.migrationService.migrateTable(
        schema.table_name,
        schema.database_type,
        schema.schema_version
      );

      res.json({
        success: true,
        message: `表 ${schema.table_name} (${schema.database_type}, ${schema.partition_type}) 版本 ${schema.schema_version} 迁移执行完成`,
      });
    } catch (error) {
      logger.error("执行迁移失败:", error);
      res.status(500).json({
        success: false,
        message: "执行迁移失败",
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
        order: [["enterprise_id", "ASC"]], // 使用enterprise_id排序
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

  /**
   * 获取表结构定义的历史版本
   */
  async getTableSchemaHistory(req: Request, res: Response): Promise<void> {
    try {
      const { table_name, database_type } = req.query;

      if (!table_name || !database_type) {
        res.status(400).json({
          success: false,
          message: "缺少必需参数: table_name, database_type",
        });
        return;
      }

      const schemas = await TableSchema.findAll({
        where: {
          table_name: table_name as string,
          database_type: database_type as string,
        },
        order: [["schema_version", "DESC"]],
      });

      res.json({
        success: true,
        data: schemas,
        message: "获取表结构定义历史成功",
      });
    } catch (error) {
      logger.error("获取表结构定义历史失败:", error);
      res.status(500).json({
        success: false,
        message: "获取表结构定义历史失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }
}

export default MigrationController;
