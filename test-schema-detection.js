/**
 * 表结构检测功能测试脚本
 */
const axios = require("axios");

const BASE_URL = "http://localhost:3000/api/schema-detection";

async function testSchemaDetection() {
  try {
    console.log("🧪 开始测试表结构检测功能...\n");

    // 测试1：获取服务状态
    console.log("1. 测试服务状态...");
    try {
      const healthResponse = await axios.get("http://localhost:3000/health");
      console.log("✅ 服务运行正常:", healthResponse.data.status);
    } catch (error) {
      console.log("❌ 服务可能未启动，请先运行 npm run dev");
      return;
    }

    // 测试2：获取基准数据库中的所有表
    console.log("\n2. 测试获取所有表...");
    try {
      const tablesResponse = await axios.get(`${BASE_URL}/tables`);
      if (tablesResponse.data.success) {
        console.log(`✅ 成功获取 ${tablesResponse.data.data.length} 个表`);
        console.log(
          "表列表:",
          tablesResponse.data.data.map((t) => t.table_name).join(", ")
        );

        // 测试3：获取第一个表的详细信息（如果有表的话）
        if (tablesResponse.data.data.length > 0) {
          const firstTable = tablesResponse.data.data[0].table_name;
          console.log(`\n3. 测试获取表 ${firstTable} 的详细信息...`);

          try {
            const tableInfoResponse = await axios.get(
              `${BASE_URL}/table/${firstTable}/info`
            );
            if (tableInfoResponse.data.success) {
              const info = tableInfoResponse.data.data;
              console.log(`✅ 成功获取表 ${info.table_name} 信息`);
              console.log(`  - 列数: ${info.columns.length}`);
              console.log(`  - 索引数: ${info.indexes.length}`);
            } else {
              console.log("❌ 获取表信息失败:", tableInfoResponse.data.message);
            }
          } catch (error) {
            console.log("❌ 获取表信息出错:", error.message);
          }

          // 测试4：检测单个表的结构变化
          console.log(`\n4. 测试检测表 ${firstTable} 的结构变化...`);
          try {
            const detectResponse = await axios.post(`${BASE_URL}/table`, {
              tableName: firstTable,
              databaseType: "main",
            });

            if (detectResponse.data.success) {
              if (detectResponse.data.data) {
                console.log("✅ 检测到结构变化:");
                const change = detectResponse.data.data;
                console.log(
                  `  - 版本变化: ${change.current_version || "无"} -> ${
                    change.new_version
                  }`
                );
                console.log(`  - 变化数量: ${change.changes_detected.length}`);
              } else {
                console.log("✅ 该表没有结构变化");
              }
            } else {
              console.log("❌ 检测失败:", detectResponse.data.message);
            }
          } catch (error) {
            console.log("❌ 检测出错:", error.message);
          }
        } else {
          console.log("\n❌ 基准数据库中没有表，跳过后续测试");
        }

        // 测试5：检测所有表的结构变化
        console.log("\n5. 测试检测所有表的结构变化...");
        try {
          const allDetectResponse = await axios.post(`${BASE_URL}/all`, {
            databaseType: "main",
          });

          if (allDetectResponse.data.success) {
            const changes = allDetectResponse.data.data;
            console.log(`✅ 检测完成，发现 ${changes.length} 个表有结构变化`);

            if (changes.length > 0) {
              console.log("变化的表:");
              changes.forEach((change, index) => {
                console.log(
                  `  ${index + 1}. ${change.table_name}: ${
                    change.changes_detected.length
                  }个变化`
                );
              });
            }
          } else {
            console.log("❌ 检测所有表失败:", allDetectResponse.data.message);
          }
        } catch (error) {
          console.log("❌ 检测所有表出错:", error.message);
        }
      } else {
        console.log("❌ 获取表列表失败:", tablesResponse.data.message);
      }
    } catch (error) {
      console.log("❌ 获取表列表出错:", error.message);
    }

    console.log("\n🎉 测试完成！");
  } catch (error) {
    console.error("测试过程中出现错误:", error);
  }
}

// 运行测试
testSchemaDetection();
