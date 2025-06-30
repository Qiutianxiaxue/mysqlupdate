import { Request, Response } from "express";
import DatabaseMigrationService from "@/services/DatabaseMigrationService";
import { MigrationLockService } from "@/services/MigrationLockService";
import TableSchema from "@/models/TableSchema";
import Enterprise from "@/models/Enterprise";
import logger from "@/utils/logger";

export class MigrationController {
  private migrationService: DatabaseMigrationService;
  private lockService: MigrationLockService;

  constructor() {
    this.migrationService = new DatabaseMigrationService();
    this.lockService = MigrationLockService.getInstance();
  }

  /**
   * 比较语义化版本号，判断新版本是否大于旧版本
   * @param newVersion 新版本号 (如 "1.2.19")
   * @param oldVersion 旧版本号 (如 "1.2.9")
   * @returns 新版本是否大于旧版本
   */
  private isVersionGreater(newVersion: string, oldVersion: string): boolean {
    try {
      // 处理版本号格式，支持 "1.2.3" 或 "v1.2.3" 格式
      const cleanNew = newVersion.replace(/^v/, "");
      const cleanOld = oldVersion.replace(/^v/, "");

      // 分割版本号并转换为数字数组
      const newParts = cleanNew.split(".").map((part) => {
        const num = parseInt(part, 10);
        return isNaN(num) ? 0 : num;
      });

      const oldParts = cleanOld.split(".").map((part) => {
        const num = parseInt(part, 10);
        return isNaN(num) ? 0 : num;
      });

      // 确保两个版本号都有至少3个部分 (major.minor.patch)
      while (newParts.length < 3) newParts.push(0);
      while (oldParts.length < 3) oldParts.push(0);

      // 逐级比较：major -> minor -> patch
      for (let i = 0; i < Math.max(newParts.length, oldParts.length); i++) {
        const newPart = newParts[i] || 0;
        const oldPart = oldParts[i] || 0;

        if (newPart > oldPart) {
          return true; // 新版本更大
        } else if (newPart < oldPart) {
          return false; // 新版本更小
        }
        // 如果相等，继续比较下一级
      }

      // 完全相等
      return false;
    } catch (error) {
      logger.error(`版本号比较失败: ${newVersion} vs ${oldVersion}`, error);
      // 出错时回退到字符串比较
      return newVersion > oldVersion;
    }
  }

