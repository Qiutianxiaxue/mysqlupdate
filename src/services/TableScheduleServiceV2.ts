import cron from "node-cron";
import logger from "@/utils/logger";
import TableSchema from "@/models/TableSchema";
import Enterprise from "@/models/Enterprise";
import { DatabaseMigrationService } from "@/services/DatabaseMigrationService";
import DatabaseConnectionManager from "@/services/DatabaseConnectionManager";
import { QueryTypes } from "sequelize";

/**
 * 定时表检测服务 - 简化版
 * 每天0点检测今天和明天、本月和下月、本年和明年的表是否已经创建
 * 使用现有的单表迁移逻辑确保完整性
 */
export class TableScheduleServiceV2 {
  private static instance: TableScheduleServiceV2;
  private connectionManager: DatabaseConnectionManager;
  private migrationService: DatabaseMigrationService;
  private isRunning: boolean = false;

  private constructor() {
    this.connectionManager = new DatabaseConnectionManager();
    this.migrationService = new DatabaseMigrationService();
  }

  public static getInstance(): TableScheduleServiceV2 {
    if (!TableScheduleServiceV2.instance) {
      TableScheduleServiceV2.instance = new TableScheduleServiceV2();
    }
    return TableScheduleServiceV2.instance;
  }

  /**
   * 启动定时任务
   */
  public start(): void {
    // 每天凌晨0点执行
    cron.schedule("0 0 * * *", async () => {
      logger.info("🕒 开始定时检测分表任务");
      await this.checkAndCreateTables();
    });

    // 服务启动时立即执行一次
    // this.checkAndCreateTables();

    logger.info("📅 表定时检测服务已启动 (简化版)");
  }

  /**
   * 停止定时任务
   */
  public stop(): void {
    cron.getTasks().forEach((task) => {
      task.stop();
    });
    logger.info("📅 表定时检测服务已停止");
  }

