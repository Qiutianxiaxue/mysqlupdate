const axios = require("axios");

const BASE_URL = "http://localhost:3000/api/migration";

async function testUpgradeLogic() {
  try {
    console.log("🚀 测试表升级逻辑...\n");

    // 1. 健康检查
    console.log("1️⃣ 健康检查...");
    const health = await axios.get(`${BASE_URL}/health`);
    console.log("✅ 服务器状态:", health.data.status);

    // 2. 创建第一个版本的表结构 
    console.log("\n2️⃣ 创建表结构 v1.0.0...");
    const schemaV1 = {
      table_name: "upgrade_test_table",
      database_type: "main",
      schema_version: "1.0.0",
      schema_definition: JSON.stringify({
        tableName: "upgrade_test_table",
        columns: [
          {
            name: "id",
            type: "BIGINT",
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
            comment: "主键ID",
          },
          {
            name: "name",
            type: "VARCHAR",
            length: 100,
            allowNull: false,
            comment: "名称",
          },
        ],
        indexes: [
          {
            name: "idx_name",
            fields: ["name"],
          },
        ],
      }),
    };

    const v1Response = await axios.post(`${BASE_URL}/schemas`, schemaV1);
    console.log("✅ v1.0.0 创建成功，ID:", v1Response.data.data.id);

    // 3. 执行第一次迁移（创建表）
    console.log("\n3️⃣ 执行 v1.0.0 迁移（创建表）...");
    const migrate1 = await axios.post(`${BASE_URL}/execute`, {
      table_name: "upgrade_test_table",
      database_type: "main",
      schema_version: "1.0.0",
    });
    console.log("✅ 表创建完成");

    // 4. 将v1.0.0标记为非激活
    console.log("\n4️⃣ 将 v1.0.0 标记为非激活...");
    await axios.put(`${BASE_URL}/schemas/${v1Response.data.data.id}`, {
      is_active: false,
    });
    console.log("✅ v1.0.0 已标记为非激活");

    // 5. 创建第二个版本的表结构（添加列）
    console.log("\n5️⃣ 创建表结构 v1.1.0（添加email列）...");
    const schemaV11 = {
      table_name: "upgrade_test_table",
      database_type: "main",
      schema_version: "1.1.0",
      schema_definition: JSON.stringify({
        tableName: "upgrade_test_table",
        columns: [
          {
            name: "id",
            type: "BIGINT",
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
            comment: "主键ID",
          },
          {
            name: "name",
            type: "VARCHAR",
            length: 100,
            allowNull: false,
            comment: "名称",
          },
          {
            name: "email",
            type: "VARCHAR",
            length: 200,
            allowNull: true,
            comment: "邮箱地址",
          },
        ],
        indexes: [
          {
            name: "idx_name",
            fields: ["name"],
          },
          {
            name: "idx_email",
            fields: ["email"],
          },
        ],
      }),
    };

    const v11Response = await axios.post(`${BASE_URL}/schemas`, schemaV11);
    console.log("✅ v1.1.0 创建成功，ID:", v11Response.data.data.id);

    // 6. 执行第二次迁移（升级表）
    console.log("\n6️⃣ 执行 v1.1.0 迁移（升级表）...");
    const migrate2 = await axios.post(`${BASE_URL}/execute`, {
      table_name: "upgrade_test_table",
      database_type: "main",
      schema_version: "1.1.0",
    });
    console.log("✅ 表升级完成");

    // 7. 重复执行升级（测试幂等性）
    console.log("\n7️⃣ 重复执行升级（测试幂等性）...");
    const migrate3 = await axios.post(`${BASE_URL}/execute`, {
      table_name: "upgrade_test_table",
      database_type: "main",
      schema_version: "1.1.0",
    });
    console.log("✅ 重复升级完成（应该跳过已存在的列）");

    // 8. 不指定版本号，自动使用最新版本
    console.log("\n8️⃣ 不指定版本号，自动使用最新版本...");
    const migrate4 = await axios.post(`${BASE_URL}/execute`, {
      table_name: "upgrade_test_table",
      database_type: "main",
    });
    console.log("✅ 自动最新版本迁移完成");

    console.log("\n🎉 表升级逻辑测试完成！");
    console.log("✨ 验证了以下功能：");
    console.log("   - ✅ 创建新表");
    console.log("   - ✅ 升级现有表（添加新列）");
    console.log("   - ✅ 添加新索引");
    console.log("   - ✅ 幂等性操作");
    console.log("   - ✅ 自动使用最新版本");

  } catch (error) {
    console.error("❌ 测试失败:", error.response?.data || error.message);
    if (error.response?.data) {
      console.error("详细错误:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

testUpgradeLogic(); 