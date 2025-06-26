import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "@/config/database";

// 表结构设计接口
export interface TableSchemaAttributes {
  id: number;
  table_name: string;
  database_type: "main" | "log" | "order" | "static"; // 数据库类型
  store_id?: string; // 门店ID，用于分表
  partition_type: "store" | "time" | "none"; // 分表类型
  // 时间分区相关配置
  time_interval?: "day" | "month" | "year"; // 时间分区间隔：天、月、年
  time_format?: string; // 时间分区表名格式，如：_YYYY_MM、_YYYY_MM_DD、_YYYY
  schema_version: string; // 表结构版本
  schema_definition: string; // JSON格式的表结构定义
  is_active: boolean; // 是否激活
  upgrade_notes?: string; // 升级说明
  created_at: Date;
  updated_at: Date;
}

// 创建时的可选字段
export interface TableSchemaCreationAttributes
  extends Optional<TableSchemaAttributes, "id" | "created_at" | "updated_at"> {}

class TableSchema extends Model<
  TableSchemaAttributes,
  TableSchemaCreationAttributes
> {
  public id!: number;
  public table_name!: string;
  public database_type!: "main" | "log" | "order" | "static";
  public store_id?: string;
  public partition_type!: "store" | "time" | "none";
  // 时间分区相关配置
  public time_interval?: "day" | "month" | "year";
  public time_format?: string;
  public schema_version!: string;
  public schema_definition!: string;
  public is_active!: boolean;
  public upgrade_notes?: string;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

TableSchema.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      comment: "表结构定义的唯一标识ID",
    },
    table_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: "数据库表名称",
    },
    database_type: {
      type: DataTypes.ENUM("main", "log", "order", "static"),
      allowNull: false,
      defaultValue: "main",
      comment:
        "数据库类型：main-主数据库，log-日志数据库，order-订单数据库，static-静态数据库",
    },
    store_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "门店ID，用于store类型分表时指定特定门店",
    },
    partition_type: {
      type: DataTypes.ENUM("store", "time", "none"),
      allowNull: false,
      defaultValue: "none",
      comment: "分表类型：store-按门店分表，time-按时间分表，none-不分表",
    },

    // 时间分区相关配置字段
    time_interval: {
      type: DataTypes.ENUM("day", "month", "year"),
      allowNull: true,
      comment: "时间分区间隔：day-按天，month-按月，year-按年",
    },

    time_format: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "时间分区表名格式，如：_YYYY_MM、_YYYY_MM_DD、_YYYY",
    },
    schema_version: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "表结构版本号，支持语义化版本如：1.0.0、1.2.3",
    },
    schema_definition: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "表结构定义，JSON格式存储列、索引等完整表结构信息",
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "是否为激活状态：true-当前使用版本，false-历史版本",
    },
    upgrade_notes: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "版本升级说明，描述本次升级的变更内容",
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "记录创建时间",
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "记录最后更新时间",
    },
  },
  {
    sequelize,
    tableName: "qc_table_schemas",
    modelName: "TableSchema",
  }
);

export default TableSchema;
