# MySQL 多租户数据库自动升级系统

基于 Node.js 和 TypeScript 的多租户数据库自动升级系统，支持表结构版本化管理、自动创建数据库、按门店和时间分表、热更新等功能。

## 功能特性

- ✅ **多租户支持**：每个企业独立数据库连接配置
- ✅ **表结构版本化管理**：支持表结构定义升级和版本控制
- ✅ **自动数据库创建**：企业数据库不存在时自动创建
- ✅ **智能迁移逻辑**：统一的创建/升级逻辑，避免重复操作
- ✅ **分表支持**：支持按门店分表和时间分表
- ✅ **热更新**：开发环境支持代码热更新
- ✅ **详细日志**：完整的操作日志记录
- ✅ **RESTful API**：提供完整的 API 接口

## 系统架构

### 核心组件

1. **DatabaseConnectionManager**：管理多租户数据库连接
2. **DatabaseMigrationService**：统一的表迁移服务
3. **MigrationController**：API 控制器
4. **Enterprise Model**：企业信息模型
5. **TableSchema Model**：表结构定义模型

### 迁移逻辑

系统采用统一的迁移逻辑，通过表名、数据库类型和版本号来确定操作：

```
1. 获取表结构定义（根据表名、数据库类型、版本号）
2. 遍历所有企业
3. 根据分区类型处理：
   ├─ 普通表：直接迁移
   ├─ 门店分表：为每个门店创建分表
   └─ 时间分表：按时间创建分表
4. 检查表是否存在：
   ├─ 不存在：创建表
   └─ 存在：升级表（添加缺失的列和索引）
```

## 完整工作流程

### 1. 创建表结构定义

```bash
curl -X POST http://localhost:3000/api/migration/schemas \
  -H "Content-Type: application/json" \
  -d '{
    "table_name": "users",
    "database_type": "main",
    "schema_version": "1.0.0",
    "schema_definition": "{\"tableName\":\"users\",\"columns\":[{\"name\":\"id\",\"type\":\"BIGINT\",\"primaryKey\":true,\"autoIncrement\":true,\"allowNull\":false}]}"
  }'
```

### 2. 执行迁移

```bash
curl -X POST http://localhost:3000/api/migration/execute \
  -H "Content-Type: application/json" \
  -d '{
    "table_name": "users",
    "database_type": "main",
    "schema_version": "1.0.0"
  }'
```

### 3. 版本升级

#### 3.1 创建新版本表结构定义

```bash
curl -X POST http://localhost:3000/api/migration/schemas \
  -H "Content-Type: application/json" \
  -d '{
    "table_name": "users",
    "database_type": "main",
    "schema_version": "1.1.0",
    "schema_definition": "{\"tableName\":\"users\",\"columns\":[{\"name\":\"id\",\"type\":\"BIGINT\",\"primaryKey\":true},{\"name\":\"email\",\"type\":\"VARCHAR\",\"length\":100}]}"
  }'
```

#### 3.2 将旧版本标记为非激活

```bash
curl -X PUT http://localhost:3000/api/migration/schemas/1 \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}'
```

#### 3.3 执行升级迁移

```bash
curl -X POST http://localhost:3000/api/migration/execute \
  -H "Content-Type: application/json" \
  -d '{
    "table_name": "users",
    "database_type": "main",
    "schema_version": "1.1.0"
  }'
```

### 4. 自动使用最新版本

```bash
curl -X POST http://localhost:3000/api/migration/execute \
  -H "Content-Type: application/json" \
  -d '{
    "table_name": "users",
    "database_type": "main"
  }'
```

> 不指定版本号时，系统会自动使用当前激活的最新版本

## 快速开始

### 环境要求

- Node.js 16+
- MySQL 5.7+
- TypeScript 4.5+

### 安装依赖

```bash
npm install
```

### 环境配置

复制环境变量文件并配置：

```bash
cp env.example .env
```

编辑 `.env` 文件：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=123456
DB_NAME=mysql_update

# 应用配置
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

### 启动服务

```bash
# 开发模式（支持热更新）
npm run dev

# 生产模式
npm run build
npm start
```

## API 接口

### 迁移执行

#### 统一迁移接口（推荐）

```http
POST /api/migration/execute
Content-Type: application/json

{
  "table_name": "users",
  "database_type": "main",
  "schema_version": "1.0.0"  // 可选，不指定则使用最新版本
}
```

#### 兼容接口（通过 Schema ID）

```http
POST /api/migration/execute/schema
Content-Type: application/json

{
  "schema_id": 1
}
```

**注意**：两个接口都使用统一的迁移逻辑，会自动判断表是否存在并执行相应操作：

