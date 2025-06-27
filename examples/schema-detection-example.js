const axios = require("axios");

// 服务器地址
const BASE_URL = "http://localhost:3000/api/schema-detection";

/**
 * 表结构检测功能使用示例
 */
class SchemaDetectionExample {
  /**
   * 获取基准数据库中的所有表
   */
  async getBaseTables() {
    try {
      console.log("\n🔍 获取基准数据库中的所有表...");

      const response = await axios.get(`${BASE_URL}/tables`);

      if (response.data.success) {
        console.log(`✅ 成功获取 ${response.data.data.length} 个表:`);
        response.data.data.forEach((table) => {
          console.log(`  - ${table.table_name} (${table.comment || "无注释"})`);
        });
        return response.data.data.map((t) => t.table_name);
      } else {
        console.error("❌ 获取表列表失败:", response.data.message);
        return [];
      }
    } catch (error) {
      console.error("❌ 请求失败:", error.message);
      return [];
    }
  }

  /**
   * 检测单个表的结构变化
   */
  async detectSingleTable(tableName, databaseType = "main") {
    try {
      console.log(`\n🔍 检测表 ${tableName} 的结构变化...`);

      const response = await axios.post(`${BASE_URL}/table`, {
        tableName,
        databaseType,
      });

      if (response.data.success) {
        if (response.data.data) {
          console.log("✅ 检测到结构变化:");
          const change = response.data.data;
          console.log(`  表名: ${change.table_name}`);
          console.log(`  数据库类型: ${change.database_type}`);
          console.log(
            `  版本变化: ${change.current_version || "无"} -> ${
              change.new_version
            }`
          );
          console.log(`  变化数量: ${change.changes_detected.length}`);
          console.log("  具体变化:");
          change.changes_detected.forEach((change) => {
            console.log(`    - ${change}`);
          });
          return change;
        } else {
          console.log("✅ 该表没有结构变化");
          return null;
        }
      } else {
        console.error("❌ 检测失败:", response.data.message);
        return null;
      }
    } catch (error) {
      console.error("❌ 请求失败:", error.message);
      return null;
    }
  }

  /**
   * 检测所有表的结构变化
   */
  async detectAllTables(databaseType = "main", tableNames = null) {
    try {
      console.log(`\n🔍 检测所有表的结构变化 (${databaseType})...`);

      const response = await axios.post(`${BASE_URL}/all`, {
        databaseType,
        tableNames,
      });

      if (response.data.success) {
        const changes = response.data.data;
        console.log(`✅ 检测完成，发现 ${changes.length} 个表有结构变化:`);

        if (changes.length > 0) {
          changes.forEach((change, index) => {
            console.log(`\n  ${index + 1}. 表: ${change.table_name}`);
            console.log(
              `     版本: ${change.current_version || "无"} -> ${
                change.new_version
              }`
            );
            console.log(`     变化: ${change.changes_detected.length}个`);
            change.changes_detected.forEach((c) => {
              console.log(`       - ${c}`);
            });
          });
        } else {
          console.log("  所有表都没有结构变化");
        }

        return changes;
      } else {
        console.error("❌ 检测失败:", response.data.message);
        return [];
      }
    } catch (error) {
      console.error("❌ 请求失败:", error.message);
      return [];
    }
  }

  /**
   * 检测并自动保存表结构变化
   */
  async detectAndAutoSave(databaseType = "main", tableNames = null) {
    try {
      console.log(`\n🔍 检测并自动保存表结构变化 (${databaseType})...`);

      const response = await axios.post(`${BASE_URL}/detect-and-save`, {
        databaseType,
        tableNames,
        autoSave: true,
      });

      if (response.data.success) {
        const summary = response.data.summary;
        console.log(`✅ 检测完成:`);
        console.log(`  发现变化的表: ${summary.total_tables_with_changes}`);
        console.log(`  已保存: ${summary.saved ? "是" : "否"}`);

        if (summary.tables_changed && summary.tables_changed.length > 0) {
          console.log("  变化详情:");
          summary.tables_changed.forEach((change, index) => {
            console.log(
              `    ${index + 1}. ${change.table_name}: ${change.version} (${
                change.changes_count
              }个变化)`
            );
          });
        }

        return response.data.data;
      } else {
        console.error("❌ 检测失败:", response.data.message);
        return [];
      }
    } catch (error) {
      console.error("❌ 请求失败:", error.message);
      return [];
    }
  }

