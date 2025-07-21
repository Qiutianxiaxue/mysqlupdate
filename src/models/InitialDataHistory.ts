import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "@/config/database";

// 初始数据历史记录接口
export interface InitialDataHistoryAttributes {
  initial_data_history_id: number;
  enterprise_id: number; // 企业ID
  database_type: "main" | "log" | "order" | "static"; // 数据库类型
  script_name: string; // 初始数据脚本名称
  script_version: string; // 脚本版本
  execution_status: "SUCCESS" | "FAILED" | "PENDING"; // 执行状态
  execution_time: number; // 执行耗时（毫秒）
  affected_rows: number; // 影响的行数
  error_message?: string; // 错误信息（如果失败）
  script_content: string; // 执行的脚本内容
  execution_batch: string; // 执行批次ID（用于关联同一次初始化的多个脚本）
  create_time: Date;
  update_time: Date;
}

// 创建时的可选字段
export interface InitialDataHistoryCreationAttributes
  extends Optional<
    InitialDataHistoryAttributes,
    "initial_data_history_id" | "create_time" | "update_time"
  > {}

class InitialDataHistory extends Model<
  InitialDataHistoryAttributes,
  InitialDataHistoryCreationAttributes
> {
  public initial_data_history_id!: number;
  public enterprise_id!: number;
  public database_type!: "main" | "log" | "order" | "static";
  public script_name!: string;
  public script_version!: string;
  public execution_status!: "SUCCESS" | "FAILED" | "PENDING";
  public execution_time!: number;
  public affected_rows!: number;
  public error_message?: string;
  public script_content!: string;
  public execution_batch!: string;
  public readonly create_time!: Date;
  public readonly update_time!: Date;

  // 静态方法：获取企业的最新初始数据状态
  public static async getLatestStatus(
    enterpriseId: number,
    databaseType: "main" | "log" | "order" | "static"
  ) {
    return await InitialDataHistory.findOne({
      where: {
        enterprise_id: enterpriseId,
        database_type: databaseType,
      },
      order: [["create_time", "DESC"]],
    });
  }

  // 静态方法：获取企业已执行的脚本列表
  public static async getExecutedScripts(
    enterpriseId: number,
    databaseType: "main" | "log" | "order" | "static"
  ) {
    const records = await InitialDataHistory.findAll({
      where: {
        enterprise_id: enterpriseId,
        database_type: databaseType,
        execution_status: "SUCCESS",
      },
      attributes: ["script_name", "script_version"],
      order: [["create_time", "ASC"]],
    });

    return records.map((record) => ({
      script_name: record.script_name,
      script_version: record.script_version,
    }));
  }

  // 静态方法：检查脚本是否已执行
  public static async isScriptExecuted(
    enterpriseId: number,
    databaseType: "main" | "log" | "order" | "static",
    scriptName: string,
    scriptVersion: string
  ): Promise<boolean> {
    const count = await InitialDataHistory.count({
      where: {
        enterprise_id: enterpriseId,
        database_type: databaseType,
        script_name: scriptName,
        script_version: scriptVersion,
        execution_status: "SUCCESS",
      },
    });

    return count > 0;
  }
}

InitialDataHistory.init(
  {
    initial_data_history_id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      comment: "初始数据历史记录的唯一标识ID",
    },
    enterprise_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "企业ID，标识该初始数据记录属于哪个企业",
    },
    database_type: {
      type: DataTypes.ENUM("main", "log", "order", "static"),
      allowNull: false,
      comment: "数据库类型：main-主数据库，log-日志数据库，order-订单数据库，static-静态数据库",
    },
    script_name: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: "初始数据脚本名称",
    },
    script_version: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "脚本版本号",
    },
    execution_status: {
      type: DataTypes.ENUM("SUCCESS", "FAILED", "PENDING"),
      allowNull: false,
      comment: "执行状态：SUCCESS-成功，FAILED-失败，PENDING-待执行",
    },
    execution_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "脚本执行耗时（毫秒）",
    },
    affected_rows: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "脚本执行影响的行数",
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "错误信息（如果执行失败）",
    },
    script_content: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
      comment: "执行的初始数据脚本内容",
    },
    execution_batch: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: "执行批次ID，用于关联同一次初始化的多个脚本",
    },
    create_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "记录创建时间",
    },
    update_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "记录更新时间",
    },
  },
  {
    sequelize,
    modelName: "InitialDataHistory",
    tableName: "qc_initial_data_history",
    timestamps: true,
    createdAt: "create_time",
    updatedAt: "update_time",
    comment: "初始数据执行历史记录表",
    indexes: [
      {
        name: "idx_enterprise_database",
        fields: ["enterprise_id", "database_type"],
      },
      {
        name: "idx_script_name_version",
        fields: ["script_name", "script_version"],
      },
      {
        name: "idx_execution_status",
        fields: ["execution_status"],
      },
      {
        name: "idx_execution_batch",
        fields: ["execution_batch"],
      },
    ],
  }
);

export default InitialDataHistory;
