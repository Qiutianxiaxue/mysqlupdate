const axios = require("axios");

const BASE_URL = "http://localhost:3000/api/migration";

async function testUpgradeLogic() {
  console.log("=== 测试表升级逻辑 ===\n");

  try {
    // 1. 创建初始版本的表结构定义
    console.log("1. 创建初始版本的表结构定义...");
    const initialSchema = {
      table_name: "test_upgrade_logic",
      database_type: "main",
      partition_type: "none",
      schema_version: "1.0.0",
      schema_definition: JSON.stringify({
        tableName: "test_upgrade_logic",
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
            name: "status",
            type: "INT",
            allowNull: false,
            defaultValue: 1,
            comment: "状态",
          },
          {
            name: "created_at",
            type: "DATETIME",
            allowNull: false,
            defaultValue: "CURRENT_TIMESTAMP",
            comment: "创建时间",
          },
        ],
        indexes: [
          {
            name: "idx_name",
            fields: ["name"],
            unique: false,
          },
          {
            name: "idx_status",
            fields: ["status"],
            unique: false,
          },
        ],
      }),
      upgrade_notes: "初始版本",
    };

    const createResponse = await axios.post(
      `${BASE_URL}/schemas/create`,
      initialSchema
    );
    console.log("✅ 初始版本创建成功:", createResponse.data.message);
    console.log("");

    // 2. 执行初始迁移（创建表）
    console.log("2. 执行初始迁移（创建表）...");
    const initialMigrationResponse = await axios.post(`${BASE_URL}/execute`, {
      table_name: "test_upgrade_logic",
      database_type: "main",
    });

    console.log("✅ 初始迁移成功:", initialMigrationResponse.data.message);
    console.log("迁移详情:", initialMigrationResponse.data.data);
    console.log("");

    // 3. 创建升级版本1.1.0（添加新列）
    console.log("3. 创建升级版本1.1.0（添加新列）...");
    const upgradeSchema1 = {
      table_name: "test_upgrade_logic",
      database_type: "main",
      partition_type: "none",
      schema_version: "1.1.0",
      schema_definition: JSON.stringify({
        tableName: "test_upgrade_logic",
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
            name: "phone",
            type: "VARCHAR",
            length: 20,
            allowNull: true,
            comment: "电话号码",
          },
          {
            name: "status",
            type: "INT",
            allowNull: false,
            defaultValue: 1,
            comment: "状态",
          },
          {
            name: "created_at",
            type: "DATETIME",
            allowNull: false,
            defaultValue: "CURRENT_TIMESTAMP",
            comment: "创建时间",
          },
          {
            name: "updated_at",
            type: "DATETIME",
            allowNull: true,
            comment: "更新时间",
          },
        ],
        indexes: [
          {
            name: "idx_name",
            fields: ["name"],
            unique: false,
          },
          {
            name: "idx_email",
            fields: ["email"],
            unique: false,
          },
          {
            name: "idx_status",
            fields: ["status"],
            unique: false,
          },
        ],
      }),
      upgrade_notes: "添加邮箱、电话、更新时间字段和邮箱索引",
    };

    const upgrade1Response = await axios.post(
      `${BASE_URL}/schemas/create`,
      upgradeSchema1
    );
    console.log("✅ 升级版本1.1.0创建成功:", upgrade1Response.data.message);
    console.log("");

    // 4. 执行升级迁移1.1.0
    console.log("4. 执行升级迁移1.1.0（应该添加新列和索引）...");
    const upgrade1MigrationResponse = await axios.post(`${BASE_URL}/execute`, {
      table_name: "test_upgrade_logic",
      database_type: "main",
    });

    console.log(
      "✅ 升级迁移1.1.0成功:",
      upgrade1MigrationResponse.data.message
    );
    console.log("升级详情:", upgrade1MigrationResponse.data.data);
    console.log("");

    // 5. 创建升级版本1.2.0（添加更多字段和索引）
    console.log("5. 创建升级版本1.2.0（添加更多字段和索引）...");
    const upgradeSchema2 = {
      table_name: "test_upgrade_logic",
      database_type: "main",
      partition_type: "none",
      schema_version: "1.2.0",
      schema_definition: JSON.stringify({
        tableName: "test_upgrade_logic",
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
            name: "phone",
            type: "VARCHAR",
            length: 20,
            allowNull: true,
            comment: "电话号码",
          },
          {
            name: "address",
            type: "TEXT",
            allowNull: true,
            comment: "地址",
          },
          {
            name: "age",
            type: "INT",
            allowNull: true,
            comment: "年龄",
          },
          {
            name: "status",
            type: "INT",
            allowNull: false,
            defaultValue: 1,
            comment: "状态",
          },
          {
            name: "created_at",
            type: "DATETIME",
            allowNull: false,
            defaultValue: "CURRENT_TIMESTAMP",
            comment: "创建时间",
          },
          {
            name: "updated_at",
            type: "DATETIME",
            allowNull: true,
            comment: "更新时间",
          },
        ],
        indexes: [
          {
            name: "idx_name",
            fields: ["name"],
            unique: false,
          },
          {
            name: "idx_email",
            fields: ["email"],
            unique: false,
          },
          {
            name: "idx_phone",
            fields: ["phone"],
            unique: false,
          },
          {
            name: "idx_age",
            fields: ["age"],
            unique: false,
          },
          {
            name: "idx_status",
            fields: ["status"],
            unique: false,
          },
          {
            name: "idx_created_at",
            fields: ["created_at"],
            unique: false,
          },
        ],
      }),
      upgrade_notes: "添加地址、年龄字段和相关索引",
    };

    const upgrade2Response = await axios.post(
      `${BASE_URL}/schemas/create`,
      upgradeSchema2
    );
    console.log("✅ 升级版本1.2.0创建成功:", upgrade2Response.data.message);
    console.log("");

    // 6. 执行升级迁移1.2.0
    console.log("6. 执行升级迁移1.2.0（应该添加更多列和索引）...");
    const upgrade2MigrationResponse = await axios.post(`${BASE_URL}/execute`, {
      table_name: "test_upgrade_logic",
      database_type: "main",
    });

    console.log(
      "✅ 升级迁移1.2.0成功:",
      upgrade2MigrationResponse.data.message
    );
    console.log("升级详情:", upgrade2MigrationResponse.data.data);
    console.log("");

    // 7. 再次执行相同版本的迁移（应该检测所有列和索引都已存在）
    console.log("7. 再次执行相同版本的迁移（测试幂等性）...");
    const idempotentMigrationResponse = await axios.post(
      `${BASE_URL}/execute`,
      {
        table_name: "test_upgrade_logic",
        database_type: "main",
      }
    );

    console.log("✅ 幂等性迁移成功:", idempotentMigrationResponse.data.message);
    console.log("幂等性详情:", idempotentMigrationResponse.data.data);

    console.log("\n🎉 表升级逻辑测试全部完成！");
  } catch (error) {
    console.error("❌ 测试失败:", error.response?.data || error.message);

    if (error.response?.data) {
      console.error("错误详情:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 执行测试
console.log("开始测试表升级逻辑...\n");
testUpgradeLogic();
