import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import migrationRoutes from "@/routes/migration";
import schemaDetectionRoutes from "@/routes/schemaDetection";
import migrationVersionRoutes from "@/routes/migrationVersion";
import initialDataRoutes from "@/routes/initialData";
import initialDataTemplateRoutes from "@/routes/initialDataTemplate";
import tableScheduleRoutes from "@/routes/tableSchedule";
import logCleanupRoutes from "@/routes/logCleanup";
import { syncDatabase } from "@/models";
import { testBaseConnection, getBaseDatabaseInfo } from "@/config/baseDatabase";
import { MigrationLockService } from "@/services/MigrationLockService";
import { TableScheduleServiceV2 } from "@/services/TableScheduleServiceV2";
import { LogTableCleanupService } from "@/services/LogTableCleanupService";
import logger from "@/utils/logger";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// 路由
app.use("/api/migration", migrationRoutes);
app.use("/api/schema-detection", schemaDetectionRoutes);
app.use("/api/migration-version", migrationVersionRoutes);
app.use("/api/initial-data", initialDataRoutes);
app.use("/api/initial-data-template", initialDataTemplateRoutes);
app.use("/api/table-schedule", tableScheduleRoutes);
app.use("/api/log-cleanup", logCleanupRoutes);

// 健康检查
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "mysql-update",
  });
});

// 根路径
app.get("/", (req, res) => {
  res.json({
    message: "MySQL数据库自动升级服务",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      migration: "/api/migration",
      schemaDetection: "/api/schema-detection",
      migrationVersion: "/api/migration-version",
      initialData: "/api/initial-data",
      initialDataTemplate: "/api/initial-data-template",
      tableSchedule: "/api/table-schedule",
      logCleanup: "/api/log-cleanup",
    },
  });
});

// 错误处理中间件
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error("未处理的错误:", err);
    res.status(500).json({
      success: false,
      message: "服务器内部错误",
      error: process.env.NODE_ENV === "development" ? err.message : "未知错误",
    });
  }
);

// 404处理
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "接口不存在",
  });
});

export const startServer = async () => {
  try {
    // 同步主数据库
    await syncDatabase();

    // 清理之前服务留下的所有迁移锁
    logger.info("正在清理之前的迁移锁...");
    const lockService = MigrationLockService.getInstance();
    const cleanupResult = await lockService.cleanupAllLocks();
    if (cleanupResult.cleanedCount > 0) {
      logger.info(`已清理 ${cleanupResult.cleanedCount} 个过期的迁移锁`);
    } else {
      logger.info("没有发现需要清理的迁移锁");
    }

    // 启动表定时检测服务
    logger.info("正在启动表定时检测服务...");
    const tableScheduleService = TableScheduleServiceV2.getInstance();
    tableScheduleService.start();

    // 启动日志表清理服务
    logger.info("正在启动日志表清理服务...");
    const logCleanupService = LogTableCleanupService.getInstance();
    logCleanupService.start();

    // 测试基准数据库连接
    await testBaseConnection();
    const baseDbInfo = getBaseDatabaseInfo();
    logger.info(
      `基准数据库配置: ${baseDbInfo.host}:${baseDbInfo.port}/${baseDbInfo.database}`
    );

    app.listen(PORT, () => {
      logger.info(`服务器启动成功，端口: ${PORT}`);
      logger.info(`健康检查: http://localhost:${PORT}/health`);
      logger.info(`API文档: http://localhost:${PORT}/`);
    });
  } catch (error) {
    logger.error("服务器启动失败:", error);
    process.exit(1);
  }
};

export default app;
