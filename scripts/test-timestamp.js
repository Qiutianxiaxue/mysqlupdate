const axios = require("axios");

// API基础URL
const BASE_URL = "http://localhost:3000/api/migration";

/**
 * 测试TIMESTAMP字段处理
 */
async function testTimestamp() {
  try {
    console.log("🔍 测试TIMESTAMP字段处理...\n");

    // 创建包含TIMESTAMP字段的表结构定义
    console.log("1️⃣ 创建包含TIMESTAMP字段的表结构定义...");
    const schemaData = {
      table_name: "timestamp_test",
      database_type: "main",
      partition_type: "none",
      schema_version: "1.0.0",
      schema_definition: JSON.stringify({
        tableName: "timestamp_test",
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
            name: "created_at",
            type: "TIMESTAMP",
            allowNull: false,
            defaultValue: "CURRENT_TIMESTAMP",
            comment: "创建时间",
          },
          {
            name: "updated_at",
            type: "TIMESTAMP",
            allowNull: false,
            defaultValue: "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
            comment: "更新时间",
          },
          {
            name: "status",
            type: "TINYINT",
            allowNull: false,
            defaultValue: 1,
            comment: "状态",
          },
        ],
        indexes: [
          {
            name: "idx_created_at",
            fields: ["created_at"],
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

    // 执行迁移
    console.log("\n2️⃣ 执行数据库迁移...");
    const migrationData = {
      schema_id: schemaResponse.data.data.id,
    };

    const migrationResponse = await axios.post(
      `${BASE_URL}/execute`,
      migrationData
    );
    console.log("✅ 迁移执行成功:", migrationResponse.data);

    console.log("\n🎉 TIMESTAMP字段测试完成！");
  } catch (error) {
    if (error.response) {
      console.error("❌ API错误:", error.response.status, error.response.data);
    } else {
      console.error("❌ 网络错误:", error.message);
    }
  }
}

// 运行测试
testTimestamp();