  /**
   * 创建或更新表结构定义
   */
  async createTableSchema(req: Request, res: Response): Promise<void> {
    try {
      const {
        table_name,
        database_type,
        partition_type,
        // 时间分区相关字段
        time_interval,
        time_format,
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
        if (
          !this.isVersionGreater(schema_version, existingSchema.schema_version)
        ) {
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

        // 添加时间分区相关字段，优先使用请求中的新值，否则保留原有值
        if (time_interval || existingSchema.time_interval) {
          createData.time_interval =
            time_interval || existingSchema.time_interval;
        }
        if (time_format || existingSchema.time_format) {
          createData.time_format = time_format || existingSchema.time_format;
        }

        schema = await TableSchema.create(createData);

        // 将旧版本标记为非活跃
        await existingSchema.update({ is_active: false });

        logger.info(
          `表定义升级成功: ${table_name} (${database_type}, ${partition_type}) 从版本 ${existingSchema.schema_version} 升级到 ${schema_version}`
        );
      } else {
        // 全新创建
        const createData: any = {
          table_name,
          database_type,
          partition_type,
          schema_version,
          schema_definition,
          is_active: true,
          upgrade_notes,
        };

        // 添加时间分区相关字段（仅在提供时添加）
        if (time_interval) createData.time_interval = time_interval;
        if (time_format) createData.time_format = time_format;

        schema = await TableSchema.create(createData);

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
        order: [["create_time", "DESC"]],
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
  async getTableSchemaByCondition(req: Request, res: Response): Promise<void> {
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
   * 执行单表迁移
   * 支持指定版本和分区类型，兼容多种使用场景
   */
  async executeMigration(req: Request, res: Response): Promise<void> {
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

      // 验证数据库类型
      if (!["main", "log", "order", "static"].includes(database_type)) {
        res.status(400).json({
          success: false,
          message: "database_type 必须是: main, log, order, static 之一",
        });
        return;
      }

      // 验证分区类型（如果提供）
      if (!["store", "time", "none"].includes(partition_type)) {
        res.status(400).json({
          success: false,
          message: "partition_type 必须是: store, time, none 之一",
        });
        return;
      }

      // 构建查询条件
      const whereCondition: any = {
        table_name,
        database_type,
        is_active: true,
      };

      // 如果指定了分区类型，添加到查询条件
      if (partition_type) {
        whereCondition.partition_type = partition_type;
      }

      // 如果指定了版本号，添加到查询条件
      if (schema_version) {
        whereCondition.schema_version = schema_version;
      }

      // 查找表结构定义
      let schema: any = null;

      if (partition_type) {
        // 如果指定了分区类型，直接查找特定schema
        schema = await TableSchema.findOne({
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
      } else {
        // 如果没有指定分区类型，查找所有匹配的schema
        const allSchemas = await TableSchema.findAll({
          where: whereCondition,
          order: [
            ["partition_type", "ASC"],
            ["schema_version", "DESC"],
          ], // 按分区类型和版本排序
        });

        if (allSchemas.length === 0) {
          res.status(404).json({
            success: false,
            message: `未找到表结构定义: ${table_name} (database_type: ${database_type})`,
          });
          return;
        }

        // 如果存在多个分区类型，需要用户明确指定
        const uniquePartitionTypes = [
          ...new Set(allSchemas.map((s) => s.partition_type)),
        ];
        if (uniquePartitionTypes.length > 1) {
          res.status(400).json({
            success: false,
            message: `表 ${table_name} (${database_type}) 存在多种分区类型: [${uniquePartitionTypes.join(
              ", "
            )}]，请在请求中指定 partition_type 参数`,
            available_partition_types: uniquePartitionTypes,
          });
          return;
        }

        // 使用找到的第一个（最新版本的）schema
        schema = allSchemas[0];
      }

      if (!schema) {
        res.status(500).json({
          success: false,
          message: `数据异常：未能获取表结构定义`,
        });
        return;
      }

      logger.info(
        `开始执行表 ${table_name} (${database_type}) 的迁移，使用版本 ${schema.schema_version}`
      );

      // 获取迁移锁
      const lockResult = await this.lockService.acquireLock(
        "SINGLE_TABLE",
        schema.table_name,
        schema.database_type,
        schema.partition_type,
        `单表迁移: ${schema.table_name} 到版本 ${schema.schema_version}`
      );

      if (!lockResult.success) {
        res.status(409).json({
          success: false,
          message: `无法获取迁移锁: ${lockResult.message}`,
          error: "MIGRATION_LOCK_CONFLICT",
          conflict_info: lockResult.conflictLock
            ? {
                table_name: lockResult.conflictLock.table_name,
                database_type: lockResult.conflictLock.database_type,
                partition_type: lockResult.conflictLock.partition_type,
                start_time: lockResult.conflictLock.start_time,
                lock_holder: lockResult.conflictLock.lock_holder,
              }
            : undefined,
        });
        return;
      }

      const lockKey = lockResult.lock!.lock_key;

      try {
        // 执行迁移
        await this.migrationService.migrateTable(
          schema.table_name,
          schema.database_type,
          schema.schema_version,
          schema.partition_type
        );
      } finally {
        // 释放锁
        await this.lockService.releaseLock(lockKey);
      }

      res.json({
        success: true,
        message: `表 ${schema.table_name} (${schema.database_type}, ${schema.partition_type}) 版本 ${schema.schema_version} 迁移执行完成`,
        data: {
          table_name: schema.table_name,
          database_type: schema.database_type,
          partition_type: schema.partition_type,
          schema_version: schema.schema_version,
          upgrade_notes: schema.upgrade_notes,
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
   * 一键迁移所有已确认的表（基于TableSchema表中的配置）
   */
  async migrateAllTables(req: Request, res: Response): Promise<void> {
    try {
      logger.info("开始一键迁移所有已确认的表");

      // 获取全量迁移锁
      const lockResult = await this.lockService.acquireLock(
        "ALL_TABLES",
        undefined,
        undefined,
        undefined,
        "一键迁移所有表"
      );

      if (!lockResult.success) {
        res.status(409).json({
          success: false,
          message: `无法获取全量迁移锁: ${lockResult.message}`,
          error: "MIGRATION_LOCK_CONFLICT",
          conflict_info: lockResult.conflictLock
            ? {
                table_name: lockResult.conflictLock.table_name,
                database_type: lockResult.conflictLock.database_type,
                partition_type: lockResult.conflictLock.partition_type,
                lock_type: lockResult.conflictLock.lock_type,
                start_time: lockResult.conflictLock.start_time,
                lock_holder: lockResult.conflictLock.lock_holder,
              }
            : undefined,
        });
        return;
      }

      const lockKey = lockResult.lock!.lock_key;

      try {
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
          res.json({
            success: true,
            message: "没有找到需要迁移的表结构定义",
            data: {
              total_schemas: 0,
              tables_migrated: 0,
              migration_results: [],
            },
          });
          return;
        }

        logger.info(`找到 ${allSchemas.length} 个表结构定义需要迁移`);

        // 2. 对每个表结构定义执行迁移
        const migrationResults: Array<{
          table_name: string;
          database_type: string;
          partition_type: string;
          schema_version: string;
          success: boolean;
          message: string;
          error?: string;
          upgrade_notes?: string;
        }> = [];

        let successCount = 0;
        let failureCount = 0;

        for (const schema of allSchemas) {
          try {
            logger.info(
              `迁移表: ${schema.table_name} (${schema.database_type}, ${schema.partition_type}) 到版本 ${schema.schema_version}`
            );

            // 执行迁移
            await this.migrationService.migrateTable(
              schema.table_name,
              schema.database_type,
              schema.schema_version,
              schema.partition_type
            );

            migrationResults.push({
              table_name: schema.table_name,
              database_type: schema.database_type,
              partition_type: schema.partition_type,
              schema_version: schema.schema_version,
              success: true,
              message: `迁移成功到版本 ${schema.schema_version}`,
              ...(schema.upgrade_notes && {
                upgrade_notes: schema.upgrade_notes,
              }),
            });

            successCount++;
            logger.info(`✅ 表 ${schema.table_name} 迁移成功`);
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "未知错误";

            migrationResults.push({
              table_name: schema.table_name,
              database_type: schema.database_type,
              partition_type: schema.partition_type,
              schema_version: schema.schema_version,
              success: false,
              message: `迁移失败`,
              error: errorMessage,
              ...(schema.upgrade_notes && {
                upgrade_notes: schema.upgrade_notes,
              }),
            });

            failureCount++;
            logger.error(`❌ 表 ${schema.table_name} 迁移失败:`, error);
          }
        }

        const totalTables = allSchemas.length;
        const message = `一键迁移完成！成功: ${successCount}/${totalTables}, 失败: ${failureCount}/${totalTables}`;

        // 3. 按数据库类型统计结果
        const byDatabaseType: {
          [key: string]: { total: number; success: number; failure: number };
        } = {};
        migrationResults.forEach((result) => {
          const dbType = result.database_type;
          if (!byDatabaseType[dbType]) {
            byDatabaseType[dbType] = {
              total: 0,
              success: 0,
              failure: 0,
            };
          }
          byDatabaseType[dbType].total++;
          if (result.success) {
            byDatabaseType[dbType].success++;
          } else {
            byDatabaseType[dbType].failure++;
          }
        });

        res.json({
          success: failureCount === 0, // 只有全部成功才返回true
          message,
          data: {
            total_schemas: totalTables,
            tables_migrated: successCount,
            migration_results: migrationResults,
          },
          summary: {
            migration_success: successCount,
            migration_failure: failureCount,
            by_database_type: byDatabaseType,
          },
        });

        logger.info(message);
      } finally {
        // 释放锁
        await this.lockService.releaseLock(lockKey);
      }
    } catch (error) {
      logger.error("一键迁移失败:", error);
      res.status(500).json({
        success: false,
        message: "一键迁移失败",
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
   * 获取活跃的迁移锁
   */
  async getActiveMigrationLocks(req: Request, res: Response): Promise<void> {
    try {
      const activeLocks = await this.lockService.getActiveLocks();

      res.json({
        success: true,
        data: activeLocks,
        count: activeLocks.length,
        message: "获取活跃迁移锁成功",
      });
    } catch (error) {
      logger.error("获取活跃迁移锁失败:", error);
      res.status(500).json({
        success: false,
        message: "获取活跃迁移锁失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 强制释放迁移锁
   */
  async forceReleaseMigrationLock(req: Request, res: Response): Promise<void> {
    try {
      const { lock_key } = req.body;

      if (!lock_key) {
        res.status(400).json({
          success: false,
          message: "缺少必需字段: lock_key",
        });
        return;
      }

      const result = await this.lockService.forceReleaseLock(lock_key);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
        });
      } else {
        res.status(404).json({
          success: false,
          message: result.message,
        });
      }
    } catch (error) {
      logger.error("强制释放迁移锁失败:", error);
      res.status(500).json({
        success: false,
        message: "强制释放迁移锁失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 清理过期的迁移锁
   */
  async cleanupExpiredMigrationLocks(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { hours_old } = req.body;
      const hoursOld = hours_old || 24; // 默认24小时

      const result = await this.lockService.cleanupExpiredLocks(hoursOld);

      res.json({
        success: result.success,
        message: result.message,
        cleaned_count: result.cleanedCount,
      });
    } catch (error) {
      logger.error("清理过期迁移锁失败:", error);
      res.status(500).json({
        success: false,
        message: "清理过期迁移锁失败",
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
