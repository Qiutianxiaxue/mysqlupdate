import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "@/config/database";

// 迁移锁接口
export interface MigrationLockAttributes {
  migration_lock_id: number;
  lock_key: string; // 锁的唯一标识
  lock_type: "SINGLE_TABLE" | "ALL_TABLES"; // 锁类型：单表迁移或全部迁移
  table_name?: string; // 如果是单表迁移，记录表名
  database_type?: "main" | "log" | "order" | "static"; // 数据库类型
  partition_type?: "store" | "time" | "none"; // 分区类型
  start_time: Date; // 锁创建时间
  lock_holder: string; // 锁持有者信息（可以是IP、进程ID等）
  operation_info?: string; // 操作详细信息
  is_active: boolean; // 锁是否激活
  create_time: Date;
  update_time: Date;
}

// 创建时的可选字段
export interface MigrationLockCreationAttributes
  extends Optional<
    MigrationLockAttributes,
    "migration_lock_id" | "create_time" | "update_time"
  > {}

class MigrationLock extends Model<
  MigrationLockAttributes,
  MigrationLockCreationAttributes
> {
  public migration_lock_id!: number;
  public lock_key!: string;
  public lock_type!: "SINGLE_TABLE" | "ALL_TABLES";
  public table_name?: string;
  public database_type?: "main" | "log" | "order" | "static";
  public partition_type?: "store" | "time" | "none";
  public start_time!: Date;
  public lock_holder!: string;
  public operation_info?: string;
  public is_active!: boolean;
  public readonly create_time!: Date;
  public readonly update_time!: Date;
}

MigrationLock.init(
  {
    migration_lock_id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      comment: "迁移锁的唯一标识ID",
    },
    lock_key: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: "锁的唯一标识",
    },
    lock_type: {
      type: DataTypes.ENUM("SINGLE_TABLE", "ALL_TABLES"),
      allowNull: false,
      comment: "锁类型：单表迁移或全部迁移",
    },
    table_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "如果是单表迁移，记录表名",
    },
    database_type: {
      type: DataTypes.ENUM("main", "log", "order", "static"),
      allowNull: true,
      comment: "数据库类型",
    },
    partition_type: {
      type: DataTypes.ENUM("store", "time", "none"),
      allowNull: true,
      comment: "分区类型",
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "锁创建时间",
    },
    lock_holder: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "锁持有者信息",
    },
    operation_info: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "操作详细信息",
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "锁是否激活",
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
      comment: "记录最后更新时间",
    },
  },
  {
    sequelize,
    tableName: "qc_migration_locks",
    modelName: "MigrationLock",
    timestamps: false, // 使用自定义的时间字段
    comment: "迁移锁表",
    indexes: [
      {
        name: "idx_lock_key",
        fields: ["lock_key"],
        unique: true,
      },
      {
        name: "idx_is_active",
        fields: ["is_active"],
      },
      {
        name: "idx_lock_type",
        fields: ["lock_type"],
      },
      {
        name: "idx_table_info",
        fields: ["table_name", "database_type", "partition_type"],
      },
    ],
  }
);

export default MigrationLock;
