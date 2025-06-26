const axios = require("axios");

async function testTimePartitionTableCheck() {
  const baseURL = "http://localhost:3000/api/migration";

  console.log("🕐 开始测试时间分区表的表名检查...\n");

  try {
    // 1. 创建时间分区表结构定义
    console.log("📝 步骤1: 创建时间分区表结构定义");
    const timePartitionSchema = {
      table_name: "debug_time_logs",
      partition_type: "time",
      database_type: "log",
      schema_version: "1.0",
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
          name: "log_level",
          type: "VARCHAR",
          length: 10,
          allowNull: false,
          comment: "日志级别",
        },
        {
          name: "message",
          type: "TEXT",
          allowNull: false,
          comment: "日志消息",
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
          name: "idx_log_level",
          fields: ["log_level"],
          unique: false,
        },
      ],
    };

    const createResponse = await axios.post(
      `${baseURL}/schemas/create`,
      timePartitionSchema
    );
    console.log("✅ 创建时间分区表结构:", createResponse.data);

    // 2. 第一次执行迁移（应该创建带时间后缀的表）
    console.log("\n🚀 步骤2: 第一次执行时间分区迁移");
    const firstMigration = await axios.post(`${baseURL}/execute`, {
      table_name: "debug_time_logs",
      database_type: "log",
    });
    console.log("✅ 第一次迁移完成:", firstMigration.data);

    // 等待3秒，让日志输出完整
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 3. 修改表结构，添加新字段
    console.log("\n🔄 步骤3: 修改表结构，添加新字段");
    const updatedSchema = {
      table_name: "debug_time_logs",
      partition_type: "time",
      database_type: "log",
      schema_version: "1.1",
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
          name: "log_level",
          type: "VARCHAR",
          length: 10,
          allowNull: false,
          comment: "日志级别",
        },
        {
          name: "message",
          type: "TEXT",
          allowNull: false,
          comment: "日志消息",
        },
        {
          name: "user_id", // 新增字段
          type: "BIGINT",
          allowNull: true,
          comment: "用户ID",
        },
        {
          name: "ip_address", // 新增字段
          type: "VARCHAR",
          length: 45,
          allowNull: true,
          comment: "IP地址",
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
          name: "idx_log_level",
          fields: ["log_level"],
          unique: false,
        },
        {
          name: "idx_user_id", // 新增索引
          fields: ["user_id"],
          unique: false,
        },
      ],
    };

    const updateResponse = await axios.post(
      `${baseURL}/schemas/create`,
      updatedSchema
    );
    console.log("✅ 更新表结构:", updateResponse.data);

    // 4. 第二次执行迁移（应该检测到带时间后缀的表并进行升级）
    console.log("\n🔧 步骤4: 第二次执行迁移（升级现有时间分区表）");
    console.log("📋 请注意观察日志中的表名检查过程...");

    const secondMigration = await axios.post(`${baseURL}/execute`, {
      table_name: "debug_time_logs",
      database_type: "log",
    });
    console.log("✅ 第二次迁移完成:", secondMigration.data);

    console.log("\n🎯 关键检查点:");
    console.log("1. 第一次迁移应该创建类似 'debug_time_logs_2024_12' 这样的表");
    console.log("2. 第二次迁移应该检测到该表存在并进行升级，而不是重新创建");
    console.log("3. 在日志中查找表存在性检查的结果");
  } catch (error) {
    console.error("❌ 测试失败:", error.message);
    if (error.response) {
      console.error("错误详情:", error.response.data);
    }
  }
}

// 运行测试
testTimePartitionTableCheck()
  .then(() => {
    console.log("\n✅ 时间分区表测试完成");
    console.log("📋 请检查日志输出，确认表名检查逻辑是否正确");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ 测试失败:", error);
    process.exit(1);
  });
