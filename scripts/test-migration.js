const axios = require("axios");

// API基础URL
const BASE_URL = "http://localhost:3000/api/migration";

/**
 * 测试数据库迁移功能
 */
async function testMigration() {
  try {
    console.log("🔍 测试数据库迁移功能...\n");

    // 1. 创建表结构定义
    console.log("1️⃣ 创建表结构定义...");
    const schemaData = {
      table_name: "test_table",
      database_type: "main",
      partition_type: "none",
      schema_version: "1.0.0",
      schema_definition: JSON.stringify({
        tableName: "test_table",
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
            name: "status",
            type: "TINYINT",
            allowNull: false,
            defaultValue: 1,
            comment: "状态",
          },
          {
            name: "created_at",
            type: "TIMESTAMP",
            allowNull: false,
            defaultValue: "CURRENT_TIMESTAMP",
            comment: "创建时间",
          },
        ],
        indexes: [
          {
            name: "idx_name",
            fields: ["name"],
          },
          {
            name: "idx_status",
            fields: ["status"],
          },
        ],
      }),
    };

    const schemaResponse = await axios.post(`${BASE_URL}/schemas`, schemaData);
    console.log("✅ 表结构定义创建成功:", schemaResponse.data.data.id);

    // 2. 执行迁移
    console.log("\n2️⃣ 执行数据库迁移...");
    const migrationData = {
      schema_id: schemaResponse.data.data.id,
    };

    const migrationResponse = await axios.post(
      `${BASE_URL}/execute`,
      migrationData
    );
    console.log("✅ 迁移执行成功:", migrationResponse.data);

    // 3. 获取企业列表
    console.log("\n3️⃣ 获取企业列表...");
    const enterprisesResponse = await axios.get(`${BASE_URL}/enterprises`);
    console.log(
      "✅ 企业列表获取成功，共",
      enterprisesResponse.data.data.length,
      "个企业"
    );

    // 4. 获取连接统计
    console.log("\n4️⃣ 获取连接统计...");
    const statsResponse = await axios.get(`${BASE_URL}/connections/stats`);
    console.log("✅ 连接统计获取成功:", statsResponse.data);

    console.log("\n🎉 数据库迁移功能测试完成！");
  } catch (error) {
    if (error.response) {
      console.error("❌ API错误:", error.response.status, error.response.data);
    } else {
      console.error("❌ 网络错误:", error.message);
    }
  }
}

// 运行测试
testMigration();