- 表不存在：创建新表
- 表存在：智能升级（只添加缺失的列和索引）

### 表结构定义管理

#### 创建表结构定义

```http
POST /api/migration/schemas
GET /api/migration/schemas/{id}
GET /api/migration/schemas/history?table_name=users&database_type=main
```

#### 更新表结构定义

```http
PUT /api/migration/schemas/{id}
Content-Type: application/json

{
  "schema_version": "1.1.0",
  "schema_definition": "{\"tableName\":\"users\",\"columns\":[...],\"indexes\":[...]}"
}
```

#### 删除表结构定义

```http
DELETE /api/migration/schemas/{id}
```

### 企业管理

#### 创建企业

```http
POST /api/migration/enterprises
Content-Type: application/json

{
  "enterprise_key": "test_enterprise_001",
  "enterprise_name": "测试企业001",
  "database_name": "test_enterprise_001",
  "database_hostname": "localhost",
  "database_username": "root",
  "database_password": "123456"
}
```

#### 获取企业列表

```http
GET /api/migration/enterprises
```

### 系统管理

#### 健康检查

```http
GET /api/migration/health
```

#### 连接统计

```http
GET /api/migration/connections/stats
```

#### 关闭所有连接

```http
POST /api/migration/connections/close
```

## 使用示例

### 1. 创建企业

```bash
node scripts/create-enterprise.js
```

### 2. 创建表结构定义

```bash
node test-api.js
```

### 3. 执行迁移

```bash
# 使用统一接口
curl -X POST http://localhost:3000/api/migration/execute \
  -H "Content-Type: application/json" \
  -d '{"table_name":"users","database_type":"main"}'

# 使用兼容接口
curl -X POST http://localhost:3000/api/migration/execute/schema \
  -H "Content-Type: application/json" \
  -d '{"schema_id":1}'
```

### 4. 测试升级逻辑

```bash
node test-unified-migration.js
```

## 表结构定义格式

### 基本格式

```json
{
  "tableName": "users",
  "columns": [
    {
      "name": "id",
      "type": "BIGINT",
      "primaryKey": true,
      "autoIncrement": true,
      "allowNull": false,
      "comment": "主键ID"
    },
    {
      "name": "username",
      "type": "VARCHAR",
      "length": 50,
      "allowNull": false,
      "unique": true,
      "comment": "用户名"
    }
  ],
  "indexes": [
    {
      "name": "idx_username",
      "fields": ["username"],
      "unique": true
    }
  ]
}
```

### 支持的数据类型

- `VARCHAR(length)`
- `INT`
- `BIGINT`
- `TINYINT`
- `DECIMAL(length,scale)`
- `TEXT`
- `JSON`
- `TIMESTAMP`

### 特殊默认值

- `CURRENT_TIMESTAMP`
- `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`

## 分区类型

### 门店分表

```json
{
  "table_name": "orders",
  "database_type": "order",
  "partition_type": "store",
  "partition_key": "store_id"
}
```

### 时间分表

```json
{
  "table_name": "system_logs",
  "database_type": "log",
  "partition_type": "time",
  "partition_key": "created_at"
}
```

## 开发指南

### 项目结构

```
src/
├── app.ts                 # Express应用主文件
├── index.ts              # 应用入口文件
├── config/
│   └── database.ts       # 数据库配置
├── controllers/
│   └── MigrationController.ts  # API控制器
├── models/
│   ├── Enterprise.ts     # 企业模型
│   ├── TableSchema.ts    # 表结构定义模型
│   └── index.ts          # 模型索引
├── routes/
│   └── migration.ts      # 路由定义
├── services/
│   ├── DatabaseConnectionManager.ts  # 数据库连接管理
│   └── DatabaseMigrationService.ts   # 迁移服务
└── utils/
    └── logger.ts         # 日志工具
```

### 添加新的表结构定义

1. 创建表结构定义 JSON
2. 调用 API 创建表结构定义
3. 执行迁移

### 升级表结构

1. 修改表结构定义 JSON
2. 调用升级 API
3. 执行迁移

## 故障排除

### 常见问题

1. **表已存在错误**

   - 系统现在使用统一升级逻辑，会自动处理表已存在的情况
   - 检查日志确认是否执行了正确的升级操作

2. **连接失败**

   - 检查数据库配置
   - 确认数据库服务是否运行
   - 检查网络连接

3. **权限错误**
   - 确认数据库用户有足够权限
   - 检查数据库名称是否正确

### 日志查看

系统提供详细的日志记录，包括：

- 表存在检查结果
- 列添加过程
- 索引更新过程
- 错误详情

## 许可证

MIT License
