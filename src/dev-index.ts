// 开发环境入口文件 - 不使用 module-alias，完全依赖 tsconfig-paths
import { startServer } from "./app";
import logger from "./utils/logger";

// 处理未捕获的异常
process.on("uncaughtException", (error) => {
  logger.error("未捕获的异常:", error);
  process.exit(1);
});

// 处理未处理的Promise拒绝
process.on("unhandledRejection", (reason, _promise) => {
  logger.error("未处理的Promise拒绝:", reason);
  process.exit(1);
});

// 优雅关闭
process.on("SIGTERM", () => {
  logger.info("收到SIGTERM信号，正在优雅关闭...");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("收到SIGINT信号，正在优雅关闭...");
  process.exit(0);
});

// 启动服务器
startServer()
  .then(() => {
    logger.info(`🚀 开发服务器启动成功`);
  })
  .catch((error) => {
    logger.error("启动服务器失败:", error);
    process.exit(1);
  });
