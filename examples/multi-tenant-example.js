// 多租户数据库自动升级示例

// 1. 创建用户表结构定义（主数据库）
const userTableSchema = {
  table_name: "users",
  database_type: "main", // 主数据库
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

// 2. 创建订单表结构定义（订单数据库）
const orderTableSchema = {
  table_name: "orders",
  database_type: "order", // 订单数据库
  partition_type: "store",

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

// 3. 创建日志表结构定义（日志数据库）
const logTableSchema = {
  table_name: "system_logs",
  database_type: "log", // 日志数据库
  partition_type: "time",
  // 时间分区配置
  time_interval: "month",
  time_start_date: "2024-01-01",
  time_end_date: "2024-12-31",
  time_format: "_YYYY_MM",
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

// 4. 创建静态资源表结构定义（静态数据库）
const staticTableSchema = {
  table_name: "static_resources",
  database_type: "static", // 静态数据库
  partition_type: "none",
  schema_version: "1.0.0",
  schema_definition: JSON.stringify({
    tableName: "static_resources",
    columns: [
      {
        name: "id",
        type: "BIGINT",
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      {
        name: "resource_type",
        type: "VARCHAR",
        length: 20,
        allowNull: false,
        comment: "资源类型：image, video, document, other",
      },
      {
        name: "file_name",
        type: "VARCHAR",
        length: 255,
        allowNull: false,
        comment: "文件名",
      },
      {
        name: "file_path",
        type: "VARCHAR",
        length: 500,
        allowNull: false,
        comment: "文件路径",
      },
      {
        name: "file_size",
        type: "BIGINT",
        allowNull: false,
        defaultValue: 0,
        comment: "文件大小（字节）",
      },
      {
        name: "mime_type",
        type: "VARCHAR",
        length: 100,
        allowNull: true,
        comment: "MIME类型",
      },
      {
        name: "md5_hash",
        type: "VARCHAR",
        length: 32,
        allowNull: true,
        comment: "MD5哈希值",
      },
      {
        name: "status",
        type: "TINYINT",
        allowNull: false,
        defaultValue: 1,
        comment: "状态：1-正常，0-删除",
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
        name: "idx_resource_type",
        fields: ["resource_type"],
      },
      {
        name: "idx_file_name",
        fields: ["file_name"],
      },
      {
        name: "idx_md5_hash",
        fields: ["md5_hash"],
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

// 使用示例：

// 1. 创建表结构定义
// POST /api/migration/schemas
// Body: userTableSchema

// 2. 为所有企业执行迁移（自动连接到每个企业的对应数据库）
// POST /api/migration/execute
// Body: { "schema_id": 1 }

// 3. 为指定企业执行迁移
// POST /api/migration/execute/enterprise
// Body: { "schema_id": 1, "enterprise_id": 1 }

// 4. 批量执行迁移
// POST /api/migration/execute/batch
// Body: { "schema_ids": [1, 2, 3, 4] }

// 5. 获取企业列表
// GET /api/migration/enterprises

// 6. 获取连接统计信息
// GET /api/migration/connections/stats

// 7. 关闭所有数据库连接
// POST /api/migration/connections/close

console.log("多租户示例数据结构已定义，请参考API文档进行调用");

// 数据库类型说明：
// - main: 主数据库，存储用户、配置等核心数据
// - log: 日志数据库，存储系统日志、操作日志等
// - order: 订单数据库，存储订单、交易等业务数据
// - static: 静态数据库，存储文件、资源等静态数据

// 分表策略：
// - none: 不分表，所有数据存储在同一个表中
// - store: 按门店分表，每个门店的数据存储在独立的表中
// - time: 按时间分表，按月份或年份分表存储数据
