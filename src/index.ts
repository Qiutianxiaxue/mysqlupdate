// 初始化模块别名支持 (必须在其他导入之前)
import "module-alias/register";

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
  logger.info("收到SIGTERM信号，正在关闭服务器...");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("收到SIGINT信号，正在关闭服务器...");
  process.exit(0);
});

// 启动服务器
startServer();
