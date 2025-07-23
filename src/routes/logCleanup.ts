import { Router } from "express";
import LogCleanupController from "@/controllers/LogCleanupController";

const router = Router();
const logCleanupController = new LogCleanupController();

/**
 * @swagger
 * /api/log-cleanup/manual:
 *   post:
 *     summary: 手动触发日志表清理
 *     tags: [日志清理]
 *     responses:
 *       200:
 *         description: 清理任务执行成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: 清理任务执行失败
 */
router.post("/manual", logCleanupController.manualCleanup.bind(logCleanupController));

/**
 * @swagger
 * /api/log-cleanup/rules:
 *   get:
 *     summary: 获取清理配置
 *     tags: [日志清理]
 *     responses:
 *       200:
 *         description: 获取清理配置成功
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
 *                     day:
 *                       type: number
 *                       description: 日表保留天数
 *                     month:
 *                       type: number
 *                       description: 月表保留月数
 *                     year:
 *                       type: number
 *                       description: 年表保留年数
 *                 message:
 *                   type: string
 */
router.get("/rules", logCleanupController.getCleanupRules.bind(logCleanupController));

/**
 * @swagger
 * /api/log-cleanup/rules:
 *   put:
 *     summary: 更新清理配置
 *     tags: [日志清理]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               day:
 *                 type: number
 *                 description: 日表保留天数
 *               month:
 *                 type: number
 *                 description: 月表保留月数
 *               year:
 *                 type: number
 *                 description: 年表保留年数
 *     responses:
 *       200:
 *         description: 清理配置更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 message:
 *                   type: string
 *       400:
 *         description: 请求参数错误
 */
router.put("/rules", logCleanupController.updateCleanupRules.bind(logCleanupController));

/**
 * @swagger
 * /api/log-cleanup/status:
 *   get:
 *     summary: 获取清理服务状态
 *     tags: [日志清理]
 *     responses:
 *       200:
 *         description: 获取服务状态成功
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
 *                     isRunning:
 *                       type: boolean
 *                     cleanupRules:
 *                       type: object
 *                     description:
 *                       type: object
 *                     schedule:
 *                       type: string
 *                 message:
 *                   type: string
 */
router.get("/status", logCleanupController.getServiceStatus.bind(logCleanupController));

export default router;