  /**
   * 获取表的详细结构信息
   */
  async getTableInfo(tableName) {
    try {
      console.log(`\n📋 获取表 ${tableName} 的详细结构信息...`);

      const response = await axios.get(`${BASE_URL}/table/${tableName}/info`);

      if (response.data.success) {
        const info = response.data.data;
        console.log(`✅ 表 ${info.table_name} 结构信息:`);

        console.log("  列信息:");
        info.columns.forEach((col) => {
          const nullable = col.IS_NULLABLE === "YES" ? "可空" : "不可空";
          const key =
            col.COLUMN_KEY === "PRI"
              ? "[主键]"
              : col.COLUMN_KEY === "UNI"
              ? "[唯一]"
              : "";
          const extra = col.EXTRA ? `[${col.EXTRA}]` : "";
          console.log(
            `    ${col.COLUMN_NAME}: ${col.DATA_TYPE}${
              col.CHARACTER_MAXIMUM_LENGTH
                ? `(${col.CHARACTER_MAXIMUM_LENGTH})`
                : ""
            } ${nullable} ${key}${extra}`
          );
          if (col.COLUMN_COMMENT) {
            console.log(`      注释: ${col.COLUMN_COMMENT}`);
          }
        });

        if (info.indexes && info.indexes.length > 0) {
          console.log("  索引信息:");
          const indexMap = new Map();
          info.indexes.forEach((idx) => {
            if (idx.INDEX_NAME === "PRIMARY") return;
            if (!indexMap.has(idx.INDEX_NAME)) {
              indexMap.set(idx.INDEX_NAME, {
                name: idx.INDEX_NAME,
                unique: idx.NON_UNIQUE === 0,
                columns: [],
              });
            }
            indexMap.get(idx.INDEX_NAME).columns.push(idx.COLUMN_NAME);
          });

          indexMap.forEach((idx) => {
            const type = idx.unique ? "唯一索引" : "普通索引";
            console.log(`    ${idx.name}: ${type} (${idx.columns.join(", ")})`);
          });
        }

        return info;
      } else {
        console.error("❌ 获取表信息失败:", response.data.message);
        return null;
      }
    } catch (error) {
      console.error("❌ 请求失败:", error.message);
      return null;
    }
  }

  /**
   * 完整的使用示例
   */
  async runFullExample() {
    console.log("🚀 表结构检测功能使用示例");
    console.log("=====================================");

    // 1. 获取所有表
    const tables = await this.getBaseTables();

    if (tables.length === 0) {
      console.log("\n❌ 基准数据库中没有表，示例结束");
      return;
    }

    // 2. 检测第一个表的结构变化（示例）
    if (tables.length > 0) {
      await this.detectSingleTable(tables[0]);
    }

    // 3. 检测所有表的结构变化
    const allChanges = await this.detectAllTables();

    // 4. 如果有变化，演示如何自动保存
    if (allChanges.length > 0) {
      console.log("\n📝 发现表结构变化，演示自动保存功能...");
      await this.detectAndAutoSave();
    }

    // 5. 获取表的详细信息（示例）
    if (tables.length > 0) {
      await this.getTableInfo(tables[0]);
    }

    console.log("\n✅ 示例演示完成！");
  }
}

// 运行示例
async function main() {
  const example = new SchemaDetectionExample();

  // 检查命令行参数
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // 运行完整示例
    await example.runFullExample();
  } else {
    const command = args[0];
    const param = args[1];

    switch (command) {
      case "tables":
        await example.getBaseTables();
        break;
      case "detect":
        if (param) {
          await example.detectSingleTable(param);
        } else {
          await example.detectAllTables();
        }
        break;
      case "info":
        if (param) {
          await example.getTableInfo(param);
        } else {
          console.log(
            "请提供表名，例如: node schema-detection-example.js info users"
          );
        }
        break;
      case "save":
        await example.detectAndAutoSave();
        break;
      default:
        console.log("使用方法:");
        console.log(
          "  node schema-detection-example.js                    # 运行完整示例"
        );
        console.log(
          "  node schema-detection-example.js tables             # 获取所有表"
        );
        console.log(
          "  node schema-detection-example.js detect [tableName] # 检测表变化"
        );
        console.log(
          "  node schema-detection-example.js info <tableName>   # 获取表信息"
        );
        console.log(
          "  node schema-detection-example.js save               # 检测并保存"
        );
    }
  }
}

main().catch((error) => {
  console.error("运行示例时出错:", error);
});

module.exports = SchemaDetectionExample;
