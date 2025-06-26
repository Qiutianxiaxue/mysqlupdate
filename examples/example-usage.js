// 示例：如何使用数据库自动升级工具

// 1. 创建用户表结构定义
const userTableSchema = {
  table_name: "users",
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
};

// 2. 创建订单表结构定义（门店分表）
const orderTableSchema = {
  table_name: "orders",
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
};

// 3. 创建日志表结构定义（时间分表）
const logTableSchema = {
  table_name: "system_logs",
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
};

// 使用示例：

// 1. 创建表结构定义
// POST /api/migration/schemas
// Body: userTableSchema

// 2. 执行迁移创建用户表
// POST /api/migration/execute
// Body: { "schema_id": 1 }

// 3. 创建门店分表
// POST /api/migration/partition/store
// Body: {
//   "table_definition": JSON.parse(orderTableSchema.schema_definition),
//   "store_ids": ["store_001", "store_002", "store_003"]
// }

// 4. 创建时间分表
// POST /api/migration/partition/time
// Body: {
//   "table_definition": JSON.parse(logTableSchema.schema_definition),
//   "start_date": "2024-01-01",
//   "end_date": "2024-12-31",
//   "interval": "month"
// }

console.log("示例数据结构已定义，请参考API文档进行调用");
