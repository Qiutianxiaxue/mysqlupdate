import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "@/config/database";

interface MigrationVersionAttributes {
  migration_version_id: number;
  enterprise_id: number; // 企业ID
  table_name: string;
  database_type: "main" | "log" | "order" | "static";
  partition_rule: string; // 分表规则标识，如 "store", "time_month", "none"
  current_migrated_version: string;
  migration_time: Date; // 迁移时间
  create_time: Date;
  update_time: Date;
}

interface MigrationVersionCreationAttributes
  extends Optional<MigrationVersionAttributes, "migration_version_id" | "create_time" | "update_time"> {}

class MigrationVersion
  extends Model<MigrationVersionAttributes, MigrationVersionCreationAttributes>
  implements MigrationVersionAttributes
{
  public migration_version_id!: number;
  public enterprise_id!: number;
  public table_name!: string;
  public database_type!: "main" | "log" | "order" | "static";
  public partition_rule!: string;
  public current_migrated_version!: string;
  public migration_time!: Date;
  
  public readonly create_time!: Date;
  public readonly update_time!: Date;
}

MigrationVersion.init(
  {
    migration_version_id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    enterprise_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "企业ID，标识该版本记录属于哪个企业",
    },
    table_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "完整表名（包含分表后缀，如 qc_order_store_001 或 qc_log_202401）",
    },
    database_type: {
      type: DataTypes.ENUM("main", "log", "order", "static"),
      allowNull: false,
      comment: "数据库类型",
    },
    partition_rule: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: "分表规则标识（如 store, time_month, none）",
    },
    current_migrated_version: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: "当前已迁移的版本号",
    },
    migration_time: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "迁移时间",
    },
    create_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    update_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "qc_migration_versions",
    timestamps: true,
    createdAt: "create_time",
    updatedAt: "update_time",
    indexes: [
      {
        name: "idx_enterprise_table_database_partition",
        unique: true,
        fields: ["enterprise_id", "table_name", "database_type", "partition_rule"],
      },
      {
        name: "idx_migration_time",
        fields: ["migration_time"],
      },
      {
        name: "idx_enterprise_id",
        fields: ["enterprise_id"],
      },
    ],
    comment: "记录表的迁移版本信息，用于性能优化",
  }
);

export default MigrationVersion;
