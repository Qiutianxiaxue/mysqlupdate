const axios = require("axios");

const BASE_URL = "http://localhost:3000/api/migration";

async function testMigrationLock() {
  console.log("🔒 测试迁移锁机制");
  console.log("=".repeat(50));

  try {
    // 1. 查看当前活跃的锁
    console.log("\n1. 查看当前活跃的锁");
    const locksResponse = await axios.post(`${BASE_URL}/locks/list`);
    console.log("活跃锁数量:", locksResponse.data.count);
    if (locksResponse.data.count > 0) {
      console.log(
        "活跃锁详情:",
        JSON.stringify(locksResponse.data.data, null, 2)
      );
    }

    // 2. 启动一个单表迁移，但不等待完成
    console.log("\n2. 启动单表迁移（不等待完成）");
    const migrationPromise = axios.post(`${BASE_URL}/execute`, {
      table_name: "cn_goods",
      database_type: "main",
      partition_type: "none",
    });

    // 等待一小段时间让迁移开始
    setTimeout(async () => {
      try {
        // 3. 尝试启动相同表的迁移（应该失败）
        console.log("\n3. 尝试启动相同表的迁移（应该失败）");
        const conflictResponse = await axios.post(`${BASE_URL}/execute`, {
          table_name: "cn_goods",
          database_type: "main",
          partition_type: "none",
        });
        console.log("❌ 意外成功:", conflictResponse.data);
      } catch (error) {
        if (error.response?.status === 409) {
          console.log("✅ 正确阻止了冲突的迁移");
          console.log("冲突信息:", error.response.data.message);
          if (error.response.data.conflict_info) {
            console.log("冲突锁信息:", error.response.data.conflict_info);
          }
        } else {
          console.log("❌ 意外错误:", error.response?.data || error.message);
        }
      }

      // 4. 尝试启动全量迁移（应该失败）
      console.log("\n4. 尝试启动全量迁移（应该失败）");
      try {
        const allMigrationResponse = await axios.post(
          `${BASE_URL}/execute-all`
        );
        console.log("❌ 意外成功:", allMigrationResponse.data);
      } catch (error) {
        if (error.response?.status === 409) {
          console.log("✅ 正确阻止了全量迁移");
          console.log("冲突信息:", error.response.data.message);
        } else {
          console.log("❌ 意外错误:", error.response?.data || error.message);
        }
      }

      // 5. 查看当前活跃的锁
      console.log("\n5. 查看当前活跃的锁");
      const activeLocks = await axios.post(`${BASE_URL}/locks/list`);
      console.log("活跃锁数量:", activeLocks.data.count);
      if (activeLocks.data.count > 0) {
        console.log("活跃锁详情:");
        activeLocks.data.data.forEach((lock, index) => {
          console.log(`  ${index + 1}. 锁键: ${lock.lock_key}`);
          console.log(`     类型: ${lock.lock_type}`);
          console.log(`     表名: ${lock.table_name || "N/A"}`);
          console.log(`     数据库类型: ${lock.database_type || "N/A"}`);
          console.log(`     分区类型: ${lock.partition_type || "N/A"}`);
          console.log(`     开始时间: ${lock.start_time}`);
          console.log(`     持有者: ${lock.lock_holder}`);
          console.log(`     操作信息: ${lock.operation_info || "N/A"}`);
          console.log("");
        });
      }
    }, 2000);

    // 等待第一个迁移完成
    try {
      const migrationResult = await migrationPromise;
      console.log("\n✅ 第一个迁移完成:", migrationResult.data.message);
    } catch (error) {
      console.log(
        "\n❌ 第一个迁移失败:",
        error.response?.data?.message || error.message
      );
    }

    // 6. 等待一段时间后检查锁是否已释放
    setTimeout(async () => {
      console.log("\n6. 检查锁是否已释放");
      const finalLocks = await axios.post(`${BASE_URL}/locks/list`);
      console.log("活跃锁数量:", finalLocks.data.count);
      if (finalLocks.data.count === 0) {
        console.log("✅ 所有锁已正确释放");
      } else {
        console.log("⚠️  仍有活跃锁:", finalLocks.data.data);
      }

      // 7. 测试锁清理功能
      console.log("\n7. 测试锁清理功能");
      const cleanupResult = await axios.post(`${BASE_URL}/locks/cleanup`, {
        hours_old: 0, // 清理所有锁
      });
      console.log("清理结果:", cleanupResult.data.message);
      console.log("清理数量:", cleanupResult.data.cleaned_count);
    }, 3000);
  } catch (error) {
    console.error("测试失败:", error.response?.data || error.message);
  }
}

// 运行测试
async function runTests() {
  console.log("🚀 开始测试迁移锁机制");
  console.log("测试时间:", new Date().toLocaleString());

  await testMigrationLock();
}

runTests().catch(console.error);
