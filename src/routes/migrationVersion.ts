import { Router } from "express";
import MigrationVersionController from "@/controllers/MigrationVersionController";

const router = Router();

/**
 * @swagger
 * /api/migration-version/stats:
 *   get:
 *     tags:
 *       - Migration Version
 *     summary: 获取迁移版本统计信息
 *     description: 获取所有表的迁移版本统计信息
 *     responses:
 *       200:
 *         description: 成功获取统计信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     byDatabaseType:
 *                       type: object
 *       500:
 *         description: 服务器错误
 */
router.get("/stats", MigrationVersionController.getStats);

/**
 * @swagger
 * /api/migration-version/current-version:
 *   get:
 *     tags:
 *       - Migration Version
 *     summary: 获取表的当前迁移版本信息
 *     parameters:
 *       - name: table_name
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: database_type
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           enum: [main, log, order, static]
 *       - name: partition_type
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: time_interval
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取版本信息
 */
router.get("/current-version", MigrationVersionController.getCurrentVersion);

/**
 * @swagger
 * /api/migration-version/should-migrate:
 *   post:
 *     tags:
 *       - Migration Version
 *     summary: 检查表是否需要迁移
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - table_name
 *               - database_type
 *               - current_version
 *             properties:
 *               table_name:
 *                 type: string
 *               database_type:
 *                 type: string
 *                 enum: [main, log, order, static]
 *               current_version:
 *                 type: string
 *               partition_type:
 *                 type: string
 *               time_interval:
 *                 type: string
 *     responses:
 *       200:
 *         description: 成功检查迁移需求
 */
router.post("/should-migrate", MigrationVersionController.shouldMigrate);

/**
 * @swagger
 * /api/migration-version/record-migration:
 *   post:
 *     tags:
 *       - Migration Version
 *     summary: 记录迁移版本（迁移成功后调用）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - table_name
 *               - database_type
 *               - version
 *             properties:
 *               table_name:
 *                 type: string
 *               database_type:
 *                 type: string
 *                 enum: [main, log, order, static]
 *               version:
 *                 type: string
 *               partition_type:
 *                 type: string
 *               time_interval:
 *                 type: string
 *     responses:
 *       200:
 *         description: 迁移版本记录成功
 */
router.post("/record-migration", MigrationVersionController.recordMigration);

export default router;
