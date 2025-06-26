const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 测试列属性更新功能
async function testColumnUpdate() {
  const baseURL = "http://localhost:3000/api/migration";

  console.log("🧪 开始测试列属性更新功能...\n");

  try {
    // 1. 创建初始表结构
    console.log("📝 步骤1: 创建初始表结构");
    const initialSchema = {
      table_name: "test_column_update",
      partition_type: "none",
      database_type: "mysql",
      version: "1.0",
      columns: [
        {
          name: "id",
          type: "int",
          length: 11,
          allowNull: false,
          primaryKey: true,
          autoIncrement: true,
          comment: "原始主键ID",
        },
        {
          name: "name",
          type: "varchar",
          length: 100,
          allowNull: false,
          comment: "原始名称字段",
        },
        {
          name: "status",
          type: "tinyint",
          length: 1,
          allowNull: true,
          defaultValue: 0,
          comment: "原始状态字段",
        },
      ],
      indexes: [
        {
          name: "idx_name",
          fields: ["name"],
          unique: false,
        },
      ],
    };

    const createResponse = await axios.post(
      `${baseURL}/schemas/create`,
      initialSchema
    );
    console.log("✅ 创建表结构:", createResponse.data);

    // 2. 执行初始迁移
    console.log("\n📊 步骤2: 执行初始迁移");
    const initialMigration = await axios.post(`${baseURL}/execute`, {
      table_name: "test_column_update",
      database_type: "mysql",
    });
    console.log("✅ 初始迁移完成:", initialMigration.data);

    // 等待一会儿
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 3. 更新表结构（修改comment和其他属性）
    console.log("\n🔄 步骤3: 更新表结构定义");
    const updatedSchema = {
      table_name: "test_column_update",
      partition_type: "none",
      database_type: "mysql",
      version: "2.0",
      columns: [
        {
          name: "id",
          type: "int",
          length: 11,
          allowNull: false,
          primaryKey: true,
          autoIncrement: true,
          comment: "✨ 更新后的主键ID - 包含表情符号",
        },
        {
          name: "name",
          type: "varchar",
          length: 150, // 修改长度
          allowNull: false,
          comment: "🔥 更新后的名称字段 - 支持更长内容",
        },
        {
          name: "status",
          type: "tinyint",
          length: 1,
          allowNull: false, // 改为不允许空值
          defaultValue: 1, // 修改默认值
          comment: "⚡ 更新后的状态字段 - 默认激活",
        },
        {
          name: "description", // 新增列
          type: "text",
          allowNull: true,
          comment: "🆕 新增的描述字段",
        },
      ],
      indexes: [
        {
          name: "idx_name_status", // 修改索引
          fields: ["name", "status"],
          unique: false,
        },
      ],
    };

    const updateResponse = await axios.post(
      `${baseURL}/schemas/create`,
      updatedSchema
    );
    console.log("✅ 更新表结构:", updateResponse.data);

    // 4. 执行升级迁移
    console.log("\n🚀 步骤4: 执行升级迁移");
    const upgradeMigration = await axios.post(`${baseURL}/execute`, {
      table_name: "test_column_update",
      database_type: "mysql",
    });
    console.log("✅ 升级迁移完成:", upgradeMigration.data);

    console.log("\n🎉 列属性更新测试完成!");
    console.log("✨ 请检查日志输出，确认comment和其他列属性已正确更新");
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
    if (error.response) {
      console.error("错误详情:", error.response.data);
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testColumnUpdate()
    .then(() => {
      console.log("\n✅ 测试脚本执行完成");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ 测试脚本执行失败:", error);
      process.exit(1);
    });
}

module.exports = { testColumnUpdate };
