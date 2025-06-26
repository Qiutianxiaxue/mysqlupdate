const axios = require("axios");

const BASE_URL = "http://localhost:3000/api/migration";

async function testTableExists() {
  console.log("=== 测试表存在检查功能 ===\n");

  try {
    // 1. 首先创建一个表结构定义
    console.log("1. 创建表结构定义...");
    const createSchemaResponse = await axios.post(
      `${BASE_URL}/schemas/create`,
      {
        table_name: "test_exists_check",
        database_type: "main",
        partition_type: "none",
        schema_version: "1.0.0",
        schema_definition: JSON.stringify({
          tableName: "test_exists_check",
          columns: [
            {
              name: "id",
              type: "INT",
              primaryKey: true,
              autoIncrement: true,
              comment: "主键ID",
            },
            {
              name: "name",
              type: "VARCHAR",
              length: 100,
              allowNull: false,
              comment: "名称",
            },
            {
              name: "created_at",
              type: "DATETIME",
              allowNull: false,
              defaultValue: "CURRENT_TIMESTAMP",
              comment: "创建时间",
            },
          ],
        }),
        upgrade_notes: "测试表存在检查功能",
      }
    );

    console.log("✅ 表结构定义创建成功:", createSchemaResponse.data.message);
    console.log("");

    // 2. 执行迁移，观察表存在检查的日志
    console.log("2. 执行迁移（观察表存在检查日志）...");
    const migrationResponse = await axios.post(`${BASE_URL}/execute`, {
      table_name: "test_exists_check",
      database_type: "main",
    });

    console.log("✅ 迁移执行成功:", migrationResponse.data.message);
    console.log("迁移详情:", migrationResponse.data.data);
    console.log("");

    // 3. 再次执行迁移，这次表应该已经存在
    console.log("3. 再次执行迁移（测试表已存在的情况）...");
    const secondMigrationResponse = await axios.post(`${BASE_URL}/execute`, {
      table_name: "test_exists_check",
      database_type: "main",
    });

    console.log("✅ 第二次迁移执行成功:", secondMigrationResponse.data.message);
    console.log("迁移详情:", secondMigrationResponse.data.data);
    console.log("");

    // 4. 创建升级版本，测试升级逻辑
    console.log("4. 创建升级版本...");
    const upgradeSchemaResponse = await axios.post(
      `${BASE_URL}/schemas/create`,
      {
        table_name: "test_exists_check",
        database_type: "main",
        partition_type: "none",
        schema_version: "1.1.0",
        schema_definition: JSON.stringify({
          tableName: "test_exists_check",
          columns: [
            {
              name: "id",
              type: "INT",
              primaryKey: true,
              autoIncrement: true,
              comment: "主键ID",
            },
            {
              name: "name",
              type: "VARCHAR",
              length: 100,
              allowNull: false,
              comment: "名称",
            },
            {
              name: "email",
              type: "VARCHAR",
              length: 150,
              allowNull: true,
              comment: "邮箱地址",
            },
            {
              name: "created_at",
              type: "DATETIME",
              allowNull: false,
              defaultValue: "CURRENT_TIMESTAMP",
              comment: "创建时间",
            },
          ],
        }),
        upgrade_notes: "添加邮箱字段",
      }
    );

    console.log("✅ 升级版本创建成功:", upgradeSchemaResponse.data.message);
    console.log("");

    // 5. 执行升级迁移
    console.log("5. 执行升级迁移（应该检测到表存在并执行升级）...");
    const upgradeMigrationResponse = await axios.post(`${BASE_URL}/execute`, {
      table_name: "test_exists_check",
      database_type: "main",
    });

    console.log("✅ 升级迁移执行成功:", upgradeMigrationResponse.data.message);
    console.log("升级详情:", upgradeMigrationResponse.data.data);
  } catch (error) {
    console.error("❌ 测试失败:", error.response?.data || error.message);

    if (error.response?.data) {
      console.error("错误详情:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 执行测试
console.log("开始测试表存在检查功能...\n");
testTableExists();
