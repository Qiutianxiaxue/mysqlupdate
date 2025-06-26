const axios = require("axios");

const BASE_URL = "http://localhost:3000/api/migration";

async function createTestEnterprise() {
  try {
    console.log("🚀 创建测试企业...\n");

    // 1. 创建企业
    console.log("1️⃣ 创建测试企业...");
    const enterprise = {
      enterprise_key: "test_enterprise_001",
      enterprise_code: 100001,
      enterprise_name: "测试企业001",
      database_name: "test_enterprise_001_main",
      database_hostname: "localhost",
      database_username: "root",
      database_password: "123456",
      database_hostport: "3306",
      log_database_name: "test_enterprise_001_log",
      log_database_hostname: "localhost",
      log_database_username: "root",
      log_database_password: "123456",
      log_database_hostport: "3306",
      order_database_name: "test_enterprise_001_order",
      order_database_hostname: "localhost",
      order_database_username: "root",
      order_database_password: "123456",
      order_database_hostport: "3306",
      static_database_name: "test_enterprise_001_static",
      static_database_hostname: "localhost",
      static_database_username: "root",
      static_database_password: "123456",
      static_database_hostport: "3306",
      status: 1,
    };

    const response = await axios.post(`${BASE_URL}/enterprises`, enterprise);
    console.log("✅ 企业创建成功:", response.data.data.enterprise_name);

    // 2. 查看所有企业
    console.log("\n2️⃣ 查看所有企业...");
    const allEnterprises = await axios.get(`${BASE_URL}/enterprises`);
    console.log(`✅ 总计 ${allEnterprises.data.data.length} 个企业:`);
    allEnterprises.data.data.forEach((ent, index) => {
      console.log(
        `   ${index + 1}. ${ent.enterprise_name} (ID: ${ent.enterprise_id})`
      );
    });

    console.log("\n🎉 测试企业创建完成！");
  } catch (error) {
    console.error("❌ 创建失败:", error.response?.data || error.message);
    if (error.response?.data) {
      console.error("详细错误:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

createTestEnterprise();
