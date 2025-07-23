import { Router } from "express";
import tableScheduleController from "@/controllers/TableScheduleController";

const router = Router();

/**
 * @swagger
 * /api/table-schedule/manual-check:
 *   post:
 *     summary: 手动触发表检测
 *     description: 手动执行一次表检测和创建任务，检测按日期分表的表是否需要创建
 *     tags:
 *       - 表定时检测
 *     responses:
 *       200:
 *         description: 检测执行成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: 执行详情
 *       500:
 *         description: 执行失败或系统错误
 */
router.post("/manual-check", tableScheduleController.manualCheck);

/**
 * @swagger
 * /api/table-schedule/status:
 *   get:
 *     summary: 获取定时任务状态
 *     description: 获取表定时检测服务的运行状态
 *     tags:
 *       - 表定时检测
 *     responses:
 *       200:
 *         description: 获取状态成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     scheduledTasks:
 *                       type: integer
 *                       description: 已调度的任务数量
 *                     isServiceRunning:
 *                       type: boolean
 *                       description: 服务是否运行中
 *                     nextExecutionTime:
 *                       type: string
 *                       description: 下次执行时间
 *       500:
 *         description: 系统错误
 */
router.get("/status", tableScheduleController.getScheduleStatus);

export default router;
