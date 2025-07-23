import cron from "node-cron";
import logger from "@/utils/logger";
import TableSchema from "@/models/TableSchema";
import Enterprise from "@/models/Enterprise";
import { DatabaseMigrationService } from "@/services/DatabaseMigrationService";
import DatabaseConnectionManager from "@/services/DatabaseConnectionManager";
import { QueryTypes } from "sequelize";

/**
 * 日志表清理服务
 * 自动清理过期的日志分表，并通过迁移确保未来表的创建
 */
export class LogTableCleanupService {
  private static instance: LogTableCleanupService;
  private connectionManager: DatabaseConnectionManager;
  private migrationService: DatabaseMigrationService;
  private isRunning: boolean = false;

  // 清理策略配置
  private readonly CLEANUP_RULES = {
    day: 30,    // 日表保留30天
    month: 3,   // 月表保留3个月
    year: 3,    // 年表保留3年
  };

  private constructor() {
    this.connectionManager = new DatabaseConnectionManager();
    this.migrationService = new DatabaseMigrationService();
  }

  public static getInstance(): LogTableCleanupService {
    if (!LogTableCleanupService.instance) {
      LogTableCleanupService.instance = new LogTableCleanupService();
    }
    return LogTableCleanupService.instance;
  }

  /**
   * 启动定时任务
   */
  public start(): void {
    // 每天凌晨2点执行清理任务
    cron.schedule("0 2 * * *", async () => {
      logger.info("🧹 开始定时清理日志表任务");
      await this.cleanupLogTables();
    });

    logger.info("🧹 日志表清理服务已启动");
  }

  /**
   * 停止定时任务
   */
  public stop(): void {
    cron.getTasks().forEach((task) => {
      task.stop();
    });
    logger.info("🧹 日志表清理服务已停止");
  }

