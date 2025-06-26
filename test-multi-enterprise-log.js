const axios = require("axios");

const BASE_URL = "http://localhost:3000/api/migration";

async function testMultiEnterpriseLogTable() {
  try {
    console.log("🚀 测试向所有企业log库添加新表...\n");

    // 1. 健康检查
    console.log("1️⃣ 健康检查...");
    const health = await axios.post(`${BASE_URL}/health`);
    console.log("✅ 服务器状态:", health.data.status);

    // 3. 创建log表的表结构定义
    console.log("\n3️⃣ 创建log表结构定义（用户操作日志表）...");
    const logTableSchema = {
      table_name: "user_operation_logs2",
      database_type: "log",
      partition_type: "time",
      // 时间分区配置
      time_interval: "month", // 按月分区
      time_start_date: "2024-01-01", // 开始时间
      time_end_date: "2025-12-31", // 结束时间
      time_format: "YYYYMM", // 自定义格式，如：user_operation_logs2_2024_12
      schema_version: "1.2.29",
      schema_definition: JSON.stringify({
        tableName: "user_operation_logs2",
        columns: [
          {
            name: "id",
            type: "BIGINT",
            primaryKey: true,
            autoIncrement: false,
            allowNull: false,
            comment: "主键ID11222221",
          },
          {
            name: "user_id",
            type: "BIGINT",
            allowNull: true,
            defaultValue: "12221",
            comment: "用户2222ID",
          },
          {
            name: "user_id22",
            type: "BIGINT",
            allowNull: false,
            comment: "用户ID22",
          },
          {
            name: "operation_type",
            type: "VARCHAR",
            length: 50,
            allowNull: false,
            comment: "操作类型：login, logout, create, update, delete等",
          },
          {
            name: "table_name",
            type: "VARCHAR",
            length: 100,
            allowNull: true,
            comment: "操作的表名",
          },
          {
            name: "record_id",
            type: "BIGINT",
            allowNull: true,
            comment: "操作的记录ID",
          },
          {
            name: "operation_data",
            type: "JSON",
            allowNull: true,
            comment: "操作相关数据（JSON格式）",
          },
          {
            name: "ip_address",
            type: "VARCHAR",
            length: 45,
            allowNull: true,
            comment: "操作者IP地址",
          },
          {
            name: "user_agent",
            type: "TEXT",
            allowNull: true,
            comment: "用户代理信息",
          },
          {
            name: "created_at",
            type: "TIMESTAMP",
            allowNull: false,
            defaultValue: "CURRENT_TIMESTAMP",
            comment: "创建时间",
          },
        ],
        indexes: [
          {
            name: "idx_user_id",
            fields: ["user_id"],
            comment: "用户ID索引",
          },
          {
            name: "idx_operation_type",
            fields: ["operation_type"],
            comment: "操作类型索引",
          },
          {
            name: "idx_table_record",
            fields: ["table_name", "record_id"],
            comment: "表名和记录ID组合索引",
          },
          {
            name: "idx_user_time",
            fields: ["user_id", "created_at"],
            comment: "用户时间组合索引，便于查询用户操作历史",
          },
        ],
      }),
    };

    const schemaResponse = await axios.post(
      `${BASE_URL}/schemas/create`,
      logTableSchema,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ log表结构定义创建成功");

    const migrateResponse = await axios.post(`${BASE_URL}/execute`, {
      table_name: "user_operation_logs2",
      database_type: "log",
      partition_type: "time",
    });

    // // 4. 向所有企业的log库执行迁移
    // console.log("\n4️⃣ 向所有企业的log库执行迁移...");

    // let successCount = 0;
    // let failCount = 0;
    // const results = [];

    // for (let i = 0; i < enterprises.length; i++) {
    //   const enterprise = enterprises[i];
    //   console.log(
    //     `\n   ${i + 1}/${enterprises.length} 处理企业: ${
    //       enterprise.enterprise_name
    //     }`
    //   );

    //   try {
    //     // 使用统一迁移接口
    //     const migrateResponse = await axios.post(`${BASE_URL}/execute`, {
    //       table_name: "user_operation_logs",
    //       database_type: "log",
    //       schema_version: "1.0.0",
    //     });

    //     console.log(`   ✅ ${enterprise.enterprise_name} - 迁移成功`);
    //     successCount++;
    //     results.push({
    //       enterprise: enterprise.enterprise_name,
    //       status: "success",
    //       message: "表创建成功",
    //     });

    //     // 添加小延时，避免数据库连接过多
    //     await new Promise((resolve) => setTimeout(resolve, 100));
    //   } catch (error) {
    //     console.log(
    //       `   ❌ ${enterprise.enterprise_name} - 迁移失败:`,
    //       error.response?.data?.message || error.message
    //     );
    //     failCount++;
    //     results.push({
    //       enterprise: enterprise.enterprise_name,
    //       status: "failed",
    //       message: error.response?.data?.message || error.message,
    //     });
    //   }
    // }

    // // 5. 汇总结果
    // console.log("\n5️⃣ 迁移结果汇总:");
    // console.log(`   ✅ 成功: ${successCount} 个企业`);
    // console.log(`   ❌ 失败: ${failCount} 个企业`);
    // console.log(`   📊 总计: ${enterprises.length} 个企业`);

    // if (failCount > 0) {
    //   console.log("\n❌ 失败详情:");
    //   results
    //     .filter((r) => r.status === "failed")
    //     .forEach((result, index) => {
    //       console.log(
    //         `   ${index + 1}. ${result.enterprise}: ${result.message}`
    //       );
    //     });
    // }

    // // 6. 测试重复执行（验证幂等性）
    // console.log("\n6️⃣ 测试重复执行（验证幂等性）...");
    // try {
    //   const repeatMigrate = await axios.post(`${BASE_URL}/execute`, {
    //     table_name: "user_operation_logs",
    //     database_type: "log",
    //     schema_version: "1.0.0",
    //   });
    //   console.log("✅ 重复迁移测试通过（智能跳过已存在的表）");
    // } catch (error) {
    //   console.log(
    //     "⚠️  重复迁移测试:",
    //     error.response?.data?.message || error.message
    //   );
    // }

    // // 7. 使用兼容接口测试
    // console.log("\n7️⃣ 测试兼容接口（通过schema_id）...");
    // try {
    //   const compatibleMigrate = await axios.post(`${BASE_URL}/execute/schema`, {
    //     schema_id: schemaId,
    //   });
    //   console.log("✅ 兼容接口测试通过");
    // } catch (error) {
    //   console.log(
    //     "⚠️  兼容接口测试:",
    //     error.response?.data?.message || error.message
    //   );
    // }

    // // 8. 查看表结构历史
    // console.log("\n8️⃣ 查看表结构历史...");
    // try {
    //   const history = await axios.get(
    //     `${BASE_URL}/schemas/history?table_name=user_operation_logs&database_type=log`
    //   );
    //   console.log("✅ 表结构历史:");
    //   history.data.data.forEach((schema, index) => {
    //     console.log(
    //       `   ${index + 1}. 版本: ${schema.schema_version}, 状态: ${
    //         schema.is_active ? "✅激活" : "❌非激活"
    //       }, 创建时间: ${schema.created_at}`
    //     );
    //   });
    // } catch (error) {
    //   console.log(
    //     "⚠️  历史查询:",
    //     error.response?.data?.message || error.message
    //   );
    // }

    // // 9. 获取连接统计信息
    // console.log("\n9️⃣ 查看数据库连接统计...");
    // try {
    //   const stats = await axios.get(`${BASE_URL}/connections/stats`);
    //   console.log("✅ 连接统计:", JSON.stringify(stats.data.data, null, 2));
    // } catch (error) {
    //   console.log(
    //     "⚠️  连接统计查询失败:",
    //     error.response?.data?.message || error.message
    //   );
    // }

    // console.log("\n🎉 多企业log库表迁移测试完成！");
    // console.log("✨ 测试覆盖功能：");
    // console.log("   - ✅ 多企业数据库连接");
    // console.log("   - ✅ log库表结构创建");
    // console.log("   - ✅ 批量迁移执行");
    // console.log("   - ✅ 错误处理和汇总");
    // console.log("   - ✅ 幂等性验证");
    // console.log("   - ✅ 兼容接口测试");
    // console.log("   - ✅ 版本历史管理");
    // console.log("   - ✅ 连接池统计");

    // if (successCount === enterprises.length) {
    //   console.log("🏆 所有企业迁移成功！");
    // } else {
    //   console.log(`⚠️  ${failCount} 个企业迁移失败，请检查数据库连接配置`);
    // }
  } catch (error) {
    console.error("❌ 测试失败:", error.response?.data || error.message);
    if (error.response?.data) {
      console.error("详细错误:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 运行测试
testMultiEnterpriseLogTable();
