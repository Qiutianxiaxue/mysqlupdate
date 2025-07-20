import MigrationVersion from "@/models/MigrationVersion";
import logger from "@/utils/logger";

export class MigrationVersionService {
  
  /**
   * 从分表配置生成分表规则标识
   * @param partitionType 分表类型
   * @param timeInterval 时间间隔（time类型时使用）
   * @returns 分表规则标识
   */
  private static generatePartitionRule(partitionType: string, timeInterval?: string): string {
    if (partitionType === "store") {
      return "store";
    } else if (partitionType === "time" && timeInterval) {
      return `time_${timeInterval}`;
    }
    return "none";
  }

  /**
   * 检查表是否需要迁移（版本比较）
   * @param tableName 表名（基础表名）
   * @param databaseType 数据库类型
   * @param currentVersion 当前要执行的版本号
   * @param partitionType 分表类型
   * @param timeInterval 时间间隔（可选）
   * @returns true: 需要迁移, false: 已经迁移过此版本
   */
  async shouldMigrate(
    tableName: string,
    databaseType: "main" | "log" | "order" | "static",
    currentVersion: string,
    partitionType: string = "none",
    timeInterval?: string
  ): Promise<boolean> {
    try {
      const partitionRule = MigrationVersionService.generatePartitionRule(partitionType, timeInterval);

      // 查找已记录的迁移版本
      const migrationVersion = await MigrationVersion.findOne({
        where: {
          table_name: tableName,
          database_type: databaseType,
          partition_rule: partitionRule,
        },
      });

      if (!migrationVersion) {
        logger.debug(`表 ${tableName} (${databaseType}, ${partitionRule}) 没有迁移记录，需要迁移到版本 ${currentVersion}`);
        return true; // 没有迁移记录，需要迁移
      }

      // 比较版本号
      const migratedVersion = migrationVersion.current_migrated_version;
      const needsMigration = migratedVersion !== currentVersion;

      if (needsMigration) {
        logger.debug(`表 ${tableName} (${databaseType}, ${partitionRule}) 当前版本: ${migratedVersion}, 目标版本: ${currentVersion}，需要迁移`);
      } else {
        logger.debug(`表 ${tableName} (${databaseType}, ${partitionRule}) 已经是版本 ${currentVersion}，跳过迁移`);
      }

      return needsMigration;

    } catch (error) {
      logger.error(`检查表 ${tableName} (${databaseType}, ${partitionType}) 迁移版本时出错:`, error);
      return true; // 出错时默认需要迁移
    }
  }

  /**
   * 记录表的迁移版本（仅在迁移成功后调用）
   * @param tableName 表名（基础表名）
   * @param databaseType 数据库类型
   * @param version 已迁移到的版本号
   * @param partitionType 分表类型
   * @param timeInterval 时间间隔（可选）
   */
  async recordMigrationVersion(
    tableName: string,
    databaseType: "main" | "log" | "order" | "static",
    version: string,
    partitionType: string = "none",
    timeInterval?: string
  ): Promise<void> {
    try {
      const now = new Date();
      const partitionRule = MigrationVersionService.generatePartitionRule(partitionType, timeInterval);

      const recordData = {
        table_name: tableName,
        database_type: databaseType,
        partition_rule: partitionRule,
        current_migrated_version: version,
        migration_time: now,
      };

      // 使用 upsert 进行插入或更新
      await MigrationVersion.upsert(recordData, {
        conflictFields: ["table_name", "database_type", "partition_rule"],
      });
    } catch (error) {
      logger.error(`记录表 ${tableName} (${databaseType}, ${partitionType}) 迁移版本失败:`, error);
      throw error;
    }
  }

  /**
   * 获取表的当前迁移版本信息
   * @param tableName 表名（基础表名）
   * @param databaseType 数据库类型
   * @param partitionType 分表类型
   * @param timeInterval 时间间隔（可选）
   * @returns 迁移版本信息，如果不存在返回null
   */
  async getCurrentMigrationVersion(
    tableName: string,
    databaseType: "main" | "log" | "order" | "static",
    partitionType: string = "none",
    timeInterval?: string
  ): Promise<MigrationVersion | null> {
    try {
      const partitionRule = MigrationVersionService.generatePartitionRule(partitionType, timeInterval);
      
      return await MigrationVersion.findOne({
        where: {
          table_name: tableName,
          database_type: databaseType,
          partition_rule: partitionRule,
        },
      });
    } catch (error) {
      logger.error(`获取表 ${tableName} (${databaseType}, ${partitionType}) 迁移版本信息失败:`, error);
      return null;
    }
  }

  /**
   * 获取迁移版本统计信息
   * @returns 统计信息对象
   */
  async getMigrationStats(): Promise<{
    total: number;
    byDatabaseType: Record<string, number>;
  }> {
    try {
      // 获取总体统计
      const totalCount = await MigrationVersion.count();

      // 按数据库类型统计
      const databaseTypes = ["main", "log", "order", "static"] as const;
      const byDatabaseType: Record<string, number> = {};

      for (const dbType of databaseTypes) {
        const count = await MigrationVersion.count({ where: { database_type: dbType } });
        byDatabaseType[dbType] = count;
      }

      return {
        total: totalCount,
        byDatabaseType,
      };
    } catch (error) {
      logger.error(`获取迁移版本统计失败:`, error);
      return {
        total: 0,
        byDatabaseType: {},
      };
    }
  }
}

// 创建并导出单例实例
const migrationVersionService = new MigrationVersionService();
export default migrationVersionService;
