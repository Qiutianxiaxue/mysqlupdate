const axios = require("axios");

// API基础URL
const BASE_URL = "http://localhost:3000/api/migration";

/**
 * 测试API连接
 */
async function testAPI() {
  try {
    console.log("🔍 测试API连接...");

    // 测试健康检查
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log("✅ 健康检查通过:", healthResponse.data);

    // 测试获取企业列表
    const enterprisesResponse = await axios.get(`${BASE_URL}/enterprises`);
    console.log("✅ 获取企业列表成功:", enterprisesResponse.data);

    // 测试获取连接统计
    const statsResponse = await axios.get(`${BASE_URL}/connections/stats`);
    console.log("✅ 获取连接统计成功:", statsResponse.data);

    console.log("\n🎉 所有测试通过！修复成功！");
  } catch (error) {
    if (error.response) {
      console.error("❌ API错误:", error.response.status, error.response.data);
    } else {
      console.error("❌ 网络错误:", error.message);
    }
  }
}

// 运行测试
testAPI();
