import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import logger from "@/utils/logger";

dotenv.config();

/**
 * 基准数据库连接配置
 * 用于表结构检测的参考数据库
 */
const baseSequelize = new Sequelize({
  dialect: "mysql",
  host: process.env.BASE_DB_HOST || process.env.DB_HOST || "localhost",
  port: parseInt(process.env.BASE_DB_PORT || process.env.DB_PORT || "3306"),
  database:
    process.env.BASE_DB_NAME || process.env.DB_NAME || "base_schema_database",
  username: process.env.BASE_DB_USER || process.env.DB_USER || "root",
  password: process.env.BASE_DB_PASSWORD || process.env.DB_PASSWORD || "123456",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true,
  },
});

/**
 * 测试基准数据库连接
 */
export const testBaseConnection = async (): Promise<void> => {
  try {
    await baseSequelize.authenticate();
    logger.info(`✅ 基准数据库连接成功: ${process.env.BASE_DB_NAME || "默认"}`);
  } catch (error) {
    logger.error("❌ 基准数据库连接失败:", error);
    throw error;
  }
};

/**
 * 获取基准数据库信息
 */
export const getBaseDatabaseInfo = () => {
  return {
    host: process.env.BASE_DB_HOST || process.env.DB_HOST || "localhost",
    port: parseInt(process.env.BASE_DB_PORT || process.env.DB_PORT || "3306"),
    database:
      process.env.BASE_DB_NAME || process.env.DB_NAME || "base_schema_database",
    username: process.env.BASE_DB_USER || process.env.DB_USER || "root",
  };
};

export default baseSequelize;
