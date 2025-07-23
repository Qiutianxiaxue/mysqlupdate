import { Request, Response } from "express";
import { TableScheduleServiceV2 } from "@/services/TableScheduleServiceV2";
import logger from "@/utils/logger";

/**
 * 表定时检测控制器
 */
class TableScheduleController {
  private tableScheduleService: TableScheduleServiceV2;

  constructor() {
    this.tableScheduleService = TableScheduleServiceV2.getInstance();
  }

  /**
   * 手动触发表检测
   */
  public manualCheck = async (req: Request, res: Response) => {
    try {
      logger.info("🔧 收到手动触发表检测请求");

      const result = await this.tableScheduleService.manualCheck();

      if (result.success) {
        logger.info("✅ 手动表检测执行成功");
        return res.status(200).json({
          success: true,
          message: result.message,
          data: result.details,
        });
      } else {
        logger.error("❌ 手动表检测执行失败", { details: result.details });
        return res.status(500).json({
          success: false,
          message: result.message,
          error: result.details,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("❌ 手动表检测接口异常", { error: errorMessage });

      return res.status(500).json({
        success: false,
        message: "手动表检测时发生系统错误",
        error: errorMessage,
      });
    }
  };

  /**
   * 获取定时任务状态
   */
  public getScheduleStatus = async (req: Request, res: Response) => {
    try {
      // 获取定时任务的状态信息
      const tasks = require("node-cron").getTasks();
      const taskCount = tasks.size;

      return res.status(200).json({
        success: true,
        message: "获取定时任务状态成功",
        data: {
          scheduledTasks: taskCount,
          isServiceRunning: taskCount > 0,
          nextExecutionTime: "每天 00:00:00",
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("❌ 获取定时任务状态失败", { error: errorMessage });

      return res.status(500).json({
        success: false,
        message: "获取定时任务状态时发生系统错误",
        error: errorMessage,
      });
    }
  };
}

export default new TableScheduleController();
