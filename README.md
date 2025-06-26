# MySQL 多租户数据库自动升级工具

这是一个基于 Node.js + TypeScript 的多租户数据库自动升级工具，支持 MySQL 数据库的表结构自动升级，包括门店分表和时间分表功能。

## 功能特性

- ✅ TypeScript 开发，类型安全
- ✅ 热更新开发环境
- ✅ Sequelize ORM 连接 MySQL
- ✅ **多租户数据库管理** - 支持每个企业独立的数据库配置
- ✅ **多数据库类型支持** - 主数据库、日志数据库、订单数据库、静态数据库
- ✅ 数据库表结构自动升级
- ✅ 支持门店分表
- ✅ 支持时间分表
- ✅ RESTful API 接口
- ✅ 完整的日志记录
- ✅ 错误处理和异常捕获
- ✅ 数据库连接池管理

## 多租户架构

### 企业表结构

系统使用 `qc_enterprise` 表存储企业信息，每个企业可以配置：

- **主数据库** - 存储用户、配置等核心数据
- **日志数据库** - 存储系统日志、操作日志等
- **订单数据库** - 存储订单、交易等业务数据
- **静态数据库** - 存储文件、资源等静态数据

### 数据库类型

- `main` - 主数据库
- `log` - 日志数据库
- `order` - 订单数据库
- `static` - 静态数据库

### 分表策略

- `none` - 不分表，所有数据存储在同一个表中
- `store` - 按门店分表，每个门店的数据存储在独立的表中
- `time` - 按时间分表，按月份或年份分表存储数据

## 项目结构

```code
mysqlupdate/
├── src/
│   ├── config/          # 配置文件
│   │   └── database.ts  # 数据库配置
│   ├── models/          # 数据模型
│   │   ├── TableSchema.ts  # 表结构定义模型
│   │   ├── Enterprise.ts   # 企业模型
│   │   └── index.ts     # 模型索引
│   ├── services/        # 业务逻辑
│   │   ├── DatabaseMigrationService.ts  # 数据库迁移服务
│   │   └── DatabaseConnectionManager.ts # 数据库连接管理器
│   ├── controllers/     # 控制器
│   │   └── MigrationController.ts  # 迁移控制器
│   ├── routes/          # 路由
│   │   └── migration.ts # 迁移相关路由
│   ├── utils/           # 工具函数
│   │   └── logger.ts    # 日志工具
│   ├── app.ts           # Express应用
│   └── index.ts         # 应用入口
├── examples/            # 使用示例
│   ├── example-usage.js # 基础使用示例
│   └── multi-tenant-example.js # 多租户使用示例
├── scripts/             # 初始化脚本
├── package.json         # 项目配置
├── tsconfig.json        # TypeScript配置
├── nodemon.json         # 热更新配置
└── README.md            # 详细文档
```

## 快速开始

### 1. 初始化项目

```bash
npm run setup
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `env.example` 为 `.env` 并修改数据库配置：

```bash
cp env.example .env
```

编辑 `.env` 文件：

```env
# 主数据库配置（用于存储企业信息和表结构定义）
DB_HOST=localhost
DB_PORT=3306
DB_NAME=mysql_update
DB_USER=root
DB_PASSWORD=your_password

# 应用配置
PORT=3000
NODE_ENV=development

