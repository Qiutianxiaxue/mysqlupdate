import { Request, Response } from "express";
import { QueryTypes } from "sequelize";
import { SchemaDetectionService } from "@/services/SchemaDetectionService";
import baseSequelize from "@/config/baseDatabase";
import logger from "@/utils/logger";

export class SchemaDetectionController {
  private detectionService: SchemaDetectionService;

  constructor() {
    // 使用独立的基准数据库
    this.detectionService = new SchemaDetectionService();
  }

  /**
   * 检测单个表的结构变化
   * POST /api/schema-detection/table
   * {
   *   "tableName": "users",
   *   "databaseType": "main"
   * }
   */
  detectSingleTable = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tableName, databaseType = "main" } = req.body;

      if (!tableName) {
        res.status(400).json({
          success: false,
          message: "表名不能为空",
        });
        return;
      }

      logger.info(`开始检测表 ${tableName} 的结构变化`);

      const result = await this.detectionService.detectTableChanges(
        tableName,
        databaseType
      );

      if (!result) {
        res.json({
          success: true,
          message: `表 ${tableName} 没有结构变化`,
          data: null,
        });
        return;
      }

      res.json({
        success: true,
        message: `检测到表 ${tableName} 有结构变化`,
        data: result,
      });
    } catch (error) {
      logger.error("检测单个表结构变化失败:", error);
      res.status(500).json({
        success: false,
        message: "检测表结构变化失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  /**
   * 检测所有数据库类型的表结构变化
   * POST /api/schema-detection/all
   *
   * 自动检测基准数据库中的所有表
   */
  detectAllTables = async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info(`开始检测所有数据库类型的表结构变化`);

      const results = await this.detectionService.detectAllTablesChanges();

      res.json({
        success: true,
        message: `检测完成，共发现 ${results.changes.length} 个表有结构变化`,
        data: results.changes,
        new_tables: results.newTables,
        deleted_tables: results.deletedTables,
        summary: {
          ...results.summary,
          tables_changed: results.changes.map((r) => r.table_name),
        },
      });
    } catch (error) {
      logger.error("检测所有表结构变化失败:", error);
      res.status(500).json({
        success: false,
        message: "检测所有表结构变化失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  /**
   * 检测并保存所有数据库类型的表结构变化
   * POST /api/schema-detection/detect-and-save
   *
   * 自动检测所有表并保存变化
   */
  detectAndSave = async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info(`开始检测并保存所有数据库类型的表结构变化`);

      // 检测变化
      const result = await this.detectionService.detectAllTablesChanges();

      if (result.changes.length === 0) {
        res.json({
          success: true,
          message: "没有检测到表结构变化",
          data: [],
          new_tables: result.newTables,
          deleted_tables: result.deletedTables,
          summary: {
            ...result.summary,
            saved: false,
          },
        });
        return;
      }

      // 自动保存变化
      await this.detectionService.saveDetectedChanges(result.changes);
      logger.info(`已保存 ${result.changes.length} 个表的结构变化`);

      res.json({
        success: true,
        message: `检测完成，发现 ${result.changes.length} 个表有结构变化，已保存`,
        data: result.changes,
        new_tables: result.newTables,
        deleted_tables: result.deletedTables,
        summary: {
          ...result.summary,
          tables_changed: result.changes.map((c) => ({
            table_name: c.table_name,
            version: `${c.current_version} -> ${c.new_version}`,
            changes_count: c.changes_detected.length,
          })),
          saved: true,
        },
      });
    } catch (error) {
      logger.error("检测并保存表结构变化失败:", error);
      res.status(500).json({
        success: false,
        message: "检测并保存表结构变化失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  /**
   * 保存检测到的表结构变化
   * POST /api/schema-detection/save
   * {
   *   "changes": [...]  // 从检测接口获得的变化数据
   * }
   */
  saveChanges = async (req: Request, res: Response): Promise<void> => {
    try {
      const { changes } = req.body;

      if (!changes || !Array.isArray(changes) || changes.length === 0) {
        res.status(400).json({
          success: false,
          message: "变化数据不能为空",
        });
        return;
      }

      logger.info(`开始保存 ${changes.length} 个表结构变化`);

      await this.detectionService.saveDetectedChanges(changes);

      res.json({
        success: true,
        message: `成功保存 ${changes.length} 个表的结构变化`,
        data: {
          saved_count: changes.length,
          saved_tables: changes.map((c: any) => c.table_name),
        },
      });
    } catch (error) {
      logger.error("保存表结构变化失败:", error);
      res.status(500).json({
        success: false,
        message: "保存表结构变化失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  /**
   * 获取基准数据库中的所有表信息
   * GET /api/schema-detection/tables
   */
  getBaseTables = async (req: Request, res: Response): Promise<void> => {
    try {
      // logger.info("获取基准数据库中的所有表信息");

      // 使用service的私有方法，这里需要创建一个公共方法
      const query = `
        SELECT 
          TABLE_NAME,
          ENGINE,
          TABLE_COLLATION,
          TABLE_COMMENT,
          CREATE_TIME,
          UPDATE_TIME,
          TABLE_ROWS,
          DATA_LENGTH,
          INDEX_LENGTH,
          AUTO_INCREMENT
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `;

      const tables = (await baseSequelize.query(query, {
        type: QueryTypes.SELECT,
      })) as Array<{
        TABLE_NAME: string;
        ENGINE: string;
        TABLE_COLLATION: string;
        TABLE_COMMENT: string;
        CREATE_TIME: string;
        UPDATE_TIME: string;
        TABLE_ROWS: number;
        DATA_LENGTH: number;
        INDEX_LENGTH: number;
        AUTO_INCREMENT: number;
      }>;

      res.json({
        success: true,
        message: `获取到 ${tables.length} 个表的信息`,
        data: tables.map((table) => ({
          table_name: table.TABLE_NAME,
          engine: table.ENGINE,
          collation: table.TABLE_COLLATION,
          charset: table.TABLE_COLLATION
            ? table.TABLE_COLLATION.split("_")[0]
            : null,
          comment: table.TABLE_COMMENT,
          create_time: table.CREATE_TIME,
          update_time: table.UPDATE_TIME,
          table_rows: table.TABLE_ROWS,
          data_length: table.DATA_LENGTH,
          index_length: table.INDEX_LENGTH,
          auto_increment: table.AUTO_INCREMENT,
          total_size: (table.DATA_LENGTH || 0) + (table.INDEX_LENGTH || 0),
        })),
        summary: {
          total_tables: tables.length,
          engines: [...new Set(tables.map((t) => t.ENGINE).filter(Boolean))],
          charsets: [
            ...new Set(
              tables
                .map((t) => t.TABLE_COLLATION?.split("_")[0])
                .filter(Boolean)
            ),
          ],
          total_rows: tables.reduce((sum, t) => sum + (t.TABLE_ROWS || 0), 0),
          total_data_size: tables.reduce(
            (sum, t) => sum + (t.DATA_LENGTH || 0),
            0
          ),
          total_index_size: tables.reduce(
            (sum, t) => sum + (t.INDEX_LENGTH || 0),
            0
          ),
        },
      });
    } catch (error) {
      logger.error("获取基准数据库表信息失败:", error);
      res.status(500).json({
        success: false,
        message: "获取基准数据库表信息失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  /**
   * 获取指定表的详细结构信息
   * POST /api/schema-detection/table/info
   * {
   *   "tableName": "qc_testone"
   * }
   */
  getTableInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tableName } = req.body;

      if (!tableName) {
        res.status(400).json({
          success: false,
          message: "表名不能为空",
        });
        return;
      }

      logger.info(`获取表 ${tableName} 的详细结构信息`);

      // 获取列信息
      const columnsQuery = `
        SELECT 
          COLUMN_NAME,
          DATA_TYPE,
          CHARACTER_MAXIMUM_LENGTH,
          IS_NULLABLE,
          COLUMN_DEFAULT,
          COLUMN_KEY,
          EXTRA,
          COLUMN_COMMENT,
          ORDINAL_POSITION
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = :tableName
        ORDER BY ORDINAL_POSITION
      `;

      const columns = await baseSequelize.query(columnsQuery, {
        replacements: { tableName },
        type: QueryTypes.SELECT,
      });

      if ((columns as any[]).length === 0) {
        res.status(404).json({
          success: false,
          message: `表 ${tableName} 不存在`,
        });
        return;
      }

      // 获取索引信息
      const indexesQuery = `
        SELECT 
          INDEX_NAME,
          COLUMN_NAME,
          NON_UNIQUE,
          SEQ_IN_INDEX
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = :tableName
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `;

      const indexes = await baseSequelize.query(indexesQuery, {
        replacements: { tableName },
        type: QueryTypes.SELECT,
      });

      res.json({
        success: true,
        message: `获取表 ${tableName} 信息成功`,
        data: {
          table_name: tableName,
          columns,
          indexes,
        },
      });
    } catch (error) {
      logger.error(`获取表 ${req.body.tableName || "未知"} 信息失败:`, error);
      res.status(500).json({
        success: false,
        message: "获取表信息失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  /**
   * 预览表名解析和分表类型检测结果
   * GET /api/schema-detection/preview-partition
   */
  previewPartitionDetection = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      logger.info("开始预览表名解析和分表类型检测结果");

      const schemaDetectionService = new SchemaDetectionService();

      // 获取基准数据库中的所有表名
      const query = `
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `;

      const tables = (await baseSequelize.query(query, {
        type: QueryTypes.SELECT,
      })) as Array<{ TABLE_NAME: string }>;

      const tableNames = tables.map((row) => row.TABLE_NAME);

      // 解析和检测每个表
      const results = tableNames.map((fullTableName) => {
        // 解析表名
        const parsed =
          schemaDetectionService.parseTableNamePublic(fullTableName);

        // 检测分表类型
        const partitionInfo = schemaDetectionService.detectPartitionTypePublic(
          parsed.tableName
        );

        return {
          original_table_name: fullTableName,
          parsed_table_name: parsed.tableName,
          clean_table_name: partitionInfo.cleanTableName,
          database_type: parsed.databaseType,
          partition_type: partitionInfo.partition_type,
          time_interval: partitionInfo.time_interval,
          time_format: partitionInfo.time_format,
          has_parsing: fullTableName !== parsed.tableName,
          has_partition: partitionInfo.partition_type !== "none",
          has_rule_removal: parsed.tableName !== partitionInfo.cleanTableName,
        };
      });

      // 统计信息
      const summary = {
        total_tables: results.length,
        by_database_type: {
          main: results.filter((r) => r.database_type === "main").length,
          log: results.filter((r) => r.database_type === "log").length,
          order: results.filter((r) => r.database_type === "order").length,
          static: results.filter((r) => r.database_type === "static").length,
        },
        by_partition_type: {
          none: results.filter((r) => r.partition_type === "none").length,
          store: results.filter((r) => r.partition_type === "store").length,
          time: results.filter((r) => r.partition_type === "time").length,
        },
        tables_with_parsing: results.filter((r) => r.has_parsing).length,
        tables_with_partition: results.filter((r) => r.has_partition).length,
      };

      await schemaDetectionService.close();

      res.json({
        success: true,
        message: `预览了 ${tableNames.length} 个表的解析和检测结果`,
        data: {
          detection_results: results,
          summary: summary,
        },
      });
    } catch (error) {
      logger.error("预览表名解析和分表类型检测失败:", error);
      res.status(500).json({
        success: false,
        message: "预览表名解析和分表类型检测失败",
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  };
}
