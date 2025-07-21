import { Request, Response } from "express";
import InitialDataTemplate from "@/models/InitialDataTemplate";
import logger from "@/utils/logger";

class InitialDataTemplateController {
  /**
   * 获取所有初始数据模板
   */
  public getAllTemplates = async (req: Request, res: Response) => {
    try {
      const { databaseType, isEnabled } = req.body || {};

      const whereClause: any = {};
      if (databaseType && ["main", "log", "order", "static"].includes(databaseType)) {
        whereClause.database_type = databaseType;
      }
      if (isEnabled !== undefined) {
        whereClause.is_enabled = isEnabled;
      }

      const templates = await InitialDataTemplate.findAll({
        where: whereClause,
        order: [
          ["database_type", "ASC"],
          ["execution_order", "ASC"],
          ["template_name", "ASC"],
        ],
      });

      return res.status(200).json({
        success: true,
        message: "获取初始数据模板成功",
        data: {
          total: templates.length,
          templates,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`获取初始数据模板失败`, { error: errorMessage });

      return res.status(500).json({
        success: false,
        message: "获取初始数据模板时发生系统错误",
        error: errorMessage,
      });
    }
  };

  /**
   * 根据ID获取初始数据模板
   */
  public getTemplateById = async (req: Request, res: Response) => {
    try {
      const { templateId } = req.body;

      if (!templateId || isNaN(Number(templateId))) {
        return res.status(400).json({
          success: false,
          message: "模板ID参数无效",
        });
      }

      const template = await InitialDataTemplate.findByPk(Number(templateId));
      if (!template) {
        return res.status(404).json({
          success: false,
          message: "初始数据模板不存在",
        });
      }

      return res.status(200).json({
        success: true,
        message: "获取初始数据模板成功",
        data: template,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`获取初始数据模板失败`, {
        templateId: req.body.templateId,
        error: errorMessage,
      });

      return res.status(500).json({
        success: false,
        message: "获取初始数据模板时发生系统错误",
        error: errorMessage,
      });
    }
  };

  /**
   * 创建初始数据模板
   */
  public createTemplate = async (req: Request, res: Response) => {
    try {
      const {
        template_name,
        template_version,
        database_type,
        script_content,
        description,
        execution_order = 999,
        dependencies = [],
        is_enabled = true,
      } = req.body;

      // 验证必填字段
      if (!template_name || !template_version || !database_type || !script_content) {
        return res.status(400).json({
          success: false,
          message: "模板名称、版本、数据库类型和脚本内容为必填项",
        });
      }

      // 验证数据库类型
      if (!["main", "log", "order", "static"].includes(database_type)) {
        return res.status(400).json({
          success: false,
          message: "数据库类型必须是 main, log, order, static 之一",
        });
      }

      // 检查是否已存在相同的模板
      const existingTemplate = await InitialDataTemplate.findByNameAndVersion(
        template_name,
        template_version,
        database_type
      );

      if (existingTemplate) {
        return res.status(409).json({
          success: false,
          message: "已存在相同名称、版本和数据库类型的模板",
        });
      }

      // 创建模板
      const template = await InitialDataTemplate.create({
        template_name,
        template_version,
        database_type,
        script_content,
        description: description || "",
        execution_order: Number(execution_order),
        dependencies: JSON.stringify(dependencies),
        is_enabled: Boolean(is_enabled),
      });

      logger.info(`创建初始数据模板成功`, {
        templateId: template.template_id,
        templateName: template.template_name,
        templateVersion: template.template_version,
      });

      return res.status(201).json({
        success: true,
        message: "创建初始数据模板成功",
        data: template,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`创建初始数据模板失败`, { error: errorMessage });

      return res.status(500).json({
        success: false,
        message: "创建初始数据模板时发生系统错误",
        error: errorMessage,
      });
    }
  };

  /**
   * 更新初始数据模板
   */
  public updateTemplate = async (req: Request, res: Response) => {
    try {
      const {
        templateId,
        template_name,
        template_version,
        database_type,
        script_content,
        description,
        execution_order,
        dependencies,
        is_enabled,
      } = req.body;

      if (!templateId || isNaN(Number(templateId))) {
        return res.status(400).json({
          success: false,
          message: "模板ID参数无效",
        });
      }

      // 查找模板
      const template = await InitialDataTemplate.findByPk(Number(templateId));
      if (!template) {
        return res.status(404).json({
          success: false,
          message: "初始数据模板不存在",
        });
      }

      // 验证数据库类型
      if (database_type && !["main", "log", "order", "static"].includes(database_type)) {
        return res.status(400).json({
          success: false,
          message: "数据库类型必须是 main, log, order, static 之一",
        });
      }

      // 检查新的名称、版本、数据库类型组合是否冲突
      if (template_name || template_version || database_type) {
        const checkName = template_name || template.template_name;
        const checkVersion = template_version || template.template_version;
        const checkDbType = database_type || template.database_type;

        const conflictTemplate = await InitialDataTemplate.findByNameAndVersion(
          checkName,
          checkVersion,
          checkDbType as "main" | "log" | "order" | "static"
        );

        if (conflictTemplate && conflictTemplate.template_id !== template.template_id) {
          return res.status(409).json({
            success: false,
            message: "已存在相同名称、版本和数据库类型的其他模板",
          });
        }
      }

      // 更新模板
      const updateData: any = {};
      if (template_name !== undefined) updateData.template_name = template_name;
      if (template_version !== undefined) updateData.template_version = template_version;
      if (database_type !== undefined) updateData.database_type = database_type;
      if (script_content !== undefined) updateData.script_content = script_content;
      if (description !== undefined) updateData.description = description;
      if (execution_order !== undefined) updateData.execution_order = Number(execution_order);
      if (dependencies !== undefined) updateData.dependencies = JSON.stringify(dependencies);
      if (is_enabled !== undefined) updateData.is_enabled = Boolean(is_enabled);

      await template.update(updateData);

      logger.info(`更新初始数据模板成功`, {
        templateId: template.template_id,
        templateName: template.template_name,
      });

      return res.status(200).json({
        success: true,
        message: "更新初始数据模板成功",
        data: template,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`更新初始数据模板失败`, {
        templateId: req.body.templateId,
        error: errorMessage,
      });

      return res.status(500).json({
        success: false,
        message: "更新初始数据模板时发生系统错误",
        error: errorMessage,
      });
    }
  };

  /**
   * 删除初始数据模板
   */
  public deleteTemplate = async (req: Request, res: Response) => {
    try {
      const { templateId } = req.body;

      if (!templateId || isNaN(Number(templateId))) {
        return res.status(400).json({
          success: false,
          message: "模板ID参数无效",
        });
      }

      // 查找模板
      const template = await InitialDataTemplate.findByPk(Number(templateId));
      if (!template) {
        return res.status(404).json({
          success: false,
          message: "初始数据模板不存在",
        });
      }

      const templateInfo = {
        templateId: template.template_id,
        templateName: template.template_name,
        templateVersion: template.template_version,
      };

      // 删除模板
      await template.destroy();

      logger.info(`删除初始数据模板成功`, templateInfo);

      return res.status(200).json({
        success: true,
        message: "删除初始数据模板成功",
        data: templateInfo,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`删除初始数据模板失败`, {
        templateId: req.body.templateId,
        error: errorMessage,
      });

      return res.status(500).json({
        success: false,
        message: "删除初始数据模板时发生系统错误",
        error: errorMessage,
      });
    }
  };

  /**
   * 启用/禁用初始数据模板
   */
  public toggleTemplate = async (req: Request, res: Response) => {
    try {
      const { templateId, is_enabled } = req.body;

      if (!templateId || isNaN(Number(templateId))) {
        return res.status(400).json({
          success: false,
          message: "模板ID参数无效",
        });
      }

      if (is_enabled === undefined) {
        return res.status(400).json({
          success: false,
          message: "is_enabled 参数必填",
        });
      }

      // 查找模板
      const template = await InitialDataTemplate.findByPk(Number(templateId));
      if (!template) {
        return res.status(404).json({
          success: false,
          message: "初始数据模板不存在",
        });
      }

      // 更新状态
      await template.update({ is_enabled: Boolean(is_enabled) });

      logger.info(`${is_enabled ? "启用" : "禁用"}初始数据模板成功`, {
        templateId: template.template_id,
        templateName: template.template_name,
        isEnabled: is_enabled,
      });

      return res.status(200).json({
        success: true,
        message: `${is_enabled ? "启用" : "禁用"}初始数据模板成功`,
        data: {
          templateId: template.template_id,
          templateName: template.template_name,
          isEnabled: template.is_enabled,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`切换初始数据模板状态失败`, {
        templateId: req.body.templateId,
        error: errorMessage,
      });

      return res.status(500).json({
        success: false,
        message: "切换初始数据模板状态时发生系统错误",
        error: errorMessage,
      });
    }
  };
}

export default InitialDataTemplateController;
