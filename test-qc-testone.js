const axios = require("axios");

const BASE_URL = "http://localhost:3000/api/schema-detection";

async function testQcTestOne() {
  try {
    console.log("🧪 开始测试 qc_testone 表的结构检测...\n");

    // 1. 获取表的详细信息
    console.log("1. 获取表 qc_testone 的详细信息...");
    try {
      const response = await axios.post(`${BASE_URL}/table/info`, {
        tableName: "qc_testone",
      });
      if (response.data.success) {
        const info = response.data.data;
        console.log("✅ 表结构信息:");
        console.log(`  表名: ${info.table_name}`);
        console.log(`  列数: ${info.columns.length}`);
        console.log(`  索引数: ${info.indexes.length}`);

        console.log("\n  列详情:");
        info.columns.forEach((col) => {
          const type = col.CHARACTER_MAXIMUM_LENGTH
            ? `${col.DATA_TYPE}(${col.CHARACTER_MAXIMUM_LENGTH})`
            : col.DATA_TYPE;
          const nullable = col.IS_NULLABLE === "YES" ? "可空" : "不可空";
          const key =
            col.COLUMN_KEY === "PRI"
              ? "[主键]"
              : col.COLUMN_KEY === "UNI"
              ? "[唯一]"
              : "";
          console.log(`    ${col.COLUMN_NAME}: ${type} ${nullable} ${key}`);
          if (col.COLUMN_COMMENT) {
            console.log(`      注释: ${col.COLUMN_COMMENT}`);
          }
        });
      }
    } catch (error) {
      console.log(
        "❌ 获取表信息失败:",
        error.response?.data?.message || error.message
      );
    }

    // 2. 检测表结构变化
    console.log("\n2. 检测 qc_testone 表的结构变化...");
    try {
      const response = await axios.post(`${BASE_URL}/table`, {
        tableName: "qc_testone",
        databaseType: "main",
      });

      if (response.data.success) {
        if (response.data.data) {
          console.log("✅ 检测到结构变化:");
          const change = response.data.data;
          console.log(`  表名: ${change.table_name}`);
          console.log(`  数据库类型: ${change.database_type}`);
          console.log(`  分区类型: ${change.partition_type}`);
          console.log(
            `  版本变化: ${change.current_version || "无"} -> ${
              change.new_version
            }`
          );
          console.log(`  变化数量: ${change.changes_detected.length}`);

          if (change.changes_detected.length > 0) {
            console.log("  具体变化:");
            change.changes_detected.forEach((c) => {
              console.log(`    - ${c}`);
            });
          }

          // 3. 询问是否保存变化
          console.log("\n3. 自动保存检测到的变化...");
          const saveResponse = await axios.post(`${BASE_URL}/save`, {
            changes: [change],
          });

          if (saveResponse.data.success) {
            console.log("✅ 变化已保存到 TableSchema 表");
          } else {
            console.log("❌ 保存失败:", saveResponse.data.message);
          }
        } else {
          console.log("✅ 该表没有结构变化");
        }
      } else {
        console.log("❌ 检测失败:", response.data.message);
      }
    } catch (error) {
      console.log(
        "❌ 检测出错:",
        error.response?.data?.message || error.message
      );
    }

    console.log("\n🎉 测试完成！");
  } catch (error) {
    console.error("测试过程中出现错误:", error);
  }
}

// 运行测试
testQcTestOne();
