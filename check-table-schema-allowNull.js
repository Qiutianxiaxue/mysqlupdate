const mysql = require("mysql2/promise");

async function checkTableSchemaAllowNull() {
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "123456",
    database: "mysql_update",
  });

  try {
    // 先查看数据库中有哪些表
    const [tables] = await connection.execute(`SHOW TABLES`);
    console.log("=== 数据库中的表 ===");
    tables.forEach((table) => {
      console.log(Object.values(table)[0]);
    });

    // 尝试查找TableSchema表
    const tableNames = ["TableSchema", "table_schema", "tableschema"];
    let foundTableName = null;

    for (const tableName of tableNames) {
      try {
        const [test] = await connection.execute(
          `SELECT COUNT(*) as count FROM ${tableName} LIMIT 1`
        );
        foundTableName = tableName;
        console.log(`\n找到表: ${tableName}`);
        break;
      } catch (e) {
        // 表不存在，继续尝试下一个
      }
    }

    if (foundTableName) {
      const [rows] = await connection.execute(`
        SELECT table_name, database_type, schema_version, schema_definition 
        FROM ${foundTableName} 
        WHERE table_name = 'store_orders' AND database_type = 'main'
        ORDER BY schema_version DESC
        LIMIT 1
      `);

      if (rows.length > 0) {
        const schema = rows[0];
        console.log("\n=== TableSchema记录 ===");
        console.log("表名:", schema.table_name);
        console.log("数据库类型:", schema.database_type);
        console.log("版本:", schema.schema_version);

        const definition = JSON.parse(schema.schema_definition);
        console.log("\n=== 列定义 ===");

        definition.columns.forEach((col) => {
          console.log(`\n列: ${col.name}`);
          console.log(`  类型: ${col.type}`);
          console.log(
            `  allowNull: ${JSON.stringify(
              col.allowNull
            )} (${typeof col.allowNull})`
          );
          console.log(`  allowNull !== false: ${col.allowNull !== false}`);
          console.log(`  defaultValue: ${JSON.stringify(col.defaultValue)}`);
          console.log(`  comment: ${col.comment}`);
        });
      } else {
        console.log("\n未找到store_orders的TableSchema记录");
      }
    } else {
      console.log("\n未找到TableSchema表");
    }
  } catch (error) {
    console.error("查询失败:", error);
  } finally {
    await connection.end();
  }
}

checkTableSchemaAllowNull();
