import { Router } from "express";
import InitialDataController from "@/controllers/InitialDataController";

const router = Router();
const initialDataController = new InitialDataController();

/**
 * @swagger
 * /api/initial-data/execute:
 *   post:
 *     summary: 执行企业初始数据脚本
 *     tags: [Initial Data]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enterpriseId
 *             properties:
 *               enterpriseId:
 *                 type: integer
 *                 description: 企业ID
 *                 example: 123
 *               databaseType:
 *                 type: string
 *                 enum: [main, log, order, static]
 *                 description: 数据库类型，不指定则执行所有类型
 *               forceRerun:
 *                 type: boolean
 *                 description: 是否强制重新执行已成功的脚本
 *                 default: false
 *     responses:
 *       200:
 *         description: 初始数据执行成功
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
 *                     executedScripts:
 *                       type: integer
 *                       description: 已执行脚本数量
 *                     skippedScripts:
 *                       type: integer
 *                       description: 跳过脚本数量
 *                     executionTime:
 *                       type: integer
 *                       description: 执行耗时（毫秒）
 *                     totalTime:
 *                       type: string
 *                       description: 总耗时（秒）
 *       400:
 *         description: 请求参数错误
 *       500:
 *         description: 执行失败或系统错误
 */
router.post("/execute", initialDataController.executeInitialData);

/**
 * @swagger
 * /api/initial-data/status:
 *   post:
 *     summary: 获取企业初始数据执行状态
 *     tags: [Initial Data]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enterpriseId
 *             properties:
 *               enterpriseId:
 *                 type: integer
 *                 description: 企业ID
 *                 example: 123
 *               databaseType:
 *                 type: string
 *                 enum: [main, log, order, static]
 *                 description: 数据库类型过滤
 *                 required: false
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
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       totalScripts:
 *                         type: integer
 *                         description: 总脚本数量
 *                       executedScripts:
 *                         type: integer
 *                         description: 已执行脚本数量
 *                       pendingScripts:
 *                         type: integer
 *                         description: 待执行脚本数量
 *                       executedList:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             script_name:
 *                               type: string
 *                             script_version:
 *                               type: string
 *                       lastExecution:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           scriptName:
 *                             type: string
 *                           status:
 *                             type: string
 *                           executionTime:
 *                             type: integer
 *                           createTime:
 *                             type: string
 *       400:
 *         description: 请求参数错误
 *       500:
 *         description: 系统错误
 */
router.post("/status", initialDataController.getInitialDataStatus);

/**
 * @swagger
 * /api/initial-data/history:
 *   post:
 *     summary: 获取企业初始数据执行历史
 *     tags: [Initial Data]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enterpriseId
 *             properties:
 *               enterpriseId:
 *                 type: integer
 *                 description: 企业ID
 *                 example: 123
 *               databaseType:
 *                 type: string
 *                 enum: [main, log, order, static]
 *                 description: 数据库类型过滤
 *                 required: false
 *               limit:
 *                 type: integer
 *                 description: 返回记录数量限制
 *                 default: 50
 *                 minimum: 1
 *                 maximum: 500
 *                 required: false
 *     responses:
 *       200:
 *         description: 获取历史成功
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
 *                     total:
 *                       type: integer
 *                       description: 返回记录数量
 *                     records:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           initial_data_history_id:
 *                             type: integer
 *                           enterprise_id:
 *                             type: integer
 *                           database_type:
 *                             type: string
 *                           script_name:
 *                             type: string
 *                           script_version:
 *                             type: string
 *                           execution_status:
 *                             type: string
 *                           execution_time:
 *                             type: integer
 *                           affected_rows:
 *                             type: integer
 *                           error_message:
 *                             type: string
 *                             nullable: true
 *                           create_time:
 *                             type: string
 *       400:
 *         description: 请求参数错误
 *       500:
 *         description: 系统错误
 */
router.post("/history", initialDataController.getExecutionHistory);

/**
 * @swagger
 * /api/initial-data/check-script:
 *   post:
 *     summary: 检查特定脚本是否已执行
 *     tags: [Initial Data]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enterpriseId
 *               - databaseType
 *               - scriptName
 *               - scriptVersion
 *             properties:
 *               enterpriseId:
 *                 type: integer
 *                 description: 企业ID
 *                 example: 123
 *               databaseType:
 *                 type: string
 *                 enum: [main, log, order, static]
 *                 description: 数据库类型
 *               scriptName:
 *                 type: string
 *                 description: 脚本名称
 *                 example: "001_system_config"
 *               scriptVersion:
 *                 type: string
 *                 description: 脚本版本
 *                 example: "1.0.0"
 *     responses:
 *       200:
 *         description: 检查成功
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
 *                     enterpriseId:
 *                       type: integer
 *                     databaseType:
 *                       type: string
 *                     scriptName:
 *                       type: string
 *                     scriptVersion:
 *                       type: string
 *                     isExecuted:
 *                       type: boolean
 *       400:
 *         description: 请求参数错误
 *       500:
 *         description: 系统错误
 */
router.post("/check-script", initialDataController.checkScriptStatus);

export default router;
