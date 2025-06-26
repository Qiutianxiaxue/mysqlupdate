const mysql = require("mysql2/promise");

async function fixIndexProblem() {
  let connection;

  try {
    // 连接数据库
    connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "123456",
      database: "mysqlupdate",
    });

    console.log("🔍 检查qc_enterprise表的索引...");

    // 查看当前索引
    const [indexes] = await connection.execute(`
      SHOW INDEX FROM qc_enterprise
    `);

    console.log(`📊 当前索引数量: ${indexes.length}`);

    // 分组显示索引
    const indexGroups = {};
    indexes.forEach((index) => {
      if (!indexGroups[index.Key_name]) {
        indexGroups[index.Key_name] = [];
      }
      indexGroups[index.Key_name].push(index);
    });

    console.log("📋 索引列表:");
    Object.keys(indexGroups).forEach((keyName) => {
      const group = indexGroups[keyName];
      console.log(
        `   - ${keyName}: ${group.map((idx) => idx.Column_name).join(", ")} (${
          group[0].Non_unique ? "普通" : "唯一"
        })`
      );
    });

    if (indexes.length > 50) {
      console.log("\n⚠️  索引数量过多，开始清理重复和不必要的索引...");

      // 保留必要的索引
      const essentialIndexes = [
        "PRIMARY",
        "uk_enterprise_key",
        "uk_enterprise_code",
        "uk_database_name",
        "idx_status",
      ];

      // 删除多余的索引
      for (const keyName of Object.keys(indexGroups)) {
        if (!essentialIndexes.includes(keyName)) {
          try {
            console.log(`🗑️  删除索引: ${keyName}`);
            await connection.execute(
              `DROP INDEX \`${keyName}\` ON qc_enterprise`
            );
          } catch (error) {
            console.log(`   ⚠️  无法删除索引 ${keyName}: ${error.message}`);
          }
        }
      }

      // 重新创建必要的索引（如果不存在）
      const remainingIndexes = Object.keys(indexGroups).filter((name) =>
        essentialIndexes.includes(name)
      );

      // 创建enterprise_key唯一索引
      if (!remainingIndexes.includes("uk_enterprise_key")) {
        try {
          console.log("✅ 创建enterprise_key唯一索引...");
          await connection.execute(
            `ALTER TABLE qc_enterprise ADD UNIQUE INDEX uk_enterprise_key (enterprise_key)`
          );
        } catch (error) {
          console.log(`   ⚠️  enterprise_key索引可能已存在: ${error.message}`);
        }
      }

      // 创建enterprise_code唯一索引
      if (!remainingIndexes.includes("uk_enterprise_code")) {
        try {
          console.log("✅ 创建enterprise_code唯一索引...");
          await connection.execute(
            `ALTER TABLE qc_enterprise ADD UNIQUE INDEX uk_enterprise_code (enterprise_code)`
          );
        } catch (error) {
          console.log(`   ⚠️  enterprise_code索引可能已存在: ${error.message}`);
        }
      }

      // 创建database_name唯一索引
      if (!remainingIndexes.includes("uk_database_name")) {
        try {
          console.log("✅ 创建database_name唯一索引...");
          await connection.execute(
            `ALTER TABLE qc_enterprise ADD UNIQUE INDEX uk_database_name (database_name)`
          );
        } catch (error) {
          console.log(`   ⚠️  database_name索引可能已存在: ${error.message}`);
        }
      }

      // 创建status普通索引
      if (!remainingIndexes.includes("idx_status")) {
        try {
          console.log("✅ 创建status索引...");
          await connection.execute(
            `ALTER TABLE qc_enterprise ADD INDEX idx_status (status)`
          );
        } catch (error) {
          console.log(`   ⚠️  status索引可能已存在: ${error.message}`);
        }
      }
    }

    // 再次检查索引
    const [finalIndexes] = await connection.execute(
      `SHOW INDEX FROM qc_enterprise`
    );
    console.log(`\n🎉 清理完成！当前索引数量: ${finalIndexes.length}`);

    const finalIndexGroups = {};
    finalIndexes.forEach((index) => {
      if (!finalIndexGroups[index.Key_name]) {
        finalIndexGroups[index.Key_name] = [];
      }
      finalIndexGroups[index.Key_name].push(index);
    });

    console.log("📋 最终索引列表:");
    Object.keys(finalIndexGroups).forEach((keyName) => {
      const group = finalIndexGroups[keyName];
      console.log(
        `   - ${keyName}: ${group.map((idx) => idx.Column_name).join(", ")} (${
          group[0].Non_unique ? "普通" : "唯一"
        })`
      );
    });
  } catch (error) {
    console.error("❌ 修复索引问题失败:", error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 运行修复
fixIndexProblem();
