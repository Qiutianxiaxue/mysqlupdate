const { Sequelize } = require("sequelize");

async function debugIndexDetection() {
  console.log("=== 调试索引检测 ===\n");

  // 使用你的数据库连接配置
  const sequelize = new Sequelize({
    host: "localhost",
    port: 3306,
    username: "root",
    password: "123456",
    database: "test_database", // 请替换为你的实际数据库名
    dialect: "mysql",
    logging: false, // 暂时关闭SQL日志，避免干扰
  });

  try {
    // 测试连接
    console.log("1. 测试数据库连接...");
    await sequelize.authenticate();
    console.log("✅ 数据库连接成功\n");

    const testTableName = "user_operation_logs1"; // 替换为你要检查的表名

    // 方法1: 使用information_schema查询索引
    console.log(`2. 使用information_schema查询表 ${testTableName} 的索引...`);
    try {
      const [infoSchemaResult] = await sequelize.query(
        "SELECT DISTINCT INDEX_NAME FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND INDEX_NAME != 'PRIMARY'",
        { replacements: [testTableName] }
      );

      console.log("information_schema查询结果类型:", typeof infoSchemaResult);
      console.log("information_schema查询结果:", infoSchemaResult);

      // 处理结果
      let indexesFromInfoSchema = [];
      if (Array.isArray(infoSchemaResult)) {
        indexesFromInfoSchema = infoSchemaResult.map((row) => row.INDEX_NAME);
      } else if (infoSchemaResult && typeof infoSchemaResult === "object") {
        indexesFromInfoSchema = Object.values(infoSchemaResult).map(
          (row) => row.INDEX_NAME
        );
      }

      console.log("通过information_schema获取的索引:", indexesFromInfoSchema);
      console.log("");
    } catch (error) {
      console.log("information_schema查询失败:", error.message);
    }

    // 方法2: 使用SHOW INDEX查询
    console.log(`3. 使用SHOW INDEX查询表 ${testTableName} 的索引...`);
    try {
      const [showIndexResult] = await sequelize.query(
        `SHOW INDEX FROM ${testTableName}`
      );

      console.log("SHOW INDEX查询结果类型:", typeof showIndexResult);
      console.log(
        "SHOW INDEX查询结果数量:",
        Array.isArray(showIndexResult) ? showIndexResult.length : "N/A"
      );

      if (Array.isArray(showIndexResult) && showIndexResult.length > 0) {
        console.log("第一个索引记录:", showIndexResult[0]);

        // 提取所有索引名（去重）
        const allIndexes = showIndexResult.map((row) => row.Key_name);
        const uniqueIndexes = [...new Set(allIndexes)];
        const nonPrimaryIndexes = uniqueIndexes.filter(
          (name) => name !== "PRIMARY"
        );

        console.log("所有索引名:", uniqueIndexes);
        console.log("非主键索引:", nonPrimaryIndexes);
      } else {
        console.log("没有找到索引或结果格式异常");
      }
      console.log("");
    } catch (error) {
      console.log("SHOW INDEX查询失败:", error.message);
    }

    // 方法3: 使用SHOW CREATE TABLE查看表结构
    console.log(
      `4. 使用SHOW CREATE TABLE查看表 ${testTableName} 的完整结构...`
    );
    try {
      const [createTableResult] = await sequelize.query(
        `SHOW CREATE TABLE ${testTableName}`
      );

      if (Array.isArray(createTableResult) && createTableResult.length > 0) {
        const createTableSQL = createTableResult[0]["Create Table"];
        console.log("CREATE TABLE语句:");
        console.log(createTableSQL);

        // 简单解析索引
        const indexMatches = createTableSQL.match(/KEY\s+`([^`]+)`/g);
        if (indexMatches) {
          const indexNames = indexMatches.map(
            (match) => match.match(/`([^`]+)`/)[1]
          );
          console.log("\n从CREATE TABLE中解析的索引名:", indexNames);
        } else {
          console.log("\n没有在CREATE TABLE中找到索引定义");
        }
      }
      console.log("");
    } catch (error) {
      console.log("SHOW CREATE TABLE查询失败:", error.message);
    }

    // 测试特定索引是否存在
    const testIndexNames = [
      "idx_user_id",
      "idx_operation_type",
      "idx_created_at",
    ]; // 请替换为你期望存在的索引名
    console.log("5. 测试特定索引是否存在...");

    for (const indexName of testIndexNames) {
      try {
        const [checkResult] = await sequelize.query(
          "SELECT COUNT(*) as count FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?",
          { replacements: [testTableName, indexName] }
        );

        const count = checkResult[0].count;
        console.log(
          `索引 ${indexName}: ${
            count > 0 ? "存在" : "不存在"
          } (count: ${count})`
        );
      } catch (error) {
        console.log(`检查索引 ${indexName} 时出错:`, error.message);
      }
    }
  } catch (error) {
    console.error("❌ 调试失败:", error.message);
  } finally {
    await sequelize.close();
  }
}

// 提示用户修改配置
console.log("请先修改此脚本中的配置：");
console.log("- database: 你的数据库名");
console.log("- testTableName: 你要检查的表名");
console.log("- testIndexNames: 你期望存在的索引名列表");
console.log("- 其他连接参数（host, username, password等）\n");

debugIndexDetection();
