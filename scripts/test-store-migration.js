const axios = require("axios");

const API_BASE_URL = "http://localhost:3000/api/migration";

/**
 * 测试门店分表迁移功能
 */
async function testStoreMigration() {
  console.log("🧪 开始测试门店分表迁移功能...\n");

  try {
    // 1. 测试必需参数验证
    console.log("1. 测试参数验证...");
    try {
      const response = await axios.post(`${API_BASE_URL}/execute-store`, {});
      console.log("❌ 应该返回错误，但没有");
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log("✅ 参数验证正常:", error.response.data.message);
      } else {
        console.log("❌ 参数验证异常:", error.message);
      }
    }

    // 2. 测试门店分表迁移（缺少企业ID）
    console.log("\n2. 测试门店分表迁移（缺少企业ID）...");
    try {
      const response = await axios.post(`${API_BASE_URL}/execute-store`, {
        store_id: "1001",
      });
      console.log("❌ 应该返回错误，但没有");
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log("✅ 企业ID必需验证正常:", error.response.data.message);
      } else {
        console.log(
          "❌ 企业ID必需验证异常:",
          error.response?.data || error.message
        );
      }
    }

    // 3. 测试指定企业的门店分表迁移
    console.log("\n3. 测试指定企业的门店分表迁移...");
    try {
      const response = await axios.post(`${API_BASE_URL}/execute-store`, {
        store_id: "1002",
        enterprise_id: 1,
      });

      console.log("✅ 指定企业门店分表迁移响应:", {
        success: response.data.success,
        message: response.data.message,
        store_id: response.data.data?.store_id,
        enterprise_id: response.data.data?.enterprise_id,
        enterprise_name: response.data.data?.enterprise_name,
        total_schemas: response.data.data?.total_schemas,
        tables_migrated: response.data.data?.tables_migrated,
      });
    } catch (error) {
      console.log(
        "❌ 指定企业门店分表迁移失败:",
        error.response?.data || error.message
      );
    }

    // 4. 测试不存在的企业ID
    console.log("\n4. 测试不存在的企业ID...");
    try {
      const response = await axios.post(`${API_BASE_URL}/execute-store`, {
        store_id: "1003",
        enterprise_id: 99999,
      });
      console.log("❌ 应该返回错误，但没有");
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log("✅ 企业ID验证正常:", error.response.data.message);
      } else {
        console.log(
          "❌ 企业ID验证异常:",
          error.response?.data || error.message
        );
      }
    }

    // 5. 查看活跃的迁移锁
    console.log("\n5. 查看活跃的迁移锁...");
    try {
      const response = await axios.post(`${API_BASE_URL}/locks/list`);
      console.log("🔒 活跃锁列表:", response.data.data?.length || 0, "个");

      if (response.data.data?.length > 0) {
        response.data.data.forEach((lock, index) => {
          console.log(`  ${index + 1}. ${lock.lock_key}`);
          console.log(`     类型: ${lock.lock_type}`);
          console.log(`     表名: ${lock.table_name || "N/A"}`);
          console.log(`     分区类型: ${lock.partition_type || "N/A"}`);
          console.log(`     开始时间: ${lock.start_time}`);
          console.log(`     持有者: ${lock.lock_holder}`);
          console.log("");
        });
      }
    } catch (error) {
      console.log("❌ 查看锁列表失败:", error.response?.data || error.message);
    }
  } catch (error) {
    console.error("❌ 测试过程中发生错误:", error.message);
  }

  console.log("\n🏁 门店分表迁移功能测试完成！");
}

// 运行测试
testStoreMigration().catch(console.error);