  /**
   * 执行日志表清理 - 主逻辑
   */
  public async cleanupLogTables(): Promise<void> {
    if (this.isRunning) {
      logger.warn("日志表清理任务已在运行中，跳过此次执行");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info("🔍 开始检索需要清理的日志分表配置");

      // 1. 获取所有日志库的时间分表配置
      const logTimePartitionedSchemas = await TableSchema.findAll({
        where: {
          partition_type: "time",
          database_type: "log",
          is_active: true,
        },
      });

      if (logTimePartitionedSchemas.length === 0) {
        logger.info("📋 没有找到需要清理的日志时间分表配置");
        return;
      }

      logger.info(`📋 找到 ${logTimePartitionedSchemas.length} 个日志时间分表配置`);

      // 2. 获取所有企业
      const enterprises = await Enterprise.findAll({
        where: { status: 1 }, // 1表示正常状态
      });

      if (enterprises.length === 0) {
        logger.info("🏢 没有找到激活的企业");
        return;
      }

      logger.info(`🏢 找到 ${enterprises.length} 个激活企业`);

      let totalCleaned = 0;
      let totalMigrated = 0;

      // 3. 为每个企业的每个日志时间分表执行清理
      for (const enterprise of enterprises) {
        for (const schema of logTimePartitionedSchemas) {
          const result = await this.processLogTableCleanup(enterprise, schema);
          totalCleaned += result.cleaned;
          if (result.migrated) {
            totalMigrated++;
          }
        }
      }

      const executionTime = Date.now() - startTime;
      logger.info(`✅ 日志表清理任务完成，耗时: ${executionTime}ms，清理: ${totalCleaned} 个表，迁移: ${totalMigrated} 个配置`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("❌ 日志表清理任务执行失败", { error: errorMessage });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 处理单个企业的单个日志表配置的清理
   */
  private async processLogTableCleanup(
    enterprise: Enterprise,
    schema: TableSchema
  ): Promise<{ cleaned: number; migrated: boolean }> {
    let cleanedCount = 0;
    let migrated = false;

    try {
      const actualBaseTableName = this.extractBaseTableName(schema.table_name);
      logger.info(`🔍 开始清理企业 ${enterprise.enterprise_name} 的日志表 ${actualBaseTableName} (原配置: ${schema.table_name})`);

      // 1. 获取数据库连接
      const connection = await this.connectionManager.getConnection(
        enterprise,
        "log"
      );

      // 2. 获取所有相关的表
      const existingTables = await this.getExistingLogTables(connection, schema.table_name);
      
      if (existingTables.length === 0) {
        logger.debug(`📋 企业 ${enterprise.enterprise_name} 没有找到相关的日志表: ${actualBaseTableName}`);
        return { cleaned: 0, migrated: false };
      }

      logger.info(`📋 企业 ${enterprise.enterprise_name} 找到 ${existingTables.length} 个相关日志表`);

      // 3. 根据配置确定需要清理的表
      const tablesToCleanup = this.identifyTablesToCleanup(
        existingTables,
        schema.time_interval!,
      );

      logger.info(`🗑️ 企业 ${enterprise.enterprise_name} 需要清理 ${tablesToCleanup.length} 个过期日志表`);

      // 4. 执行清理
      for (const tableName of tablesToCleanup) {
        const success = await this.dropTable(connection, tableName);
        if (success) {
          cleanedCount++;
          logger.info(`✅ 删除过期日志表: ${tableName} - 企业: ${enterprise.enterprise_name}`);
        }
      }

      // 5. 如果有清理操作或需要确保未来表存在，执行一次迁移
      if (cleanedCount > 0 || existingTables.length > 0) {
        try {
          logger.info(`🚀 执行迁移以确保未来日志表创建: ${schema.table_name} - 企业: ${enterprise.enterprise_name}`);
          
          await this.migrationService.migrateTable(
            schema.table_name,
            schema.database_type,
            schema.schema_version,
            schema.partition_type,
            enterprise.enterprise_id
          );
          
          migrated = true;
          logger.info(`✅ 迁移完成: ${schema.table_name} - 企业: ${enterprise.enterprise_name}`);
        } catch (migrationError) {
          logger.error(`❌ 迁移失败: ${schema.table_name} - 企业: ${enterprise.enterprise_name}`, {
            error: migrationError instanceof Error ? migrationError.message : String(migrationError)
          });
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ 处理企业 ${enterprise.enterprise_name} 的日志表 ${schema.table_name} 清理失败`, {
        enterpriseId: enterprise.enterprise_id,
        tableName: schema.table_name,
        error: errorMessage,
      });
    }

    return { cleaned: cleanedCount, migrated };
  }

  /**
   * 获取数据库中所有相关的日志表
   */
  private async getExistingLogTables(
    connection: any,
    baseTableName: string
  ): Promise<string[]> {
    try {
      // 处理表名：从 qc_request_log__time_month_partition 提取出 qc_request_log
      const actualBaseTableName = this.extractBaseTableName(baseTableName);
      
      const result = await connection.query(
        `SHOW TABLES LIKE '${actualBaseTableName}%'`,
        {
          type: QueryTypes.SELECT,
        }
      );

      return result.map((row: any) => Object.values(row)[0] as string);
    } catch (error) {
      logger.error(`❌ 获取相关日志表失败: ${baseTableName}`, { error });
      return [];
    }
  }

  /**
   * 从完整表名中提取基础表名
   * 例如：qc_request_log__time_month_partition -> qc_request_log
   */
  private extractBaseTableName(fullTableName: string): string {
    // 查找 "__" 的位置，如果存在则截取前面部分作为基础表名
    const separatorIndex = fullTableName.indexOf('__');
    if (separatorIndex !== -1) {
      return fullTableName.substring(0, separatorIndex);
    }
    
    // 如果没有找到 "__"，返回原表名
    return fullTableName;
  }

  /**
   * 识别需要清理的表
   */
  private identifyTablesToCleanup(
    existingTables: string[],
    timeInterval: "day" | "month" | "year",
  ): string[] {
    const now = new Date();
    const tablesToCleanup: string[] = [];
    const retentionDays = this.getRetentionDays(timeInterval);

    for (const tableName of existingTables) {
      try {
        const tableDate = this.extractDateFromTableName(tableName, timeInterval);
        if (!tableDate) {
          logger.warn(`⚠️ 无法解析表名日期: ${tableName}`);
          continue;
        }

        const daysDifference = Math.floor((now.getTime() - tableDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDifference > retentionDays) {
          tablesToCleanup.push(tableName);
          logger.debug(`🗑️ 标记清理: ${tableName} (${daysDifference}天前)`);
        }
      } catch (error) {
        logger.warn(`⚠️ 处理表名失败: ${tableName}`, { error });
      }
    }

    return tablesToCleanup;
  }

  /**
   * 获取保留天数
   */
  private getRetentionDays(timeInterval: "day" | "month" | "year"): number {
    switch (timeInterval) {
      case "day":
        return this.CLEANUP_RULES.day;
      case "month":
        return this.CLEANUP_RULES.month * 30; // 转换为天数
      case "year":
        return this.CLEANUP_RULES.year * 365; // 转换为天数
      default:
        return this.CLEANUP_RULES.day;
    }
  }

  /**
   * 从表名中提取日期
   */
  private extractDateFromTableName(
    tableName: string,
    timeInterval: "day" | "month" | "year",
  ): Date | null {
    try {
      // 先获取基础表名（从配置的完整表名中提取）
      // 这里需要推断出基础表名，可以通过移除已知的后缀来获取
      // 例如：qc_request_log202501 -> 去掉数字部分 -> qc_request_log
      const baseTableName = this.inferBaseTableNameFromActual(tableName);
      
      // 提取日期后缀部分
      const suffix = tableName.substring(baseTableName.length);
      if (!suffix) {
        return null;
      }
      if (suffix == '') {
        return null;
      }

      // 处理默认格式
      switch (timeInterval) {
        case "day":
            console.log(`解析日期字符长度: ${suffix.length}`);
          // 格式: YYYYMMDD
          if (suffix.length === 8) {
            const year = parseInt(suffix.substring(0, 4));
            const month = parseInt(suffix.substring(4, 6)) - 1; // 月份从0开始
            const day = parseInt(suffix.substring(6, 8));
            return new Date(year, month, day);
          }
          break;
          
        case "month":
          // 格式: YYYYMM
           console.log(`解析月份字符长度: ${suffix.length}`);
          if (suffix.length === 6) {
            const year = parseInt(suffix.substring(0, 4));
            const month = parseInt(suffix.substring(4, 6)) - 1; // 月份从0开始
            console.log(`解析月份: ${year}-${month + 1}`);
            return new Date(year, month, 1);
          }
          break;
          
        case "year":
          // 格式: YYYY
          console.log(`解析年份字符长度: ${suffix.length}`);
          if (suffix.length === 4) {
            const year = parseInt(suffix);
            return new Date(year, 0, 1);
          }
          break;
      }

      return null;
    } catch (error) {
      logger.warn(`⚠️ 解析表名日期失败: ${tableName}`, { error });
      return null;
    }
  }

  /**
   * 从实际表名推断基础表名
   * 例如：qc_request_log202501 -> qc_request_log
   */
  private inferBaseTableNameFromActual(tableName: string): string {
    // 查找表名末尾的数字部分
    const match = tableName.match(/^(.+?)(\d+)$/);
    if (match && match[1]) {
      return match[1];
    }
    
    // 如果没有找到数字后缀，返回原表名
    return tableName;
  }

  /**
   * 解析自定义格式的日期
   */
  private parseDateFromCustomFormat(suffix: string, format: string): Date | null {
    try {
      // 简单的格式替换解析
      let dateString = suffix;
      
      // 假设格式类似 _YYYYMMDD 或 _YYYY_MM_DD
      // 这里需要根据实际的 time_format 进行解析
      // 为简化，先处理常见格式
      if (format.includes('YYYY') && format.includes('MM') && format.includes('DD')) {
        // 提取年月日
        const yearMatch = dateString.match(/(\d{4})/);
        const monthMatch = dateString.match(/(\d{2})/g);
        
        if (yearMatch && yearMatch[1] && monthMatch && monthMatch.length >= 2 && monthMatch[1]) {
          const year = parseInt(yearMatch[1]);
          const month = parseInt(monthMatch[0]) - 1;
          const day = parseInt(monthMatch[1]);
          return new Date(year, month, day);
        }
      }
      
      return null;
    } catch (error) {
      logger.warn(`⚠️ 解析自定义格式日期失败: ${suffix}`, { error });
      return null;
    }
  }

  /**
   * 删除表
   */
  private async dropTable(connection: any, tableName: string): Promise<boolean> {
    try {
      await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``, {
        type: QueryTypes.RAW,
      });
      return true;
    } catch (error) {
      logger.error(`❌ 删除表失败: ${tableName}`, { error });
      return false;
    }
  }

  /**
   * 手动触发清理（用于测试或手动执行）
   */
  public async manualCleanup(): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      await this.cleanupLogTables();
      return {
        success: true,
        message: "手动清理任务执行成功",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "手动清理任务执行失败",
        details: errorMessage,
      };
    }
  }

  /**
   * 获取清理配置
   */
  public getCleanupRules() {
    return { ...this.CLEANUP_RULES };
  }

  /**
   * 更新清理配置
   */
  public updateCleanupRules(rules: Partial<typeof this.CLEANUP_RULES>) {
    Object.assign(this.CLEANUP_RULES, rules);
    logger.info("🔧 清理规则已更新", this.CLEANUP_RULES);
  }
}
