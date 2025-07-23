import { Request, Response } from "express";
import { LogTableCleanupService } from "@/services/LogTableCleanupService";
import logger from "@/utils/logger";

export class LogCleanupController {
  private cleanupService: LogTableCleanupService;

  constructor() {
    this.cleanupService = LogTableCleanupService.getInstance();
  }

  /**
   * 手动触发日志表清理
   */
  async manualCleanup(req: Request, res: Response): Promise<void> {
    try {
      logger.info("📞 收到手动清理请求");
      
      const result = await this.cleanupService.manualCleanup();
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message,
          details: result.details,
        });
      }
    } catch (error) {
      logger.error("手动清理请求处理失败:", error);
      res.status(500).json({
        success: false,
        message: "手动清理请求处理失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 获取清理配置
   */
  async getCleanupRules(req: Request, res: Response): Promise<void> {
    try {
      const rules = this.cleanupService.getCleanupRules();
      
      res.json({
        success: true,
        data: rules,
        message: "获取清理配置成功",
      });
    } catch (error) {
      logger.error("获取清理配置失败:", error);
      res.status(500).json({
        success: false,
        message: "获取清理配置失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 更新清理配置
   */
  async updateCleanupRules(req: Request, res: Response): Promise<void> {
    try {
      const { day, month, year } = req.body;
      
      // 验证输入
      const updates: any = {};
      if (day !== undefined) {
        if (typeof day !== "number" || day <= 0) {
          res.status(400).json({
            success: false,
            message: "day 必须是正整数",
          });
          return;
        }
        updates.day = day;
      }
      
      if (month !== undefined) {
        if (typeof month !== "number" || month <= 0) {
          res.status(400).json({
            success: false,
            message: "month 必须是正整数",
          });
          return;
        }
        updates.month = month;
      }
      
      if (year !== undefined) {
        if (typeof year !== "number" || year <= 0) {
          res.status(400).json({
            success: false,
            message: "year 必须是正整数",
          });
          return;
        }
        updates.year = year;
      }
      
      if (Object.keys(updates).length === 0) {
        res.status(400).json({
          success: false,
          message: "至少需要提供一个有效的配置项 (day, month, year)",
        });
        return;
      }
      
      this.cleanupService.updateCleanupRules(updates);
      const newRules = this.cleanupService.getCleanupRules();
      
      res.json({
        success: true,
        data: newRules,
        message: "清理配置更新成功",
      });
    } catch (error) {
      logger.error("更新清理配置失败:", error);
      res.status(500).json({
        success: false,
        message: "更新清理配置失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  /**
   * 获取清理服务状态
   */
  async getServiceStatus(req: Request, res: Response): Promise<void> {
    try {
      const rules = this.cleanupService.getCleanupRules();
      
      res.json({
        success: true,
        data: {
          isRunning: (this.cleanupService as any).isRunning || false,
          cleanupRules: rules,
          description: {
            day: `日表保留 ${rules.day} 天`,
            month: `月表保留 ${rules.month} 个月`,
            year: `年表保留 ${rules.year} 年`,
          },
          schedule: "每天凌晨2点自动执行",
        },
        message: "获取服务状态成功",
      });
    } catch (error) {
      logger.error("获取服务状态失败:", error);
      res.status(500).json({
        success: false,
        message: "获取服务状态失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }
}

export default LogCleanupController;
