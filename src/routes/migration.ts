import { Router } from "express";
import MigrationController from "@/controllers/MigrationController";

const router = Router();
const migrationController = new MigrationController();

// 表结构定义相关路由
router.post(
  "/schemas",
  migrationController.createTableSchema.bind(migrationController)
);
router.get(
  "/schemas",
  migrationController.getAllTableSchemas.bind(migrationController)
);
router.get(
  "/schemas/:id",
  migrationController.getTableSchemaById.bind(migrationController)
);
router.put(
  "/schemas/:id",
  migrationController.updateTableSchema.bind(migrationController)
);
router.delete(
  "/schemas/:id",
  migrationController.deleteTableSchema.bind(migrationController)
);

// 迁移执行相关路由
router.post(
  "/execute",
  migrationController.executeMigration.bind(migrationController)
);
router.post(
  "/execute/enterprise",
  migrationController.executeMigrationForEnterprise.bind(migrationController)
);
router.post(
  "/execute/batch",
  migrationController.executeBatchMigration.bind(migrationController)
);

// 企业相关路由
router.post(
  "/enterprises",
  migrationController.createEnterprise.bind(migrationController)
);
router.get(
  "/enterprises",
  migrationController.getEnterprises.bind(migrationController)
);

// 连接管理相关路由
router.get(
  "/connections/stats",
  migrationController.getConnectionStats.bind(migrationController)
);
router.post(
  "/connections/close",
  migrationController.closeAllConnections.bind(migrationController)
);

export default router;
