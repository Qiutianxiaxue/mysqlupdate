import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "@/config/database";

// 表结构设计接口
export interface TableSchemaAttributes {
  id: number;
  table_name: string;
  database_type: "main" | "log" | "order" | "static"; // 数据库类型
  store_id?: string; // 门店ID，用于分表
  partition_type: "store" | "time" | "none"; // 分表类型
  partition_key?: string; // 分表键
  schema_version: string; // 表结构版本
  schema_definition: string; // JSON格式的表结构定义
  is_active: boolean; // 是否激活
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
  public partition_key?: string;
  public schema_version!: string;
  public schema_definition!: string;
  public is_active!: boolean;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

TableSchema.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    table_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
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
    },
    partition_type: {
      type: DataTypes.ENUM("store", "time", "none"),
      allowNull: false,
      defaultValue: "none",
    },
    partition_key: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    schema_version: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    schema_definition: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "qc_table_schemas",
    modelName: "TableSchema",
  }
);

export default TableSchema;