  /**
   * 检测和创建表 - 主逻辑
   */
  public async checkAndCreateTables(): Promise<void> {
    if (this.isRunning) {
      logger.warn("表检测任务已在运行中，跳过此次执行");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info("🔍 开始检测按日期分表的表结构");

      // 1. 获取所有时间分表配置
      const timePartitionedSchemas = await TableSchema.findAll({
        where: {
          partition_type: "time",
          is_active: true,
        },
      });

      if (timePartitionedSchemas.length === 0) {
        logger.info("📋 没有找到需要检测的时间分表配置");
        return;
      }

      logger.info(`📋 找到 ${timePartitionedSchemas.length} 个时间分表配置`);

      // 2. 获取所有企业
      const enterprises = await Enterprise.findAll({
        where: { status: 1 }, // 1表示正常状态
      });

      if (enterprises.length === 0) {
        logger.info("🏢 没有找到激活的企业");
        return;
      }

      logger.info(`🏢 找到 ${enterprises.length} 个激活企业`);

      let totalCreated = 0;
      let totalChecked = 0;

      // 3. 为每个企业的每个时间分表检测和创建表
      for (const enterprise of enterprises) {
        for (const schema of timePartitionedSchemas) {
          const result = await this.processTimePartitionedTable(enterprise, schema);
          totalChecked += result.checked;
          totalCreated += result.created;
        }
      }

      const executionTime = Date.now() - startTime;
      logger.info(`✅ 表检测任务完成，耗时: ${executionTime}ms，检测: ${totalChecked} 个表，创建: ${totalCreated} 个表`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("❌ 表检测任务执行失败", { error: errorMessage });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 处理单个时间分表配置
   */
  private async processTimePartitionedTable(
    enterprise: Enterprise,
    schema: TableSchema
  ): Promise<{ checked: number; created: number }> {
    let checkedCount = 0;
    let createdCount = 0;

    try {
      const now = new Date();
      const tablesToCheck: Array<{ date: Date; description: string }> = [];

      // 根据分表间隔确定需要检测的时间点
      switch (schema.time_interval) {
        case "day":
          // 检测今天、明天
          tablesToCheck.push(
            { date: new Date(now), description: "今天" },
            {
              date: new Date(now.getTime() + 24 * 60 * 60 * 1000),
              description: "明天",
            }
          );
          break;

        case "month":
          // 检测本月、下月
          const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          tablesToCheck.push(
            { date: thisMonth, description: "本月" },
            { date: nextMonth, description: "下月" }
          );
          break;

        case "year":
          // 检测本年、明年
          const thisYear = new Date(now.getFullYear(), 0, 1);
          const nextYear = new Date(now.getFullYear() + 1, 0, 1);
          tablesToCheck.push(
            { date: thisYear, description: "本年" },
            { date: nextYear, description: "明年" }
          );
          break;

        default:
          logger.warn(
            `⚠️ 不支持的时间间隔: ${schema.time_interval}，表: ${schema.table_name}`
          );
          return { checked: 0, created: 0 };
      }

      // 检测每个时间点的表
      for (const { date, description } of tablesToCheck) {
        const result = await this.checkAndCreateSingleTable(
          enterprise,
          schema,
          date,
          description
        );
        checkedCount++;
        if (result.created) {
          createdCount++;
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`❌ 处理企业 ${enterprise.enterprise_name} 的表 ${schema.table_name} 失败`, {
        enterpriseId: enterprise.enterprise_id,
        tableName: schema.table_name,
        error: errorMessage,
      });
    }

    return { checked: checkedCount, created: createdCount };
  }

  /**
   * 检测和创建单个表
   */
  private async checkAndCreateSingleTable(
    enterprise: Enterprise,
    schema: TableSchema,
    date: Date,
    description: string
  ): Promise<{ created: boolean }> {
    try {
      const suffix = this.formatDateForTable(
        date,
        schema.time_interval!,
        schema.time_format
      );
      const tableName = `${schema.table_name}${suffix}`;

      // 1. 检查表是否存在
      const connection = await this.connectionManager.getConnection(
        enterprise,
        schema.database_type as "main" | "log" | "order" | "static"
      );
      
      const tableExists = await this.checkTableExists(connection, tableName);

      if (tableExists) {
        logger.debug(
          `✅ 表已存在: ${tableName} (${description}) - 企业: ${enterprise.enterprise_name}`
        );
        return { created: false };
      }

      // 2. 表不存在，创建临时表定义并执行迁移
      logger.info(
        `🚀 创建表: ${tableName} (${description}) - 企业: ${enterprise.enterprise_name}`
      );

      await this.createTableWithMigration(enterprise, schema, tableName);

      logger.info(
        `✅ 表创建成功: ${tableName} (${description}) - 企业: ${enterprise.enterprise_name}`
      );

      return { created: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`❌ 检测/创建表失败`, {
        enterpriseId: enterprise.enterprise_id,
        tableName: schema.table_name,
        description,
        error: errorMessage,
      });
      return { created: false };
    }
  }

  /**
   * 使用迁移服务创建表
   */
  private async createTableWithMigration(
    enterprise: Enterprise,
    schema: TableSchema,
    tableName: string
  ): Promise<void> {
    // 创建临时表定义
    const tempSchemaData: any = {
      table_name: tableName,
      database_type: schema.database_type,
      partition_type: "none" as const, // 设置为不分表
      schema_version: schema.schema_version,
      schema_definition: schema.schema_definition,
      is_active: true,
      upgrade_notes: `定时创建的时间分表: ${tableName}`,
    };

    // 添加可选字段
    if (schema.time_interval) {
      tempSchemaData.time_interval = schema.time_interval;
    }
    if (schema.time_format) {
      tempSchemaData.time_format = schema.time_format;
    }
    if (schema.current_version) {
      tempSchemaData.current_version = schema.current_version;
    }
    if (schema.changes_detected) {
      tempSchemaData.changes_detected = schema.changes_detected;
    }

    let tempSchema: TableSchema | null = null;
    let shouldCleanup = false;

    try {
      // 检查是否已经存在该表名的配置
      const existingTempSchema = await TableSchema.findOne({
        where: {
          table_name: tableName,
          database_type: schema.database_type,
          partition_type: "none",
        },
      });

      if (!existingTempSchema) {
        // 创建临时表结构配置
        tempSchema = await TableSchema.create(tempSchemaData);
        shouldCleanup = true;
        logger.debug(`📝 创建临时表定义: ${tableName}`);
      }

      // 使用现有的迁移服务创建表
      await this.migrationService.migrateTable(
        tableName,
        schema.database_type,
        schema.schema_version,
        "none", // 不使用分表逻辑，因为表名已经包含了日期后缀
        enterprise.enterprise_id
      );

    } finally {
      // 清理临时表定义
      if (tempSchema && shouldCleanup) {
        try {
          await tempSchema.destroy();
          logger.debug(`🗑️ 清理临时表定义: ${tableName}`);
        } catch (error) {
          logger.warn(`⚠️ 清理临时表定义失败: ${tableName}`, { error });
        }
      }
    }
  }

  /**
   * 检查表是否存在
   */
  private async checkTableExists(
    connection: any,
    tableName: string
  ): Promise<boolean> {
    try {
      const result = await connection.query(
        `SHOW TABLES LIKE '${tableName}'`,
        {
          type: QueryTypes.SELECT,
        }
      );
      return result.length > 0;
    } catch (error) {
      logger.error(`❌ 检查表存在性失败: ${tableName}`, { error });
      return false;
    }
  }

  /**
   * 格式化日期为表名后缀
   */
  private formatDateForTable(
    date: Date,
    interval: "day" | "month" | "year",
    timeFormat?: string
  ): string {
    if (timeFormat) {
      // 使用自定义格式
      return this.formatDateWithCustomFormat(date, timeFormat);
    }

    // 使用默认格式
    switch (interval) {
      case "day":
        return `_${date.getFullYear()}${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}${String(date.getDate()).padStart(2, "0")}`;
      case "month":
        return `_${date.getFullYear()}${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}`;
      case "year":
        return `_${date.getFullYear()}`;
      default:
        return `_${date.getFullYear()}${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}${String(date.getDate()).padStart(2, "0")}`;
    }
  }

  /**
   * 使用自定义格式格式化日期
   */
  private formatDateWithCustomFormat(date: Date, format: string): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return format
      .replace(/YYYY/g, year.toString())
      .replace(/MM/g, month)
      .replace(/DD/g, day);
  }

  /**
   * 手动触发检测（用于测试或手动执行）
   */
  public async manualCheck(): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      await this.checkAndCreateTables();
      return {
        success: true,
        message: "手动检测任务执行成功",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "手动检测任务执行失败",
        details: errorMessage,
      };
    }
  }
}
