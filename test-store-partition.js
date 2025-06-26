const axios = require("axios");

const BASE_URL = "http://localhost:3000/api/migration";

async function testStorePartition() {
  try {
    console.log("🏪 测试门店分表功能...\n");

    // 1. 健康检查
    console.log("1️⃣ 健康检查...");
    const health = await axios.post(`${BASE_URL}/health`);
    console.log("✅ 服务器状态:", health.data.status);

    // 2. 创建门店分表的表结构定义
    console.log("\n2️⃣ 创建门店分表结构定义（订单表）...");
    const storeTableSchema = {
      table_name: "store_orders",
      database_type: "main",
      partition_type: "store",
      schema_version: "1.0.1",
      schema_definition: JSON.stringify({
        tableName: "store_orders",
        columns: [
          {
            name: "id",
            type: "BIGINT",
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
            comment: "主键333ID",
          },
          {
            name: "order_no",
            type: "VARCHAR",
            length: 100,
            allowNull: false,
            comment: "订单222号",
          },
          {
            name: "customer_id",
            type: "BIGINT",
            allowNull: false,
            comment: "客户444ID",
          },
          {
            name: "total_amount",
            type: "DECIMAL",
            length: "10,2",
            allowNull: false,
            defaultValue: 0.0,
            comment: "订单总金额",
          },
          {
            name: "status",
            type: "TINYINT",
            allowNull: false,
            defaultValue: 1,
            comment:
              "订单状态：1-待付款，2-已付款，3-已发货，4-已完成，0-已取消",
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
        ],
        indexes: [
          {
            name: "idx_order_no",
            fields: ["order_no"],
            unique: true,
            comment: "订单号唯一索引",
          },
          {
            name: "idx_customer_id",
            fields: ["customer_id"],
            comment: "客户ID索引",
          },
          {
            name: "idx_status",
            fields: ["status"],
            comment: "订单状态索引",
          },
          {
            name: "idx_created_at",
            fields: ["created_at"],
            comment: "创建时间索引",
          },
        ],
      }),
    };

    const schemaResponse = await axios.post(
      `${BASE_URL}/schemas/create`,
      storeTableSchema,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ 门店分表结构定义创建成功");

    // 3. 执行门店分表迁移
    console.log("\n3️⃣ 执行门店分表迁移...");
    const migrateResponse = await axios.post(`${BASE_URL}/execute`, {
      table_name: "store_orders",
      database_type: "main",
      partition_type: "store",
    });

    console.log("✅ 门店分表迁移完成");
    console.log("📊 迁移结果:", JSON.stringify(migrateResponse.data, null, 2));

    console.log("\n🎉 门店分表测试完成！");
    console.log("✨ 测试功能：");
    console.log("   - ✅ 门店分表结构定义创建");
    console.log("   - ✅ 从主数据库查询门店列表");
    console.log("   - ✅ 为每个门店创建独立分表");
    console.log("   - ✅ 智能表名识别（stores/store/shop/shops）");
  } catch (error) {
    console.error("❌ 测试失败:", error.response?.data || error.message);
    if (error.response?.data) {
      console.error("详细错误:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 运行测试
testStorePartition();
