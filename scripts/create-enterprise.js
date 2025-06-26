const axios = require("axios");

// API基础URL
const BASE_URL = "http://localhost:3000/api";

// 测试企业数据
const testEnterprises = [
  {
    enterprise_key: "test_enterprise_001",
    enterprise_code: 100001,
    enterprise_name: "测试企业001",
    enterprise_logo: null,
    database_name: "test_enterprise_001",
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
    user_id: "admin_001",
    status: 1,
  },
  {
    enterprise_key: "test_enterprise_002",
    enterprise_code: 100002,
    enterprise_name: "测试企业002",
    enterprise_logo: null,
    database_name: "test_enterprise_002",
    database_hostname: "localhost",
    database_username: "root",
    database_password: "123456",
    database_hostport: "3306",
    log_database_name: "test_enterprise_002_log",
    log_database_hostname: "localhost",
    log_database_username: "root",
    log_database_password: "123456",
    log_database_hostport: "3306",
    order_database_name: "test_enterprise_002_order",
    order_database_hostname: "localhost",
    order_database_username: "root",
    order_database_password: "123456",
    order_database_hostport: "3306",
    static_database_name: "test_enterprise_002_static",
    static_database_hostname: "localhost",
    static_database_username: "root",
    static_database_password: "123456",
    static_database_hostport: "3306",
    user_id: "admin_002",
    status: 1,
  },
  {
    enterprise_key: "chain_store_001",
    enterprise_code: 200001,
    enterprise_name: "连锁门店企业",
    enterprise_logo: null,
    database_name: "chain_store_001",
    database_hostname: "localhost",
    database_username: "root",
    database_password: "123456",
    database_hostport: "3306",
    log_database_name: "chain_store_001_log",
    log_database_hostname: "localhost",
    log_database_username: "root",
    log_database_password: "123456",
    log_database_hostport: "3306",
    order_database_name: "chain_store_001_order",
    order_database_hostname: "localhost",
    order_database_username: "root",
    order_database_password: "123456",
    order_database_hostport: "3306",
    static_database_name: "chain_store_001_static",
    static_database_hostname: "localhost",
    static_database_username: "root",
    static_database_password: "123456",
    static_database_hostport: "3306",
    user_id: "chain_admin",
    status: 1,
  },
];

/**
 * 创建企业记录
 */
async function createEnterprise(enterpriseData) {
  try {
    console.log(`正在创建企业: ${enterpriseData.enterprise_name}`);

    const response = await axios.post(
      `${BASE_URL}/enterprises`,
      enterpriseData,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ 企业创建成功: ${enterpriseData.enterprise_name}`);
    console.log(`   企业ID: ${response.data.enterprise_id}`);
    console.log(`   数据库: ${response.data.database_name}`);
    console.log("---");

    return response.data;
  } catch (error) {
    if (error.response) {
      console.error(`❌ 创建企业失败: ${enterpriseData.enterprise_name}`);
      console.error(
        `   错误: ${error.response.data.message || error.response.statusText}`
      );
    } else {
      console.error(`❌ 网络错误: ${error.message}`);
    }
    console.log("---");
    return null;
  }
}

/**
 * 获取所有企业列表
 */
async function getEnterprises() {
  try {
    const response = await axios.get(`${BASE_URL}/enterprises`);
    console.log("📋 当前企业列表:");
    response.data.forEach((enterprise) => {
      console.log(
        `   - ${enterprise.enterprise_name} (ID: ${enterprise.enterprise_id}, 数据库: ${enterprise.database_name})`
      );
    });
    console.log("---");
    return response.data;
  } catch (error) {
    console.error("❌ 获取企业列表失败:", error.message);
    return [];
  }
}

/**
 * 主函数
 */
async function main() {
  console.log("🚀 开始创建测试企业记录...\n");

  // 首先检查API是否可用
  try {
    await axios.get(`${BASE_URL}/health`);
    console.log("✅ API服务正常\n");
  } catch (error) {
    console.error("❌ API服务不可用，请确保服务已启动");
    console.error("   启动命令: npm run dev");
    return;
  }

  // 获取现有企业列表
  console.log("📋 获取现有企业列表...");
  await getEnterprises();

  // 创建企业记录
  console.log("🔧 开始创建企业记录...\n");
  const results = [];

  for (const enterpriseData of testEnterprises) {
    const result = await createEnterprise(enterpriseData);
    results.push(result);

    // 添加延迟避免请求过快
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // 显示创建结果
  console.log("📊 创建结果统计:");
  const successCount = results.filter((r) => r !== null).length;
  const failCount = results.filter((r) => r === null).length;
  console.log(`   成功: ${successCount} 个`);
  console.log(`   失败: ${failCount} 个`);

  // 再次获取企业列表
  console.log("\n📋 创建后的企业列表:");
  await getEnterprises();

  console.log("\n✨ 企业记录创建完成！");
  console.log("💡 现在可以运行测试脚本: node test-api.js");
}

// 运行主函数
main().catch((error) => {
  console.error("❌ 脚本执行失败:", error.message);
  process.exit(1);
});