# 日志配置
LOG_LEVEL=info
```

### 4. 创建企业表

在 MySQL 中创建企业表：

```sql
CREATE TABLE `qc_enterprise` (
  `enterprise_id` int NOT NULL AUTO_INCREMENT COMMENT '主键',
  `enterprise_key` varchar(255) NOT NULL COMMENT '企业KEY',
  `enterprise_code` int NOT NULL COMMENT '企业编号(六位数字编号)',
  `enterprise_name` varchar(255) DEFAULT NULL COMMENT '企业名称',
  `enterprise_logo` varchar(255) DEFAULT NULL COMMENT '企业logo',
  `database_name` varchar(255) DEFAULT 'enterprise' COMMENT '数据库名称',
  `database_hostname` varchar(255) NOT NULL DEFAULT '127.0.0.1',
  `database_username` varchar(255) NOT NULL DEFAULT 'root',
  `database_password` varchar(255) NOT NULL DEFAULT '123456',
  `database_hostport` varchar(255) NOT NULL DEFAULT '3306',
  `log_database_name` varchar(255) DEFAULT 'log_name' COMMENT '日志数据库名称',
  `log_database_hostname` varchar(255) DEFAULT '127.0.0.1',
  `log_database_username` varchar(255) DEFAULT 'root',
  `log_database_password` varchar(255) DEFAULT '123456',
  `log_database_hostport` varchar(255) DEFAULT '3306',
  `order_database_name` varchar(255) DEFAULT 'order_name',
  `order_database_hostname` varchar(255) DEFAULT '127.0.0.1',
  `order_database_username` varchar(255) DEFAULT 'root',
  `order_database_password` varchar(255) DEFAULT '123456',
  `order_database_hostport` varchar(255) DEFAULT '3306',
  `static_database_name` varchar(255) DEFAULT 'static_name',
  `static_database_hostname` varchar(255) DEFAULT '127.0.0.1',
  `static_database_username` varchar(255) DEFAULT 'root',
  `static_database_password` varchar(255) DEFAULT '123456',
  `static_database_hostport` varchar(255) DEFAULT '3306',
  `user_id` varchar(255) DEFAULT NULL COMMENT '企业归属用户ID',
  `status` tinyint NOT NULL DEFAULT '2' COMMENT '企业状态（2审核中1正常0禁用）',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`enterprise_id`),
  UNIQUE KEY `qc_enterprise_pk_2` (`enterprise_key`),
  UNIQUE KEY `qc_enterprise_pk_3` (`enterprise_code`),
  UNIQUE KEY `qc_enterprise_pk` (`database_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='企业表';
```

### 5. 启动开发服务器

```bash
npm run dev
```

### 6. 构建生产版本

```bash
npm run build
npm start
```

## API 接口

### 表结构定义管理

#### 创建表结构定义

```http
POST /api/migration/schemas
Content-Type: application/json

{
  "table_name": "users",
  "database_type": "main",
  "store_id": "store_001",
  "partition_type": "store",
  "partition_key": "store_id",
  "schema_version": "1.0.0",
  "schema_definition": "{\"tableName\":\"users\",\"columns\":[...]}"
}
```

#### 获取所有表结构定义

```http
GET /api/migration/schemas
```

#### 获取单个表结构定义

```http
GET /api/migration/schemas/:id
```

#### 更新表结构定义

```http
PUT /api/migration/schemas/:id
Content-Type: application/json

{
  "schema_version": "1.0.1",
  "schema_definition": "{\"tableName\":\"users\",\"columns\":[...]}"
}
```

#### 删除表结构定义

```http
DELETE /api/migration/schemas/:id
```

### 迁移执行

#### 为所有企业执行迁移

```http
POST /api/migration/execute
Content-Type: application/json

{
  "schema_id": 1
}
```

#### 为指定企业执行迁移

```http
POST /api/migration/execute/enterprise
Content-Type: application/json

{
  "schema_id": 1,
  "enterprise_id": 1
}
```

#### 批量执行迁移

```http
POST /api/migration/execute/batch
Content-Type: application/json

{
  "schema_ids": [1, 2, 3]
}
```

### 企业管理

#### 获取企业列表

```http
GET /api/migration/enterprises
```

### 连接管理

#### 获取连接统计信息

```http
GET /api/migration/connections/stats
```

#### 关闭所有数据库连接

```http
POST /api/migration/connections/close
```

## 表结构定义格式

表结构定义使用 JSON 格式，包含以下字段：

```json
{
  "tableName": "users",
  "columns": [
    {
      "name": "id",
      "type": "INT",
      "primaryKey": true,
      "autoIncrement": true,
      "allowNull": false
    },
    {
      "name": "username",
      "type": "VARCHAR",
      "length": 50,
      "allowNull": false,
      "unique": true,
      "comment": "用户名"
    },
    {
      "name": "email",
      "type": "VARCHAR",
      "length": 100,
      "allowNull": false,
      "unique": true,
      "comment": "邮箱"
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "allowNull": false,
      "defaultValue": "CURRENT_TIMESTAMP"
    }
  ],
  "indexes": [
    {
      "name": "idx_username",
      "fields": ["username"],
      "unique": true
    },
    {
      "name": "idx_email",
      "fields": ["email"],
      "unique": true
    }
  ]
}
```

## 多租户工作流程

### 1. 企业注册

企业在系统中注册时，会配置各个数据库的连接信息。

### 2. 表结构定义

管理员创建表结构定义，指定：

- 表名
- 数据库类型（main/log/order/static）
- 分表策略（none/store/time）
- 表结构详情

### 3. 自动迁移

当执行迁移时，系统会：

1. 读取所有正常状态的企业
2. 根据表结构定义的数据库类型，连接到对应企业的数据库
3. 创建或更新表结构
4. 支持分表策略（门店分表、时间分表）

### 4. 连接管理

系统自动管理数据库连接池，支持：

- 连接复用
- 连接健康检查
- 连接统计
- 优雅关闭

## 使用场景

这个工具特别适合：

- **SaaS 多租户系统** - 每个企业独立的数据库
- **多门店连锁系统** - 按门店分表存储数据
- **大数据量系统** - 按时间分表优化查询性能
- **需要频繁更新表结构的项目** - 自动化数据库升级
- **微服务架构** - 不同服务使用不同数据库

## 开发命令

```bash
# 开发模式（热更新）
npm run dev

# 构建项目
npm run build

# 启动生产服务器
npm start

# 运行测试
npm test

# 代码检查
npm run lint

# 自动修复代码格式
npm run lint:fix
```

## 日志

日志文件保存在 `logs/` 目录下：

- `error.log` - 错误日志
- `combined.log` - 所有日志

## 注意事项

1. 确保 MySQL 服务已启动且配置正确
2. 数据库用户需要有创建、修改表的权限
3. 生产环境请修改默认端口和数据库密码
4. 建议在测试环境充分测试后再部署到生产环境
5. 多租户模式下，确保每个企业的数据库连接信息正确
6. 定期检查数据库连接池状态，避免连接泄漏

## 许可证

MIT License
