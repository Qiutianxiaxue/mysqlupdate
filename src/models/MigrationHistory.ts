import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "@/config/database";

// 迁移历史记录接口
export interface MigrationHistoryAttributes {
  migration_history_id: number;
  table_name: string;
  database_type: "main" | "log" | "order" | "static";
  partition_type: "store" | "time" | "none";
  schema_version: string; // 迁移到的版本
  migration_type: "CREATE" | "ALTER" | "DROP" | "INDEX"; // 迁移类型
  sql_statement: string; // 执行的SQL语句
  execution_status: "SUCCESS" | "FAILED"; // 执行状态
  execution_time: number; // 执行耗时（毫秒）
  error_message?: string; // 错误信息（如果失败）
  migration_batch: string; // 迁移批次ID（用于关联同一次迁移的多个SQL）
  create_time: Date;
}

// 创建时的可选字段
export interface MigrationHistoryCreationAttributes
  extends Optional<
    MigrationHistoryAttributes,
    "migration_history_id" | "create_time"
  > {}

class MigrationHistory extends Model<
  MigrationHistoryAttributes,
  MigrationHistoryCreationAttributes
> {
  public migration_history_id!: number;
  public table_name!: string;
  public database_type!: "main" | "log" | "order" | "static";
  public partition_type!: "store" | "time" | "none";
  public schema_version!: string;
  public migration_type!: "CREATE" | "ALTER" | "DROP" | "INDEX";
  public sql_statement!: string;
  public execution_status!: "SUCCESS" | "FAILED";
  public execution_time!: number;
  public error_message?: string;
  public migration_batch!: string;
  public readonly create_time!: Date;
}

MigrationHistory.init(
  {
    migration_history_id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      comment: "迁移历史记录的唯一标识ID",
    },
    table_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: "迁移的表名",
    },
    database_type: {
      type: DataTypes.ENUM("main", "log", "order", "static"),
      allowNull: false,
      comment: "数据库类型",
    },
    partition_type: {
      type: DataTypes.ENUM("store", "time", "none"),
      allowNull: false,
      comment: "分区类型",
    },
    schema_version: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "迁移到的目标版本",
    },
    migration_type: {
      type: DataTypes.ENUM("CREATE", "ALTER", "DROP", "INDEX"),
      allowNull: false,
      comment:
        "迁移类型：CREATE-创建表，ALTER-修改表，DROP-删除表/列，INDEX-索引操作",
    },
    sql_statement: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "执行的SQL语句",
    },
    execution_status: {
      type: DataTypes.ENUM("SUCCESS", "FAILED"),
      allowNull: false,
      comment: "执行状态：SUCCESS-成功，FAILED-失败",
    },
    execution_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "SQL执行耗时（毫秒）",
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "错误信息（执行失败时记录）",
    },
    migration_batch: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: "迁移批次ID，用于关联同一次迁移操作的多个SQL",
    },
    create_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "记录创建时间",
    },
  },
  {
    sequelize,
    tableName: "qc_migration_history",
    modelName: "MigrationHistory",
    timestamps: false, // 使用自定义的时间字段
    indexes: [
      {
        name: "idx_table_database",
        fields: ["table_name", "database_type"],
      },
      {
        name: "idx_migration_batch",
        fields: ["migration_batch"],
      },
      {
        name: "idx_create_time",
        fields: ["create_time"],
      },
      {
        name: "idx_execution_status",
        fields: ["execution_status"],
      },
    ],
  }
);

export default MigrationHistory;
