const axios = require("axios");

const BASE_URL = "http://localhost:3000";

async function testMigrateAll() {
  console.log("🧪 测试一键迁移所有表功能...\n");

  try {
    // 1. 首先检测有哪些表需要迁移
    console.log("1. 检测需要迁移的表...");
    const detectResponse = await axios.post(
      `${BASE_URL}/api/schema-detection/all`
    );

    if (detectResponse.data.success) {
      console.log("✅ 检测完成");
      console.log(
        `发现 ${detectResponse.data.summary.changes_detected} 个表需要更新`
      );

      if (detectResponse.data.data && detectResponse.data.data.length > 0) {
        console.log("\n需要迁移的表:");
        detectResponse.data.data.forEach((change, index) => {
          console.log(
            `  ${index + 1}. ${change.table_name} (${change.database_type})`
          );
          console.log(`     分区类型: ${change.partition_type}`);
          console.log(
            `     版本: ${change.current_version || "新表"} -> ${
              change.new_version
            }`
          );
        });
      }
    } else {
      console.log("❌ 检测失败:", detectResponse.data.message);
      return;
    }

    // 2. 执行一键迁移
    console.log("\n2. 执行一键迁移...");
    const migrateResponse = await axios.post(
      `${BASE_URL}/api/migration/execute-all`
    );

    if (migrateResponse.data.success) {
      console.log("✅ 迁移完成!");
      console.log("消息:", migrateResponse.data.message);

      console.log("\n📊 迁移统计:");
      console.log(
        "总计检查表数:",
        migrateResponse.data.data.total_tables_checked
      );
      console.log("成功迁移表数:", migrateResponse.data.data.tables_migrated);
      console.log("迁移成功:", migrateResponse.data.summary.migration_success);
      console.log("迁移失败:", migrateResponse.data.summary.migration_failure);

      // 显示每个表的迁移结果
      if (
        migrateResponse.data.data.migration_results &&
        migrateResponse.data.data.migration_results.length > 0
      ) {
        console.log("\n📋 详细迁移结果:");
        migrateResponse.data.data.migration_results.forEach((result, index) => {
          const status = result.success ? "✅" : "❌";
          console.log(
            `  ${index + 1}. ${status} ${result.table_name} (${
              result.database_type
            }, ${result.partition_type})`
          );
          console.log(`     版本: ${result.schema_version}`);
          console.log(`     消息: ${result.message}`);
          if (result.error) {
            console.log(`     错误: ${result.error}`);
          }
        });
      }

      // 显示新表和删除表信息
      if (
        migrateResponse.data.data.new_tables &&
        migrateResponse.data.data.new_tables.length > 0
      ) {
        console.log("\n🆕 新发现的表:");
        migrateResponse.data.data.new_tables.forEach((table) => {
          console.log(`  - ${table}`);
        });
      }

      if (
        migrateResponse.data.data.deleted_tables &&
        migrateResponse.data.data.deleted_tables.length > 0
      ) {
        console.log("\n🗑️ 已删除的表:");
        migrateResponse.data.data.deleted_tables.forEach((table) => {
          console.log(`  - ${table}`);
        });
      }
    } else {
      console.log("❌ 迁移失败:", migrateResponse.data.message);
      if (migrateResponse.data.error) {
        console.log("错误详情:", migrateResponse.data.error);
      }
    }

    // 3. 再次检测确认结果
    console.log("\n3. 再次检测确认迁移结果...");
    const finalDetectResponse = await axios.post(
      `${BASE_URL}/api/schema-detection/all`
    );

    if (finalDetectResponse.data.success) {
      const remainingChanges =
        finalDetectResponse.data.summary.changes_detected;
      if (remainingChanges === 0) {
        console.log("✅ 所有表都已是最新状态！");
      } else {
        console.log(`⚠️ 还有 ${remainingChanges} 个表需要处理`);
      }
    }
  } catch (error) {
    console.log("❌ 测试过程中出现错误:");
    if (error.response) {
      console.log("  状态码:", error.response.status);
      console.log("  错误信息:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.log("  网络错误:", error.message);
    }
  }

  console.log("\n🎉 测试完成！");
}

testMigrateAll().catch(console.error);
