import { Request, Response } from "express";
import MigrationVersionService from "@/services/MigrationVersionService";
import logger from "@/utils/logger";

export class MigrationVersionController {
  /**
   * 获取迁移版本统计信息
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await MigrationVersionService.getMigrationStats();
      
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("获取迁移版本统计失败:", error);
      res.status(500).json({
        success: false,
        message: "获取迁移版本统计失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 获取表的当前迁移版本信息
   */
  async getCurrentVersion(req: Request, res: Response): Promise<void> {
    try {
      const { table_name, database_type, partition_type, time_interval } = req.query;

      // 验证必需参数
      if (!table_name || !database_type) {
        res.status(400).json({
          success: false,
          message: "缺少必需参数：table_name, database_type",
        });
        return;
      }

      // 验证数据库类型
      if (!["main", "log", "order", "static"].includes(database_type as string)) {
        res.status(400).json({
          success: false,
          message: "无效的数据库类型，支持的类型：main, log, order, static",
        });
        return;
      }

      const versionInfo = await MigrationVersionService.getCurrentMigrationVersion(
        table_name as string,
        database_type as "main" | "log" | "order" | "static",
        partition_type as string || "none",
        time_interval as string
      );

      res.json({
        success: true,
        data: versionInfo,
      });
    } catch (error) {
      logger.error("获取迁移版本信息失败:", error);
      res.status(500).json({
        success: false,
        message: "获取迁移版本信息失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 检查表是否需要迁移
   */
  async shouldMigrate(req: Request, res: Response): Promise<void> {
    try {
      const { table_name, database_type, current_version, partition_type, time_interval } = req.body;

      // 验证必需参数
      if (!table_name || !database_type || !current_version) {
        res.status(400).json({
          success: false,
          message: "缺少必需参数：table_name, database_type, current_version",
        });
        return;
      }

      // 验证数据库类型
      if (!["main", "log", "order", "static"].includes(database_type)) {
        res.status(400).json({
          success: false,
          message: "无效的数据库类型，支持的类型：main, log, order, static",
        });
        return;
      }

      const shouldMigrate = await MigrationVersionService.shouldMigrate(
        table_name,
        database_type,
        current_version,
        partition_type || "none",
        time_interval
      );

      res.json({
        success: true,
        data: {
          should_migrate: shouldMigrate,
          table_name,
          database_type,
          current_version,
          partition_type: partition_type || "none",
        },
      });
    } catch (error) {
      logger.error("检查迁移需求失败:", error);
      res.status(500).json({
        success: false,
        message: "检查迁移需求失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 记录迁移版本（迁移成功后调用）
   */
  async recordMigration(req: Request, res: Response): Promise<void> {
    try {
      const { table_name, database_type, version, partition_type, time_interval } = req.body;

      // 验证必需参数
      if (!table_name || !database_type || !version) {
        res.status(400).json({
          success: false,
          message: "缺少必需参数：table_name, database_type, version",
        });
        return;
      }

      // 验证数据库类型
      if (!["main", "log", "order", "static"].includes(database_type)) {
        res.status(400).json({
          success: false,
          message: "无效的数据库类型，支持的类型：main, log, order, static",
        });
        return;
      }

      await MigrationVersionService.recordMigrationVersion(
        table_name,
        database_type,
        version,
        partition_type || "none",
        time_interval
      );

      res.json({
        success: true,
        message: "迁移版本记录成功",
        data: {
          table_name,
          database_type,
          version,
          partition_type: partition_type || "none",
        },
      });
    } catch (error) {
      logger.error("记录迁移版本失败:", error);
      res.status(500).json({
        success: false,
        message: "记录迁移版本失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }
}

// 创建并导出控制器实例
const migrationVersionController = new MigrationVersionController();
export default migrationVersionController;
