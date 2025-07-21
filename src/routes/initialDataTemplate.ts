import { Router } from "express";
import InitialDataTemplateController from "@/controllers/InitialDataTemplateController";

const router = Router();
const templateController = new InitialDataTemplateController();

/**
 * @swagger
 * /api/initial-data-template/list:
 *   post:
 *     summary: 获取所有初始数据模板
 *     tags: [Initial Data Template]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               databaseType:
 *                 type: string
 *                 enum: [main, log, order, static]
 *                 description: 数据库类型过滤
 *               isEnabled:
 *                 type: boolean
 *                 description: 是否启用过滤
 *     responses:
 *       200:
 *         description: 获取模板成功
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
 *                     templates:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           template_id:
 *                             type: integer
 *                           template_name:
 *                             type: string
 *                           template_version:
 *                             type: string
 *                           database_type:
 *                             type: string
 *                           description:
 *                             type: string
 *                           execution_order:
 *                             type: integer
 *                           is_enabled:
 *                             type: boolean
 *                           create_time:
 *                             type: string
 *       500:
 *         description: 系统错误
 */
router.post("/list", templateController.getAllTemplates);

/**
 * @swagger
 * /api/initial-data-template/create:
 *   post:
 *     summary: 创建初始数据模板
 *     tags: [Initial Data Template]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - template_name
 *               - template_version
 *               - database_type
 *               - script_content
 *             properties:
 *               template_name:
 *                 type: string
 *                 description: 模板名称
 *               template_version:
 *                 type: string
 *                 description: 模板版本
 *               database_type:
 *                 type: string
 *                 enum: [main, log, order, static]
 *                 description: 数据库类型
 *               script_content:
 *                 type: string
 *                 description: SQL脚本内容
 *               description:
 *                 type: string
 *                 description: 模板描述
 *               execution_order:
 *                 type: integer
 *                 description: 执行顺序
 *                 default: 999
 *               dependencies:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 依赖的其他模板名称
 *               is_enabled:
 *                 type: boolean
 *                 description: 是否启用
 *                 default: true
 *     responses:
 *       201:
 *         description: 创建成功
 *       400:
 *         description: 请求参数错误
 *       409:
 *         description: 模板已存在
 *       500:
 *         description: 系统错误
 */
router.post("/create", templateController.createTemplate);

/**
 * @swagger
 * /api/initial-data-template/get-by-id:
 *   post:
 *     summary: 根据ID获取初始数据模板
 *     tags: [Initial Data Template]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateId
 *             properties:
 *               templateId:
 *                 type: integer
 *                 description: 模板ID
 *                 example: 1
 *     responses:
 *       200:
 *         description: 获取成功
 *       404:
 *         description: 模板不存在
 *       500:
 *         description: 系统错误
 */
router.post("/get-by-id", templateController.getTemplateById);

/**
 * @swagger
 * /api/initial-data-template/update:
 *   post:
 *     summary: 更新初始数据模板
 *     tags: [Initial Data Template]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateId
 *             properties:
 *               templateId:
 *                 type: integer
 *                 description: 模板ID
 *                 example: 1
 *               template_name:
 *                 type: string
 *                 description: 模板名称
 *               template_version:
 *                 type: string
 *                 description: 模板版本
 *               database_type:
 *                 type: string
 *                 enum: [main, log, order, static]
 *                 description: 数据库类型
 *               script_content:
 *                 type: string
 *                 description: SQL脚本内容
 *               description:
 *                 type: string
 *                 description: 模板描述
 *               execution_order:
 *                 type: integer
 *                 description: 执行顺序
 *               dependencies:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 依赖的其他模板名称
 *               is_enabled:
 *                 type: boolean
 *                 description: 是否启用
 *     responses:
 *       200:
 *         description: 更新成功
 *       400:
 *         description: 请求参数错误
 *       404:
 *         description: 模板不存在
 *       409:
 *         description: 模板冲突
 *       500:
 *         description: 系统错误
 */
router.post("/update", templateController.updateTemplate);

/**
 * @swagger
 * /api/initial-data-template/delete:
 *   post:
 *     summary: 删除初始数据模板
 *     tags: [Initial Data Template]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateId
 *             properties:
 *               templateId:
 *                 type: integer
 *                 description: 模板ID
 *                 example: 1
 *     responses:
 *       200:
 *         description: 删除成功
 *       404:
 *         description: 模板不存在
 *       500:
 *         description: 系统错误
 */
router.post("/delete", templateController.deleteTemplate);

/**
 * @swagger
 * /api/initial-data-template/toggle:
 *   post:
 *     summary: 启用/禁用初始数据模板
 *     tags: [Initial Data Template]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateId
 *               - is_enabled
 *             properties:
 *               templateId:
 *                 type: integer
 *                 description: 模板ID
 *                 example: 1
 *               is_enabled:
 *                 type: boolean
 *                 description: 是否启用
 *     responses:
 *       200:
 *         description: 切换成功
 *       400:
 *         description: 请求参数错误
 *       404:
 *         description: 模板不存在
 *       500:
 *         description: 系统错误
 */
router.post("/toggle", templateController.toggleTemplate);

export default router;
