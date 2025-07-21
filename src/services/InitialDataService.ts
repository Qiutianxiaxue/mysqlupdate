import { QueryTypes } from "sequelize";
import InitialDataHistory from "@/models/InitialDataHistory";
import InitialDataTemplate from "@/models/InitialDataTemplate";
import Enterprise from "@/models/Enterprise";
import DatabaseConnectionManager from "./DatabaseConnectionManager";
import logger from "@/utils/logger";
import { v4 as uuidv4 } from "uuid";

interface InitialDataScript {
  name: string;
  version: string;
  databaseType: "main" | "log" | "order" | "static";
  description: string;
  content: string;
  order: number; // 执行顺序
  dependencies?: string[]; // 依赖的其他脚本
}

interface InitialDataExecutionResult {
  success: boolean;
  executedScripts: number;
  skippedScripts: number;
  failedScripts: number;
  executionTime: number;
  errors: Array<{
    scriptName: string;
    error: string;
  }>;
}

export class InitialDataService {
  private connectionManager: DatabaseConnectionManager;

  constructor() {
    this.connectionManager = new DatabaseConnectionManager();
  }

  /**
   * 执行企业的初始数据脚本
   * @param enterpriseId 企业ID
   * @param databaseType 数据库类型，如果不指定则执行所有类型
   * @param forceRerun 是否强制重新执行已成功的脚本
   */
  public async executeInitialData(
    enterpriseId: number,
    databaseType?: "main" | "log" | "order" | "static",
    forceRerun: boolean = false
  ): Promise<InitialDataExecutionResult> {
    const startTime = Date.now();
    const executionBatch = uuidv4();
    const result: InitialDataExecutionResult = {
      success: true,
      executedScripts: 0,
      skippedScripts: 0,
      failedScripts: 0,
      executionTime: 0,
      errors: [],
    };

    try {
      // 获取企业信息
      const enterprise = await Enterprise.findByPk(enterpriseId);
      if (!enterprise) {
        throw new Error(`企业不存在：${enterpriseId}`);
      }

      // 获取所有初始数据脚本
      const scripts = await this.loadInitialDataScripts(databaseType);
      if (scripts.length === 0) {
        logger.info(`没有找到初始数据脚本`, { enterpriseId, databaseType });
        return result;
      }

      // 按顺序和依赖关系排序脚本
      const sortedScripts = this.sortScriptsByDependencies(scripts);

      logger.info(`开始执行初始数据脚本`, {
        enterpriseId,
        databaseType,
        scriptCount: sortedScripts.length,
        executionBatch,
      });

      // 逐个执行脚本
      for (const script of sortedScripts) {
        try {
          // 检查脚本是否已经执行过
          if (!forceRerun) {
            const isExecuted = await InitialDataHistory.isScriptExecuted(
              enterpriseId,
              script.databaseType,
              script.name,
              script.version
            );

            if (isExecuted) {
              logger.debug(`跳过已执行的脚本: ${script.name}`, {
                enterpriseId,
                scriptName: script.name,
                scriptVersion: script.version,
              });
              result.skippedScripts++;
              continue;
            }
          }

          // 执行脚本
          await this.executeScript(enterprise, script, executionBatch);
          result.executedScripts++;

          logger.info(`脚本执行成功: ${script.name}`, {
            enterpriseId,
            scriptName: script.name,
            scriptVersion: script.version,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`脚本执行失败: ${script.name}`, {
            enterpriseId,
            scriptName: script.name,
            error: errorMessage,
          });

          result.errors.push({
            scriptName: script.name,
            error: errorMessage,
          });
          result.failedScripts++;
          result.success = false;

          // 记录失败的执行历史
          await InitialDataHistory.create({
            enterprise_id: enterpriseId,
            database_type: script.databaseType,
            script_name: script.name,
            script_version: script.version,
            execution_status: "FAILED",
            execution_time: 0,
            affected_rows: 0,
            error_message: errorMessage,
            script_content: script.content,
            execution_batch: executionBatch,
          });
        }
      }

      result.executionTime = Date.now() - startTime;

      logger.info(`初始数据执行完成`, {
        enterpriseId,
        databaseType,
        executionBatch,
        result,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`初始数据执行失败`, {
        enterpriseId,
        databaseType,
        error: errorMessage,
      });

      result.success = false;
      result.errors.push({
        scriptName: "系统错误",
        error: errorMessage,
      });
      result.executionTime = Date.now() - startTime;

      return result;
    }
  }

  /**
   * 执行单个脚本
   */
  private async executeScript(
    enterprise: Enterprise,
    script: InitialDataScript,
    executionBatch: string
  ): Promise<void> {
    const startTime = Date.now();

    // 获取数据库连接
    const sequelize = await this.connectionManager.getConnection(
      enterprise,
      script.databaseType
    );

    let affectedRows = 0;

    try {
      // 执行SQL脚本
      const statements = this.parseSqlStatements(script.content);

      for (const statement of statements) {
        if (statement.trim()) {
          const result = await sequelize.query(statement, {
            type: QueryTypes.RAW,
          });
          
          // 尝试获取影响的行数
          if (Array.isArray(result) && result[1] && typeof result[1] === 'object') {
            const meta = result[1] as any;
            if (meta.affectedRows !== undefined) {
              affectedRows += meta.affectedRows;
            }
          }
        }
      }

      const executionTime = Date.now() - startTime;

      // 记录执行历史
      await InitialDataHistory.create({
        enterprise_id: enterprise.enterprise_id,
        database_type: script.databaseType,
        script_name: script.name,
        script_version: script.version,
        execution_status: "SUCCESS",
        execution_time: executionTime,
        affected_rows: affectedRows,
        script_content: script.content,
        execution_batch: executionBatch,
      });

      logger.info(`脚本执行成功`, {
        enterpriseId: enterprise.enterprise_id,
        scriptName: script.name,
        executionTime,
        affectedRows,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`脚本执行失败`, {
        enterpriseId: enterprise.enterprise_id,
        scriptName: script.name,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * 解析SQL语句（按分号分割）
   */
  private parseSqlStatements(content: string): string[] {
    return content
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);
  }

  /**
   * 从数据库加载初始数据脚本模板
   */
  private async loadInitialDataScripts(
    databaseType?: "main" | "log" | "order" | "static"
  ): Promise<InitialDataScript[]> {
    const scripts: InitialDataScript[] = [];

    try {
      // 从数据库获取启用的脚本模板
      const templates = await InitialDataTemplate.getEnabledTemplates(databaseType);

      for (const template of templates) {
        scripts.push({
          name: template.template_name,
          version: template.template_version,
          databaseType: template.database_type,
          description: template.description,
          content: template.script_content,
          order: template.execution_order,
          dependencies: template.getDependencies(),
        });
      }

      logger.info(`从数据库加载了 ${scripts.length} 个初始数据脚本模板`, { databaseType });
      return scripts;
    } catch (error) {
      logger.error(`从数据库加载初始数据脚本模板失败`, { error });
      throw error;
    }
  }

  /**
   * 按依赖关系和顺序排序脚本
   */
  private sortScriptsByDependencies(scripts: InitialDataScript[]): InitialDataScript[] {
    // 简单的拓扑排序实现
    const sorted: InitialDataScript[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (script: InitialDataScript) => {
      if (visiting.has(script.name)) {
        throw new Error(`检测到循环依赖: ${script.name}`);
      }
      
      if (visited.has(script.name)) {
        return;
      }

      visiting.add(script.name);

      // 先处理依赖
      if (script.dependencies) {
        for (const depName of script.dependencies) {
          const depScript = scripts.find((s) => s.name === depName);
          if (depScript) {
            visit(depScript);
          }
        }
      }

      visiting.delete(script.name);
      visited.add(script.name);
      sorted.push(script);
    };

    // 按order排序后进行拓扑排序
    const orderedScripts = [...scripts].sort((a, b) => a.order - b.order);
    
    for (const script of orderedScripts) {
      visit(script);
    }

    return sorted;
  }

  /**
   * 获取企业的初始数据执行状态
   */
  public async getInitialDataStatus(
    enterpriseId: number,
    databaseType?: "main" | "log" | "order" | "static"
  ) {
    const dbTypes = databaseType ? [databaseType] : ["main", "log", "order", "static"];
    const statusMap: any = {};

    for (const dbType of dbTypes) {
      // 获取已执行的脚本
      const executedScripts = await InitialDataHistory.getExecutedScripts(
        enterpriseId,
        dbType as "main" | "log" | "order" | "static"
      );

      // 获取所有可用脚本
      const allScripts = await this.loadInitialDataScripts(
        dbType as "main" | "log" | "order" | "static"
      );

      // 获取最新执行记录
      const latestRecord = await InitialDataHistory.getLatestStatus(
        enterpriseId,
        dbType as "main" | "log" | "order" | "static"
      );

      statusMap[dbType] = {
        totalScripts: allScripts.length,
        executedScripts: executedScripts.length,
        pendingScripts: allScripts.length - executedScripts.length,
        executedList: executedScripts,
        lastExecution: latestRecord ? {
          scriptName: latestRecord.script_name,
          status: latestRecord.execution_status,
          executionTime: latestRecord.execution_time,
          createTime: latestRecord.create_time,
        } : null,
      };
    }

    return statusMap;
  }

  /**
   * 获取企业的初始数据执行历史
   */
  public async getExecutionHistory(
    enterpriseId: number,
    databaseType?: "main" | "log" | "order" | "static",
    limit: number = 50
  ) {
    const whereClause: any = { enterprise_id: enterpriseId };
    
    if (databaseType) {
      whereClause.database_type = databaseType;
    }

    return await InitialDataHistory.findAll({
      where: whereClause,
      order: [["create_time", "DESC"]],
      limit,
    });
  }
}

export default InitialDataService;
