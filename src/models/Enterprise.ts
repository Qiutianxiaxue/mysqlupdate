import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "@/config/database";

// 企业表接口
export interface EnterpriseAttributes {
  enterprise_id: number;
  enterprise_key: string;
  enterprise_code: number;
  enterprise_name?: string;
  enterprise_logo?: string;
  database_name: string;
  database_hostname: string;
  database_username: string;
  database_password: string;
  database_hostport: string;
  log_database_name?: string;
  log_database_hostname?: string;
  log_database_username?: string;
  log_database_password?: string;
  log_database_hostport?: string;
  order_database_name?: string;
  order_database_hostname?: string;
  order_database_username?: string;
  order_database_password?: string;
  order_database_hostport?: string;
  static_database_name?: string;
  static_database_hostname?: string;
  static_database_username?: string;
  static_database_password?: string;
  static_database_hostport?: string;
  user_id?: string;
  status: number; // 2审核中1正常0禁用
  create_time?: Date;
  update_time?: Date;
}

// 创建时的可选字段
export interface EnterpriseCreationAttributes
  extends Optional<
    EnterpriseAttributes,
    "enterprise_id" | "create_time" | "update_time"
  > {}

class Enterprise extends Model<
  EnterpriseAttributes,
  EnterpriseCreationAttributes
> {
  public enterprise_id!: number;
  public enterprise_key!: string;
  public enterprise_code!: number;
  public enterprise_name?: string;
  public enterprise_logo?: string;
  public database_name!: string;
  public database_hostname!: string;
  public database_username!: string;
  public database_password!: string;
  public database_hostport!: string;
  public log_database_name?: string;
  public log_database_hostname?: string;
  public log_database_username?: string;
  public log_database_password?: string;
  public log_database_hostport?: string;
  public order_database_name?: string;
  public order_database_hostname?: string;
  public order_database_username?: string;
  public order_database_password?: string;
  public order_database_hostport?: string;
  public static_database_name?: string;
  public static_database_hostname?: string;
  public static_database_username?: string;
  public static_database_password?: string;
  public static_database_hostport?: string;
  public user_id?: string;
  public status!: number;
  public readonly create_time?: Date;
  public readonly update_time?: Date;
}

Enterprise.init(
  {
    enterprise_id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      comment: "主键",
    },
    enterprise_key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "企业KEY",
    },
    enterprise_code: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "企业编号(六位数字编号)",
    },
    enterprise_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "企业名称",
    },
    enterprise_logo: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "企业logo",
    },
    database_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "enterprise",
      comment: "数据库名称",
    },
    database_hostname: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "127.0.0.1",
      comment: "数据库主机",
    },
    database_username: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "root",
      comment: "数据库用户名",
    },
    database_password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "123456",
      comment: "数据库密码",
    },
    database_hostport: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "3306",
      comment: "数据库端口",
    },
    log_database_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "log_name",
      comment: "日志数据库名称",
    },
    log_database_hostname: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "127.0.0.1",
      comment: "日志数据库主机",
    },
    log_database_username: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "root",
      comment: "日志数据库用户名",
    },
    log_database_password: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "123456",
      comment: "日志数据库密码",
    },
    log_database_hostport: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "3306",
      comment: "日志数据库端口",
    },
    order_database_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "order_name",
      comment: "订单数据库名称",
    },
    order_database_hostname: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "127.0.0.1",
      comment: "订单数据库主机",
    },
    order_database_username: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "root",
      comment: "订单数据库用户名",
    },
    order_database_password: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "123456",
      comment: "订单数据库密码",
    },
    order_database_hostport: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "3306",
      comment: "订单数据库端口",
    },
    static_database_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "static_name",
      comment: "静态数据库名称",
    },
    static_database_hostname: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "127.0.0.1",
      comment: "静态数据库主机",
    },
    static_database_username: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "root",
      comment: "静态数据库用户名",
    },
    static_database_password: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "123456",
      comment: "静态数据库密码",
    },
    static_database_hostport: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "3306",
      comment: "静态数据库端口",
    },
    user_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "企业归属用户ID",
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 2,
      comment: "企业状态（2审核中1正常0禁用）",
    },
    create_time: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      comment: "创建时间",
    },
    update_time: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      comment: "更新时间",
    },
  },
  {
    sequelize,
    tableName: "qc_enterprise",
    modelName: "Enterprise",
    timestamps: false, // 使用自定义的时间字段
    // 暂时移除索引配置，避免重复创建索引的问题
    // 索引将通过数据库迁移脚本手动管理
    // indexes: []
  }
);

export default Enterprise;
