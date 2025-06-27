const axios = require("axios");

const BASE_URL = "http://localhost:3000";

async function testEndpoints() {
  console.log("🧪 测试API端点可访问性...\n");

  // 测试基础健康检查
  console.log("1. 测试健康检查端点...");
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log("✅ /health 端点正常:", response.data.status);
  } catch (error) {
    console.log("❌ /health 端点失败:", error.message);
    console.log("⚠️  服务器可能未启动，请先运行: npm run dev");
    return;
  }

  // 测试根路径
  console.log("\n2. 测试根路径...");
  try {
    const response = await axios.get(BASE_URL);
    console.log("✅ / 端点正常");
    console.log("可用端点:", JSON.stringify(response.data.endpoints, null, 2));
  } catch (error) {
    console.log("❌ / 端点失败:", error.response?.data || error.message);
  }

  // 测试schema-detection路由
  console.log("\n3. 测试schema-detection端点...");

  // 测试 POST /api/schema-detection/tables
  try {
    const response = await axios.post(
      `${BASE_URL}/api/schema-detection/tables`
    );
    console.log("✅ POST /api/schema-detection/tables 正常");
    console.log("响应:", {
      success: response.data.success,
      message: response.data.message,
      summary: response.data.summary,
    });

    if (response.data.data && response.data.data.length > 0) {
      console.log("第一个表的详细信息:", {
        table_name: response.data.data[0].table_name,
        engine: response.data.data[0].engine,
        charset: response.data.data[0].charset,
        collation: response.data.data[0].collation,
        table_rows: response.data.data[0].table_rows,
        total_size: response.data.data[0].total_size,
      });
    }
  } catch (error) {
    console.log("❌ POST /api/schema-detection/tables 失败:");
    if (error.response) {
      console.log("  状态码:", error.response.status);
      console.log("  错误信息:", error.response.data);
    } else {
      console.log("  网络错误:", error.message);
    }
  }

  // 测试一个不存在的端点
  console.log("\n4. 测试不存在的端点...");
  try {
    const response = await axios.get(
      `${BASE_URL}/api/schema-detection/nonexistent`
    );
    console.log("❌ 不存在的端点返回了响应:", response.data);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log("✅ 404错误处理正常:", error.response.data.message);
    } else {
      console.log("❌ 不期望的错误:", error.message);
    }
  }

  console.log("\n🎉 测试完成！");
}

// 运行测试
testEndpoints().catch((error) => {
  console.error("测试运行失败:", error);
});
