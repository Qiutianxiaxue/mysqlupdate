import { Request, Response } from "express";
import InitialDataService from "@/services/InitialDataService";
import InitialDataHistory from "@/models/InitialDataHistory";
import logger from "@/utils/logger";

class InitialDataController {
  private initialDataService: InitialDataService;

  constructor() {
    this.initialDataService = new InitialDataService();
  }

  /**
   * 执行初始数据脚本
   */
  public executeInitialData = async (req: Request, res: Response) => {
    try {
      const { enterpriseId, databaseType, forceRerun = false } = req.body;

      if (!enterpriseId || isNaN(Number(enterpriseId))) {
        return res.status(400).json({
          success: false,
          message: "企业ID参数无效",
        });
      }

      // 验证数据库类型参数
      if (databaseType && !["main", "log", "order", "static"].includes(databaseType)) {
        return res.status(400).json({
          success: false,
          message: "数据库类型参数无效，必须是 main, log, order, static 之一",
        });
      }

      logger.info(`开始执行初始数据`, {
        enterpriseId: Number(enterpriseId),
        databaseType,
        forceRerun,
      });

      const result = await this.initialDataService.executeInitialData(
        Number(enterpriseId),
        databaseType as "main" | "log" | "order" | "static" | undefined,
        forceRerun
      );

      if (result.success) {
        return res.status(200).json({
          success: true,
          message: "初始数据执行完成",
          data: {
            executedScripts: result.executedScripts,
            skippedScripts: result.skippedScripts,
            executionTime: result.executionTime,
            totalTime: `${(result.executionTime / 1000).toFixed(2)}秒`,
          },
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "初始数据执行失败",
          data: {
            executedScripts: result.executedScripts,
            failedScripts: result.failedScripts,
            errors: result.errors,
            executionTime: result.executionTime,
          },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`执行初始数据失败`, {
        enterpriseId: req.body.enterpriseId,
        error: errorMessage,
      });

      return res.status(500).json({
        success: false,
        message: "执行初始数据时发生系统错误",
        error: errorMessage,
      });
    }
  };

  /**
   * 获取初始数据执行状态
   */
  public getInitialDataStatus = async (req: Request, res: Response) => {
    try {
      const { enterpriseId, databaseType } = req.body;

      if (!enterpriseId || isNaN(Number(enterpriseId))) {
        return res.status(400).json({
          success: false,
          message: "企业ID参数无效",
        });
      }

      // 验证数据库类型参数
      if (databaseType && !["main", "log", "order", "static"].includes(databaseType)) {
        return res.status(400).json({
          success: false,
          message: "数据库类型参数无效，必须是 main, log, order, static 之一",
        });
      }

      const status = await this.initialDataService.getInitialDataStatus(
        Number(enterpriseId),
        databaseType as "main" | "log" | "order" | "static" | undefined
      );

      return res.status(200).json({
        success: true,
        message: "获取初始数据状态成功",
        data: status,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`获取初始数据状态失败`, {
        enterpriseId: req.body.enterpriseId,
        error: errorMessage,
      });

      return res.status(500).json({
        success: false,
        message: "获取初始数据状态时发生系统错误",
        error: errorMessage,
      });
    }
  };

  /**
   * 获取初始数据执行历史
   */
  public getExecutionHistory = async (req: Request, res: Response) => {
    try {
      const { enterpriseId, databaseType, limit = 50 } = req.body;

      if (!enterpriseId || isNaN(Number(enterpriseId))) {
        return res.status(400).json({
          success: false,
          message: "企业ID参数无效",
        });
      }

      // 验证数据库类型参数
      if (databaseType && !["main", "log", "order", "static"].includes(databaseType)) {
        return res.status(400).json({
          success: false,
          message: "数据库类型参数无效，必须是 main, log, order, static 之一",
        });
      }

      // 验证limit参数
      const limitNum = Number(limit);
      if (isNaN(limitNum) || limitNum <= 0 || limitNum > 500) {
        return res.status(400).json({
          success: false,
          message: "limit参数无效，必须是1-500之间的数字",
        });
      }

      const history = await this.initialDataService.getExecutionHistory(
        Number(enterpriseId),
        databaseType as "main" | "log" | "order" | "static" | undefined,
        limitNum
      );

      return res.status(200).json({
        success: true,
        message: "获取执行历史成功",
        data: {
          total: history.length,
          records: history,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`获取执行历史失败`, {
        enterpriseId: req.body.enterpriseId,
        error: errorMessage,
      });

      return res.status(500).json({
        success: false,
        message: "获取执行历史时发生系统错误",
        error: errorMessage,
      });
    }
  };

  /**
   * 检查特定脚本是否已执行
   */
  public checkScriptStatus = async (req: Request, res: Response) => {
    try {
      const { enterpriseId, databaseType, scriptName, scriptVersion } = req.body;

      if (!enterpriseId || isNaN(Number(enterpriseId))) {
        return res.status(400).json({
          success: false,
          message: "企业ID参数无效",
        });
      }

      if (!databaseType || !["main", "log", "order", "static"].includes(databaseType)) {
        return res.status(400).json({
          success: false,
          message: "数据库类型参数无效，必须是 main, log, order, static 之一",
        });
      }

      if (!scriptName || !scriptVersion) {
        return res.status(400).json({
          success: false,
          message: "scriptName 和 scriptVersion 参数必填",
        });
      }

      const isExecuted = await InitialDataHistory.isScriptExecuted(
        Number(enterpriseId),
        databaseType as "main" | "log" | "order" | "static",
        scriptName,
        scriptVersion
      );

      return res.status(200).json({
        success: true,
        message: "检查脚本状态成功",
        data: {
          enterpriseId: Number(enterpriseId),
          databaseType,
          scriptName,
          scriptVersion,
          isExecuted,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`检查脚本状态失败`, {
        enterpriseId: req.body.enterpriseId,
        error: errorMessage,
      });

      return res.status(500).json({
        success: false,
        message: "检查脚本状态时发生系统错误",
        error: errorMessage,
      });
    }
  };
}

export default InitialDataController;
