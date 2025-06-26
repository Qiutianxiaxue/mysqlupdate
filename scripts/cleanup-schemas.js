const axios = require("axios");

// API基础URL
const BASE_URL = "http://localhost:3000/api/migration";

/**
 * 清理重复的表结构定义
 */
async function cleanupSchemas() {
  try {
    console.log("🧹 开始清理重复的表结构定义...\n");

    // 1. 获取所有表结构定义
    console.log("1️⃣ 获取所有表结构定义...");
    const schemasResponse = await axios.get(`${BASE_URL}/schemas`);
    const schemas = schemasResponse.data.data;

    console.log(`✅ 找到 ${schemas.length} 个表结构定义`);

    // 2. 分析重复的表名
    const tableNameMap = new Map();
    const duplicates = [];

    schemas.forEach((schema) => {
      const key = `${schema.table_name}_${schema.database_type}`;
      if (tableNameMap.has(key)) {
        duplicates.push({
          key,
          existing: tableNameMap.get(key),
          duplicate: schema,
        });
      } else {
        tableNameMap.set(key, schema);
      }
    });

    if (duplicates.length === 0) {
      console.log("✅ 没有发现重复的表结构定义");
      return;
    }

    console.log(`⚠️  发现 ${duplicates.length} 个重复的表结构定义:`);
    duplicates.forEach((dup) => {
      console.log(
        `   - ${dup.key}: ID ${dup.existing.id} (保留) vs ID ${dup.duplicate.id} (重复)`
      );
    });

    // 3. 删除重复的定义（保留最新的）
    console.log("\n2️⃣ 删除重复的表结构定义...");
    for (const dup of duplicates) {
      try {
        await axios.delete(`${BASE_URL}/schemas/${dup.duplicate.id}`);
        console.log(`✅ 删除重复定义: ${dup.key} (ID: ${dup.duplicate.id})`);
      } catch (error) {
        console.error(
          `❌ 删除失败: ${dup.key} (ID: ${dup.duplicate.id})`,
          error.response?.data || error.message
        );
      }
    }

    // 4. 验证清理结果
    console.log("\n3️⃣ 验证清理结果...");
    const finalSchemasResponse = await axios.get(`${BASE_URL}/schemas`);
    const finalSchemas = finalSchemasResponse.data.data;

    console.log(`✅ 清理完成，剩余 ${finalSchemas.length} 个表结构定义`);

    console.log("\n🎉 表结构定义清理完成！");
  } catch (error) {
    if (error.response) {
      console.error("❌ API错误:", error.response.status, error.response.data);
    } else {
      console.error("❌ 网络错误:", error.message);
    }
  }
}

/**
 * 获取表结构定义列表
 */
async function listSchemas() {
  try {
    console.log("📋 获取表结构定义列表...\n");

    const response = await axios.get(`${BASE_URL}/schemas`);
    const schemas = response.data.data;

    if (schemas.length === 0) {
      console.log("📭 没有找到表结构定义");
      return;
    }

    console.log(`📊 共找到 ${schemas.length} 个表结构定义:\n`);

    schemas.forEach((schema) => {
      console.log(`ID: ${schema.id}`);
      console.log(`表名: ${schema.table_name}`);
      console.log(`数据库类型: ${schema.database_type}`);
      console.log(`分区类型: ${schema.partition_type}`);
      console.log(`版本: ${schema.schema_version}`);
      console.log(`状态: ${schema.is_active ? "激活" : "禁用"}`);
      console.log(`创建时间: ${schema.created_at}`);
      console.log("---");
    });
  } catch (error) {
    if (error.response) {
      console.error("❌ API错误:", error.response.status, error.response.data);
    } else {
      console.error("❌ 网络错误:", error.message);
    }
  }
}

/**
 * 清理带时间戳的表结构定义
 */
async function cleanupTimestampSchemas() {
  try {
    console.log("🧹 开始清理带时间戳的表结构定义...\n");

    // 1. 获取所有表结构定义
    console.log("1️⃣ 获取所有表结构定义...");
    const response = await axios.get(`${BASE_URL}/schemas`);
    const schemas = response.data.data;

    // 2. 找到带时间戳的表结构定义
    const timestampSchemas = schemas.filter(
      (schema) =>
        schema.table_name.includes("upgrade_test_") &&
        /^\d+$/.test(schema.table_name.split("_").pop())
    );

    console.log(`找到 ${timestampSchemas.length} 个带时间戳的表结构定义:`);
    timestampSchemas.forEach((schema) => {
      console.log(
        `   - ID: ${schema.id}, 表名: ${schema.table_name}, 版本: ${schema.schema_version}`
      );
    });

    // 3. 删除这些表结构定义
    if (timestampSchemas.length > 0) {
      console.log("\n2️⃣ 删除带时间戳的表结构定义...");
      for (const schema of timestampSchemas) {
        try {
          await axios.delete(`${BASE_URL}/schemas/${schema.id}`);
          console.log(`   ✅ 删除成功: ${schema.table_name}`);
        } catch (error) {
          console.log(
            `   ❌ 删除失败: ${schema.table_name} - ${
              error.response?.data?.message || error.message
            }`
          );
        }
      }
    } else {
      console.log("没有找到需要清理的表结构定义");
    }

    console.log("\n🎉 清理完成！");
  } catch (error) {
    console.error("清理失败:", error.response?.data || error.message);
  }
}

// 主函数
async function main() {
  const command = process.argv[2];

  switch (command) {
    case "cleanup":
      await cleanupSchemas();
      break;
    case "cleanup-timestamp":
      await cleanupTimestampSchemas();
      break;
    case "list":
      await listSchemas();
      break;
    default:
      console.log("使用方法:");
      console.log(
        "  node scripts/cleanup-schemas.js cleanup         # 清理重复定义"
      );
      console.log(
        "  node scripts/cleanup-schemas.js cleanup-timestamp # 清理带时间戳的定义"
      );
      console.log(
        "  node scripts/cleanup-schemas.js list            # 列出所有定义"
      );
      break;
  }
}

// 运行主函数
main().catch((error) => {
  console.error("❌ 脚本执行失败:", error.message);
  process.exit(1);
});
