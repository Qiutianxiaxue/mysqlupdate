const axios = require("axios");

// API基础URL
const BASE_URL = "http://localhost:3000/api/migration";

/**
 * 测试表结构升级功能
 */
async function testUpgrade() {
  try {
    console.log("🔧 测试表结构升级功能...\n");

    // // 1. 创建初始表结构定义
    // console.log("1️⃣ 创建初始表结构定义...");
    // const timestamp = Date.now();
    // const initialSchemaData = {
    //   table_name: `upgrade_test_${timestamp}`,
    //   database_type: "main",
    //   partition_type: "none",
    //   schema_version: "1.0.0",
    //   schema_definition: JSON.stringify({
    //     tableName: `upgrade_test_${timestamp}`,
    //     columns: [
    //       {
    //         name: "id",
    //         type: "BIGINT",
    //         primaryKey: true,
    //         autoIncrement: true,
    //         allowNull: false,
    //         comment: "主键ID",
    //       },
    //       {
    //         name: "name",
    //         type: "VARCHAR",
    //         length: 100,
    //         allowNull: false,
    //         comment: "名称",
    //       },
    //       {
    //         name: "status",
    //         type: "TINYINT",
    //         allowNull: false,
    //         defaultValue: 1,
    //         comment: "状态",
    //       },
    //       {
    //         name: "created_at",
    //         type: "TIMESTAMP",
    //         allowNull: false,
    //         defaultValue: "CURRENT_TIMESTAMP",
    //         comment: "创建时间",
    //       },
    //     ],
    //     indexes: [
    //       {
    //         name: "idx_name",
    //         fields: ["name"],
    //       },
    //     ],
    //   }),
    // };

    // const initialResponse = await axios.post(
    //   `${BASE_URL}/schemas`,
    //   initialSchemaData
    // );
    // const schemaId = initialResponse.data.data.id;
    // console.log("✅ 初始表结构定义创建成功:", schemaId);

    // // 2. 执行初始迁移
    // console.log("\n2️⃣ 执行初始迁移...");
    // const initialMigrationData = { schema_id: schemaId };
    // const initialMigrationResponse = await axios.post(
    //   `${BASE_URL}/execute`,
    //   initialMigrationData
    // );
    // console.log("✅ 初始迁移执行成功");

    // // 3. 升级表结构（添加新列和索引）
    // console.log("\n3️⃣ 升级表结构定义...");
    // const upgradeSchemaData = {
    //   schema_version: "1.1.0",
    //   upgrade_notes: "添加email字段和status索引",
    //   schema_definition: JSON.stringify({
    //     tableName: `upgrade_test_${timestamp}`,
    //     columns: [
    //       {
    //         name: "id",
    //         type: "BIGINT",
    //         primaryKey: true,
    //         autoIncrement: true,
    //         allowNull: false,
    //         comment: "主键ID",
    //       },
    //       {
    //         name: "name",
    //         type: "VARCHAR",
    //         length: 100,
    //         allowNull: false,
    //         comment: "名称",
    //       },
    //       {
    //         name: "email",
    //         type: "VARCHAR",
    //         length: 255,
    //         allowNull: true,
    //         comment: "邮箱地址",
    //       },
    //       {
    //         name: "status",
    //         type: "TINYINT",
    //         allowNull: false,
    //         defaultValue: 1,
    //         comment: "状态",
    //       },
    //       {
    //         name: "created_at",
    //         type: "TIMESTAMP",
    //         allowNull: false,
    //         defaultValue: "CURRENT_TIMESTAMP",
    //         comment: "创建时间",
    //       },
    //       {
    //         name: "updated_at",
    //         type: "TIMESTAMP",
    //         allowNull: false,
    //         defaultValue: "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    //         comment: "更新时间",
    //       },
    //     ],
    //     indexes: [
    //       {
    //         name: "idx_name",
    //         fields: ["name"],
    //       },
    //       {
    //         name: "idx_status",
    //         fields: ["status"],
    //       },
    //       {
    //         name: "idx_email",
    //         fields: ["email"],
    //       },
    //     ],
    //   }),
    // };

    // const upgradeResponse = await axios.post(
    //   `${BASE_URL}/schemas/${schemaId}/upgrade`,
    //   upgradeSchemaData
    // );
    // const newSchemaId = upgradeResponse.data.data.id;
    // console.log("✅ 表结构升级成功:", newSchemaId);

    // 4. 执行升级迁移
    console.log("\n4️⃣ 执行升级迁移...");
    const upgradeMigrationData = { schema_id: 2 };
    const upgradeMigrationResponse = await axios.post(
      `${BASE_URL}/execute`,
      upgradeMigrationData
    );
    console.log("✅ 升级迁移执行成功");

    // 5. 查看表结构历史
    console.log("\n5️⃣ 查看表结构历史...");
    const historyResponse = await axios.get(
      `${BASE_URL}/schemas/history?table_name=upgrade_test_${timestamp}&database_type=main`
    );
    const history = historyResponse.data.data;
    console.log("✅ 表结构历史:");
    history.forEach((schema) => {
      console.log(
        `   版本: ${schema.schema_version}, 状态: ${
          schema.is_active ? "激活" : "非激活"
        }, 说明: ${schema.upgrade_notes || "无"}`
      );
    });

    // 6. 再次升级（修改列属性）
    console.log("\n6️⃣ 再次升级表结构（修改列属性）...");
    const secondUpgradeData = {
      schema_version: "1.2.0",
      upgrade_notes: "修改name字段长度，添加description字段",
      schema_definition: JSON.stringify({
        tableName: `upgrade_test_${timestamp}`,
        columns: [
          {
            name: "id",
            type: "BIGINT",
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
            comment: "主键ID",
          },
          {
            name: "name",
            type: "VARCHAR",
            length: 200, // 增加长度
            allowNull: false,
            comment: "名称",
          },
          {
            name: "email",
            type: "VARCHAR",
            length: 255,
            allowNull: true,
            comment: "邮箱地址",
          },
          {
            name: "description",
            type: "TEXT",
            allowNull: true,
            comment: "描述信息",
          },
          {
            name: "status",
            type: "TINYINT",
            allowNull: false,
            defaultValue: 1,
            comment: "状态",
          },
          {
            name: "created_at",
            type: "TIMESTAMP",
            allowNull: false,
            defaultValue: "CURRENT_TIMESTAMP",
            comment: "创建时间",
          },
          {
            name: "updated_at",
            type: "TIMESTAMP",
            allowNull: false,
            defaultValue: "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
            comment: "更新时间",
          },
        ],
        indexes: [
          {
            name: "idx_name",
            fields: ["name"],
          },
          {
            name: "idx_status",
            fields: ["status"],
          },
          {
            name: "idx_email",
            fields: ["email"],
          },
          {
            name: "idx_name_status",
            fields: ["name", "status"],
          },
        ],
      }),
    };

    const secondUpgradeResponse = await axios.post(
      `${BASE_URL}/schemas/${newSchemaId}/upgrade`,
      secondUpgradeData
    );
    const finalSchemaId = secondUpgradeResponse.data.data.id;
    console.log("✅ 第二次升级成功:", finalSchemaId);

    // 7. 执行最终迁移
    console.log("\n7️⃣ 执行最终迁移...");
    const finalMigrationData = { schema_id: finalSchemaId };
    const finalMigrationResponse = await axios.post(
      `${BASE_URL}/execute`,
      finalMigrationData
    );
    console.log("✅ 最终迁移执行成功");

    console.log("\n🎉 表结构升级功能测试完成！");
    console.log("📊 升级总结:");
    console.log(`   - 初始版本: 1.0.0 (${schemaId})`);
    console.log(`   - 升级版本1: 1.1.0 (${newSchemaId}) - 添加email字段和索引`);
    console.log(
      `   - 升级版本2: 1.2.0 (${finalSchemaId}) - 修改name长度，添加description字段`
    );
  } catch (error) {
    if (error.response) {
      console.error("❌ API错误:", error.response.status, error.response.data);
    } else {
      console.error("❌ 网络错误:", error.message);
    }
  }
}

// 运行测试
testUpgrade();
