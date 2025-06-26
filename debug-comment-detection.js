const axios = require("axios");

async function debugCommentDetection() {
  const baseURL = "http://localhost:3000/api/migration";

  console.log("🔍 开始调试comment检测问题...\n");

  try {
    // 1. 先创建一个简单的表
    console.log("📝 创建简单测试表");
    const schema = {
      table_name: "debug_comment_test",
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
          comment: "测试ID字段",
        },
        {
          name: "test_field",
          type: "varchar",
          length: 100,
          allowNull: false,
          comment: "这是一个测试字段",
        },
      ],
    };

    await axios.post(`${baseURL}/schemas/create`, schema);
    console.log("✅ 创建表结构定义完成");

    // 2. 执行迁移创建表
    await axios.post(`${baseURL}/execute`, {
      table_name: "debug_comment_test",
      database_type: "mysql",
    });
    console.log("✅ 初始表创建完成");

    // 等待2秒
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 3. 修改comment并重新执行迁移
    console.log("\n🔄 修改comment并重新迁移");
    const updatedSchema = {
      table_name: "debug_comment_test",
      partition_type: "none",
      database_type: "mysql",
      version: "1.1",
      columns: [
        {
          name: "id",
          type: "int",
          length: 11,
          allowNull: false,
          primaryKey: true,
          autoIncrement: true,
          comment: "测试ID字段", // 保持不变
        },
        {
          name: "test_field",
          type: "varchar",
          length: 100,
          allowNull: false,
          comment: "🔥 这是修改后的测试字段comment", // 修改comment
        },
      ],
    };

    await axios.post(`${baseURL}/schemas/create`, updatedSchema);
    console.log("✅ 更新表结构定义完成");

    // 4. 执行升级迁移并观察日志
    console.log("\n🚀 执行升级迁移（注意观察comment检测日志）");
    await axios.post(`${baseURL}/execute`, {
      table_name: "debug_comment_test",
      database_type: "mysql",
    });
    console.log("✅ 升级迁移完成");

    console.log("\n📋 请检查日志输出中的comment检测详情");
  } catch (error) {
    console.error("❌ 调试失败:", error.message);
    if (error.response) {
      console.error("错误详情:", error.response.data);
    }
  }
}

// 运行调试
debugCommentDetection()
  .then(() => {
    console.log("✅ 调试完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ 调试失败:", error);
    process.exit(1);
  });
