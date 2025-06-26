const axios = require("axios");

// 测试不同的API路径
const testPaths = [
  "http://localhost:3000/health",
  "http://localhost:3000/api/migration/schemas",
  "http://localhost:3000/api/migration/enterprises",
  "http://localhost:3000/api/migration/connections/stats",
];

async function testApiPaths() {
  console.log("🔍 测试API路径...\n");

  for (const path of testPaths) {
    try {
      console.log(`测试路径: ${path}`);
      const response = await axios.get(path);
      console.log(
        `✅ 成功 (${response.status}): ${response.data.message || "OK"}`
      );
    } catch (error) {
      if (error.response) {
        console.log(
          `❌ 失败 (${error.response.status}): ${
            error.response.data.message || "Unknown error"
          }`
        );
      } else {
        console.log(`❌ 网络错误: ${error.message}`);
      }
    }
    console.log("---");
  }
}

// 运行测试
testApiPaths();
