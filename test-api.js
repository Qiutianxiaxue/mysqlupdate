const axios = require("axios");

// 配置
const BASE_URL = "http://localhost:3000/api/migration";
const API_TIMEOUT = 30000; // 30秒超时

// 创建axios实例
const api = axios.create({
  baseURL: BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
});

// 测试数据
const testData = {
  // 用户表结构定义（主数据库）
  userTableSchema: {
    table_name: "users",
    database_type: "main",
    partition_type: "none",
    schema_version: "1.0.0",
    schema_definition: JSON.stringify({
      tableName: "users",
      columns: [
        {
          name: "id",
          type: "INT",
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        {
          name: "username",
          type: "VARCHAR",
          length: 50,
          allowNull: false,
          unique: true,
          comment: "用户名",
        },
        {
          name: "email",
          type: "VARCHAR",
          length: 100,
          allowNull: false,
          unique: true,
          comment: "邮箱",
        },
        {
          name: "password",
          type: "VARCHAR",
          length: 255,
          allowNull: false,
          comment: "密码",
        },
        {
          name: "status",
          type: "TINYINT",
          allowNull: false,
          defaultValue: 1,
          comment: "状态：1-启用，0-禁用",
        },
        {
          name: "created_at",
          type: "TIMESTAMP",
          allowNull: false,
          defaultValue: "CURRENT_TIMESTAMP",
        },
        {
          name: "updated_at",
          type: "TIMESTAMP",
          allowNull: false,
          defaultValue: "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        },
      ],
      indexes: [
        {
          name: "idx_username",
          fields: ["username"],
          unique: true,
        },
        {
          name: "idx_email",
          fields: ["email"],
          unique: true,
        },
        {
          name: "idx_status",
          fields: ["status"],
        },
      ],
    }),
  },

  // 订单表结构定义（订单数据库）
  orderTableSchema: {
    table_name: "orders",
    database_type: "order",
    partition_type: "store",
    partition_key: "store_id",
    schema_version: "1.0.0",
    schema_definition: JSON.stringify({
      tableName: "orders",
      columns: [
        {
          name: "id",
          type: "BIGINT",
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        {
          name: "order_no",
          type: "VARCHAR",
          length: 32,
          allowNull: false,
          unique: true,
          comment: "订单号",
        },
        {
          name: "store_id",
          type: "VARCHAR",
          length: 50,
          allowNull: false,
          comment: "门店ID",
        },
        {
          name: "user_id",
          type: "INT",
          allowNull: false,
          comment: "用户ID",
        },
        {
          name: "total_amount",
          type: "DECIMAL",
          length: "10,2",
          allowNull: false,
          defaultValue: "0.00",
          comment: "订单总金额",
        },
        {
          name: "status",
          type: "TINYINT",
          allowNull: false,
          defaultValue: 0,
          comment: "订单状态：0-待支付，1-已支付，2-已发货，3-已完成，4-已取消",
        },
        {
          name: "created_at",
          type: "TIMESTAMP",
          allowNull: false,
          defaultValue: "CURRENT_TIMESTAMP",
        },
        {
          name: "updated_at",
          type: "TIMESTAMP",
          allowNull: false,
          defaultValue: "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        },
      ],
      indexes: [
        {
          name: "idx_order_no",
          fields: ["order_no"],
          unique: true,
        },
        {
          name: "idx_store_id",
          fields: ["store_id"],
        },
        {
          name: "idx_user_id",
          fields: ["user_id"],
        },
        {
          name: "idx_status",
          fields: ["status"],
        },
        {
          name: "idx_created_at",
          fields: ["created_at"],
        },
      ],
    }),
  },

  // 日志表结构定义（日志数据库）
  logTableSchema: {
    table_name: "system_logs",
    database_type: "log",
    partition_type: "time",
    partition_key: "created_at",
    schema_version: "1.0.0",
    schema_definition: JSON.stringify({
      tableName: "system_logs",
      columns: [
        {
          name: "id",
          type: "BIGINT",
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        {
          name: "level",
          type: "VARCHAR",
          length: 10,
          allowNull: false,
          comment: "日志级别：INFO, WARN, ERROR, DEBUG",
        },
        {
          name: "module",
          type: "VARCHAR",
          length: 50,
          allowNull: false,
          comment: "模块名称",
        },
        {
          name: "message",
          type: "TEXT",
          allowNull: false,
          comment: "日志消息",
        },
        {
          name: "details",
          type: "JSON",
          allowNull: true,
          comment: "详细信息",
        },
        {
          name: "ip_address",
          type: "VARCHAR",
          length: 45,
          allowNull: true,
          comment: "IP地址",
        },
        {
          name: "user_agent",
          type: "VARCHAR",
          length: 500,
          allowNull: true,
          comment: "用户代理",
        },
        {
          name: "created_at",
          type: "TIMESTAMP",
          allowNull: false,
          defaultValue: "CURRENT_TIMESTAMP",
        },
      ],
      indexes: [
        {
          name: "idx_level",
          fields: ["level"],
        },
        {
          name: "idx_module",
          fields: ["module"],
        },
        {
          name: "idx_created_at",
          fields: ["created_at"],
        },
        {
          name: "idx_level_created_at",
          fields: ["level", "created_at"],
        },
      ],
    }),
  },
};

// 工具函数
function log(message, data = null) {
  console.log(`[${new Date().toISOString()}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
  console.log("---");
}

function logError(message, error = null) {
  console.error(`[${new Date().toISOString()}] ❌ ${message}`);
  if (error) {
    console.error(error.response?.data || error.message);
  }
  console.log("---");
}

// API测试函数
async function testHealthCheck() {
  try {
    log("🔍 测试健康检查...");
    const response = await axios.get("http://localhost:3000/health");
    log("✅ 健康检查成功", response.data);
    return true;
  } catch (error) {
    logError("❌ 健康检查失败", error);
    return false;
  }
}

async function createTableSchema(schemaData) {
  try {
    log(`📝 创建表结构定义: ${schemaData.table_name}`);
    const response = await api.post("/schemas", schemaData);
    log("✅ 表结构定义创建成功", response.data);
    return response.data.data.id;
  } catch (error) {
    logError("❌ 表结构定义创建失败", error);
    return null;
  }
}

async function getAllTableSchemas() {
  try {
    log("📋 获取所有表结构定义...");
    const response = await api.get("/schemas");
    log("✅ 获取表结构定义成功", response.data);
    return response.data.data;
  } catch (error) {
    logError("❌ 获取表结构定义失败", error);
    return [];
  }
}

async function executeMigration(schemaId) {
  try {
    log(`🚀 执行迁移: schema_id = ${schemaId}`);
    const response = await api.post("/execute", { schema_id: schemaId });
    log("✅ 迁移执行成功", response.data);
    return response.data;
  } catch (error) {
    logError("❌ 迁移执行失败", error);
    return null;
  }
}

async function getEnterprises() {
  try {
    log("🏢 获取企业列表...");
    const response = await api.get("/enterprises");
    log("✅ 获取企业列表成功", response.data);
    return response.data.data;
  } catch (error) {
    logError("❌ 获取企业列表失败", error);
    return [];
  }
}

async function getConnectionStats() {
  try {
    log("📊 获取连接统计信息...");
    const response = await api.get("/connections/stats");
    log("✅ 获取连接统计成功", response.data);
    return response.data.data;
  } catch (error) {
    logError("❌ 获取连接统计失败", error);
    return null;
  }
}

async function closeAllConnections() {
  try {
    log("🔒 关闭所有数据库连接...");
    const response = await api.post("/connections/close");
    log("✅ 关闭连接成功", response.data);
    return true;
  } catch (error) {
    logError("❌ 关闭连接失败", error);
    return false;
  }
}

// 主测试函数
async function runTests() {
  console.log("🚀 开始API测试...\n");

  // 1. 健康检查
  const isHealthy = await testHealthCheck();
  if (!isHealthy) {
    console.log("❌ 服务器未启动或无法访问，请先启动服务器: npm run dev");
    return;
  }

  // 2. 创建表结构定义
  const schemaIds = [];

  // 创建用户表结构定义
  const userSchemaId = await createTableSchema(testData.userTableSchema);
  if (userSchemaId) schemaIds.push(userSchemaId);

  // 创建订单表结构定义
  const orderSchemaId = await createTableSchema(testData.orderTableSchema);
  if (orderSchemaId) schemaIds.push(orderSchemaId);

  // 创建日志表结构定义
  const logSchemaId = await createTableSchema(testData.logTableSchema);
  if (logSchemaId) schemaIds.push(logSchemaId);

  // 3. 获取所有表结构定义
  await getAllTableSchemas();

  // 4. 获取企业列表
  const enterprises = await getEnterprises();

  if (enterprises.length === 0) {
    console.log("⚠️  没有找到企业数据，请先在数据库中创建企业记录");
    console.log("参考SQL:");
    console.log(`
INSERT INTO qc_enterprise (
  enterprise_key, enterprise_code, enterprise_name, 
  database_name, database_hostname, database_username, database_password, database_hostport,
  status, create_time, update_time
) VALUES (
  'test_enterprise', 100001, '测试企业',
  'test_db', 'localhost', 'root', '123456', '3306',
  1, NOW(), NOW()
);
    `);
  }

  // 5. 执行迁移（如果有schema_id）
  if (schemaIds.length > 0) {
    for (const schemaId of schemaIds) {
      await executeMigration(schemaId);
    }
  }

  // 6. 获取连接统计
  await getConnectionStats();

  // 7. 关闭所有连接
  await closeAllConnections();

  console.log("🎉 API测试完成！");
}

// 运行测试
runTests().catch((error) => {
  console.error("❌ 测试过程中发生错误:", error);
  process.exit(1);
});
