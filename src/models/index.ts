import sequelize from "@/config/database";
import TableSchema from "./TableSchema";
import Enterprise from "./Enterprise";

// 初始化所有模型
const models = {
  TableSchema,
  Enterprise,
};

// 同步数据库
export const syncDatabase = async (force: boolean = false) => {
  try {
    await sequelize.sync({ force });
    console.log("数据库同步完成");
  } catch (error) {
    console.error("数据库同步失败:", error);
    throw error;
  }
};

export default models;
