import sequelize from "@/config/database";
import TableSchema from "./TableSchema";
import Enterprise from "./Enterprise";
import MigrationHistory from "./MigrationHistory";

// 初始化所有模型
const models = {
  TableSchema,
  Enterprise,
  MigrationHistory,
};

// 同步数据库
export const syncDatabase = async (force: boolean = false) => {
  try {
    if (force) {
      // 强制重建时删除所有表并重新创建
      await sequelize.sync({ force: true });
      console.log("数据库强制同步完成（所有表已重建）");
    } else {
      // 正常启动时只检查表是否存在，不自动修改结构
      // 这避免了每次启动都创建重复索引的问题
      await sequelize.sync({ alter: false });
      console.log("数据库同步完成（仅检查表存在性）");
    }
  } catch (error) {
    console.error("数据库同步失败:", error);
    // 如果是表不存在的错误，尝试创建表
    if (
      error instanceof Error &&
      (error as any).name === "SequelizeDatabaseError" &&
      (error as any).original?.code === "ER_NO_SUCH_TABLE"
    ) {
      console.log("检测到表不存在，尝试创建表...");
      try {
        await sequelize.sync({ force: false, alter: false });
        console.log("表创建成功");
      } catch (createError) {
        console.error("表创建失败:", createError);
        throw createError;
      }
    } else {
      throw error;
    }
  }
};

export default models;
