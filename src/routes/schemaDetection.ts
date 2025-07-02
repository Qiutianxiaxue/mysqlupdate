import { Router } from "express";
import { SchemaDetectionController } from "@/controllers/SchemaDetectionController";

const router = Router();
const schemaDetectionController = new SchemaDetectionController();

/**
 * 表结构检测相关路由
 */

// 检测单个表的结构变化
router.post("/table", schemaDetectionController.detectSingleTable);

// 检测所有表的结构变化
router.post("/all", schemaDetectionController.detectAllTables);

// 检测并保存表结构变化（一步到位）
router.post("/detect-and-save", schemaDetectionController.detectAndSave);

// 保存检测到的表结构变化
router.post("/save", schemaDetectionController.saveChanges);

// 获取基准数据库中的所有表信息
router.post("/tables", schemaDetectionController.getBaseTables);

// 获取指定表的详细结构信息
router.post("/table/info", schemaDetectionController.getTableInfo);

// 预览表名解析和分表类型检测结果
router.get(
  "/preview-partition",
  schemaDetectionController.previewPartitionDetection
);

export default router;
