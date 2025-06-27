const { Sequelize } = require("sequelize");

// 配置数据库连接
const baseDbConfig = {
  host: "localhost",
  port: 3306,
  username: "root",
  password: "123456",
  database: "base_hn_yc_test",
};

async function testSchemaGeneration() {
  const baseConnection = new Sequelize(
    baseDbConfig.database,
    baseDbConfig.username,
    baseDbConfig.password,
    {
      host: baseDbConfig.host,
      port: baseDbConfig.port,
      dialect: "mysql",
      logging: false,
    }
  );

  try {
    await baseConnection.authenticate();
    console.log("=== 测试schema_definition生成过程 ===\n");

    // 1. 首先检查qc_store_region表的原始结构
    console.log("1. 检查qc_store_region表的原始结构:");
    const columns = await baseConnection.query(
      `
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        COLUMN_KEY,
        EXTRA,
        COLUMN_COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'base_hn_yc_test'
      AND TABLE_NAME = 'qc_store_region'
      ORDER BY ORDINAL_POSITION
    `,
      { type: Sequelize.QueryTypes.SELECT }
    );

    console.log("列信息:");
    columns.forEach((col) => {
      console.log(
        `- ${col.COLUMN_NAME}: ${col.DATA_TYPE}, KEY=${col.COLUMN_KEY}, EXTRA=${col.EXTRA}`
      );
    });

    const primaryKeys = columns.filter((col) => col.COLUMN_KEY === "PRI");
    console.log(`\n主键列数量: ${primaryKeys.length}`);
    console.log("主键列:");
    primaryKeys.forEach((col) => console.log(`  - ${col.COLUMN_NAME}`));

    // 2. 使用SchemaDetectionService生成schema定义
    console.log("\n2. 使用SchemaDetectionService生成schema定义:");

    const { SchemaDetectionService } = await import(
      "./src/services/SchemaDetectionService.ts"
    );
    const schemaService = new SchemaDetectionService(baseConnection);

    // 调用getCurrentTableInfo方法（这是generateSchemaDefinition的输入）
    console.log("\n获取表信息...");
    const tableInfo = await schemaService.getCurrentTableInfo(
      "qc_store_region"
    );

    if (tableInfo) {
      console.log("表信息获取成功");
      console.log(`列数量: ${tableInfo.columns.length}`);
      console.log(`索引数量: ${tableInfo.indexes.length}`);

      // 检查主键列
      const primaryKeyColumns = tableInfo.columns.filter(
        (col) => col.column_key === "PRI"
      );
      console.log(`主键列数量: ${primaryKeyColumns.length}`);
      console.log("主键列:");
      primaryKeyColumns.forEach((col) => console.log(`  - ${col.column_name}`));

      // 生成schema定义（需要通过私有方法，我们模拟这个过程）
      console.log("\n3. 生成schema定义:");

      // 模拟generateSchemaDefinition方法的逻辑
      const generatedColumns = tableInfo.columns.map((col) => {
        const column = {
          name: col.column_name,
          type: col.data_type.toUpperCase(),
        };

        if (col.character_maximum_length !== null) {
          column.length = col.character_maximum_length;
        }

        if (col.is_nullable === "NO") {
          column.allowNull = false;
        }

        if (col.column_default !== null) {
          column.defaultValue = col.column_default;
        }

        // 这里是关键：检查主键处理逻辑
        if (col.column_key === "PRI") {
          column.primaryKey = true;
          console.log(`  设置主键: ${col.column_name}`);
        }

        if (col.extra.includes("auto_increment")) {
          column.autoIncrement = true;
        }

        if (col.column_key === "UNI") {
          column.unique = true;
        }

        if (col.column_comment && col.column_comment.trim() !== "") {
          column.comment = col.column_comment;
        }

        return column;
      });

      console.log("\n生成的列定义:");
      generatedColumns.forEach((col) => {
        const primaryKeyStatus = col.primaryKey ? " [PRIMARY KEY]" : "";
        console.log(`- ${col.name}: ${col.type}${primaryKeyStatus}`);
      });

      // 统计主键数量
      const generatedPrimaryKeys = generatedColumns.filter(
        (col) => col.primaryKey
      );
      console.log(`\n生成的主键数量: ${generatedPrimaryKeys.length}`);
      console.log(`原始主键数量: ${primaryKeyColumns.length}`);

      if (generatedPrimaryKeys.length === primaryKeyColumns.length) {
        console.log("✅ 正确：生成的主键数量与原始主键数量一致");
        console.log("主键列:");
        generatedPrimaryKeys.forEach((col) => console.log(`  - ${col.name}`));
      } else {
        console.log("❌ 错误：生成的主键数量与原始不一致！");
        console.log("原始主键列:");
        primaryKeyColumns.forEach((col) =>
          console.log(`  - ${col.column_name}`)
        );
        console.log("生成的主键列:");
        generatedPrimaryKeys.forEach((col) => console.log(`  - ${col.name}`));
      }
    } else {
      console.log("❌ 无法获取表信息");
    }

    await schemaService.close();
  } catch (error) {
    console.error("测试失败:", error);
  } finally {
    await baseConnection.close();
  }
}

// 运行测试
testSchemaGeneration().catch(console.error);
