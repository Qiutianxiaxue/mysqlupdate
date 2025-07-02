import express from "express";
import MigrationController from "../controllers/MigrationController";

const router = express.Router();
const migrationController = new MigrationController();

// 健康检查
router.post("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// 表结构定义管理
router.post(
  "/schemas/create",
  migrationController.createTableSchema.bind(migrationController)
);
router.post(
  "/schemas/list",
  migrationController.getAllTableSchemas.bind(migrationController)
);

// 表结构历史查询
router.post(
  "/schemas/history",
  migrationController.getTableSchemaHistory.bind(migrationController)
);

// 根据表定义信息获取表结构定义
router.post(
  "/schemas/detail",
  migrationController.getTableSchemaByCondition.bind(migrationController)
);

// 删除表结构定义
router.post(
  "/schemas/delete",
  migrationController.deleteTableSchema.bind(migrationController)
);

// 迁移执行 - 统一接口，支持多种参数组合
router.post(
  "/execute",
  migrationController.executeMigration.bind(migrationController)
);

// 一键迁移所有表
router.post(
  "/execute-all",
  migrationController.migrateAllTables.bind(migrationController)
);

// 根据门店ID迁移所有门店分表
router.post(
  "/execute-store",
  migrationController.migrateStoreTablesById.bind(migrationController)
);

// 一键迁移检查 - 预览所有会执行的SQL但不执行
router.post(
  "/check-all",
  migrationController.checkMigrateAllTables.bind(migrationController)
);

// 企业管理
router.post(
  "/enterprises/list",
  migrationController.getEnterprises.bind(migrationController)
);
router.post(
  "/enterprises/create",
  migrationController.createEnterprise.bind(migrationController)
);

// 连接管理
router.post(
  "/connections/stats",
  migrationController.getConnectionStats.bind(migrationController)
);
router.post(
  "/connections/close",
  migrationController.closeAllConnections.bind(migrationController)
);

// 迁移锁管理
router.post(
  "/locks/list",
  migrationController.getActiveMigrationLocks.bind(migrationController)
);
router.post(
  "/locks/force-release",
  migrationController.forceReleaseMigrationLock.bind(migrationController)
);
router.post(
  "/locks/cleanup",
  migrationController.cleanupExpiredMigrationLocks.bind(migrationController)
);

export default router;
