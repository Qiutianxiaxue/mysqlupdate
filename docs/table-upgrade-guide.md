# 表结构升级使用指南

## 概述

多租户数据库自动升级工具支持表结构的版本化升级，可以安全地对现有表进行结构变更，包括添加新列、修改列属性、添加索引等操作。

## 升级流程

### 1. 创建初始表结构

首先创建一个基础的表结构定义：

```bash
# 创建初始表结构
curl -X POST http://localhost:3000/api/schemas \
  -H "Content-Type: application/json" \
  -d '{
    "table_name": "user_info",
    "database_type": "main",
    "partition_type": "none",
    "schema_version": "1.0.0",
    "schema_definition": "{\"tableName\":\"user_info\",\"columns\":[...],\"indexes\":[...]}"
  }'
```

### 2. 执行初始迁移

将初始表结构应用到所有企业的数据库：

```bash
# 执行迁移
curl -X POST http://localhost:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"schema_id": 1}'
```

### 3. 升级表结构

当需要修改表结构时，创建新版本：

```bash
# 升级表结构
curl -X POST http://localhost:3000/api/schemas/1/upgrade \
  -H "Content-Type: application/json" \
  -d '{
    "schema_version": "1.1.0",
    "upgrade_notes": "添加email字段和索引",
    "schema_definition": "{\"tableName\":\"user_info\",\"columns\":[...],\"indexes\":[...]}"
  }'
```

### 4. 执行升级迁移

将升级后的表结构应用到所有企业：

```bash
# 执行升级迁移
curl -X POST http://localhost:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"schema_id": 2}'
```

## 支持的升级操作

### 1. 添加新列

```json
{
  "name": "email",
  "type": "VARCHAR",
  "length": 255,
  "allowNull": true,
  "comment": "邮箱地址"
}
```

### 2. 修改列属性

```json
{
  "name": "name",
  "type": "VARCHAR",
  "length": 200, // 从100增加到200
  "allowNull": false,
  "comment": "用户姓名"
}
```

### 3. 添加索引

```json
{
  "name": "idx_email",
  "fields": ["email"]
}
```

### 4. 添加复合索引

```json
{
  "name": "idx_name_status",
  "fields": ["name", "status"]
}
```

### 5. 添加时间戳字段

```json
{
  "name": "updated_at",
  "type": "TIMESTAMP",
  "allowNull": false,
  "defaultValue": "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  "comment": "更新时间"
}
```

## 版本管理

### 版本号规则

- 使用语义化版本号：`主版本.次版本.修订版本`
- 例如：`1.0.0` → `1.1.0` → `1.2.0`
- 新版本号必须大于当前版本号

### 查看版本历史

```bash
# 查看表结构历史
curl "http://localhost:3000/api/schemas/history?table_name=user_info&database_type=main"
```

### 版本状态

- **激活版本**: 当前正在使用的版本
- **非激活版本**: 历史版本，已不再使用

## 升级注意事项

### 1. 向后兼容

- 添加新列时，建议设置为 `allowNull: true`
- 修改列类型时，确保数据兼容性
- 删除列时，需要特别小心，建议先标记为废弃

### 2. 索引管理

- 添加索引可以提高查询性能
- 删除索引前，确认没有查询依赖该索引
- 复合索引的顺序很重要，最常用的字段放在前面

### 3. 数据迁移

- 对于复杂的结构变更，可能需要数据迁移脚本
- 建议在测试环境先验证升级效果
- 生产环境升级时，建议在低峰期进行

## 测试脚本

### 运行完整升级测试

```bash
node scripts/test-upgrade.js
```

### 测试特定功能

```bash
# 测试TIMESTAMP字段
node scripts/test-timestamp.js

# 测试基础迁移
node scripts/test-migration.js
```

## 错误处理

### 常见错误及解决方案

1. **版本号冲突**

   ```
   错误: 新版本号必须大于当前版本号
   解决: 检查版本号，确保新版本号更大
   ```

2. **表名重复**

   ```
   错误: 表名在数据库中已存在
   解决: 使用唯一的表名，或清理重复定义
   ```

3. **SQL 语法错误**

   ```
   错误: Invalid default value for 'created_at'
   解决: 检查TIMESTAMP字段的默认值设置
   ```

4. **权限不足**
   ```
   错误: 数据库连接失败
   解决: 检查数据库用户权限
   ```

## 最佳实践

### 1. 升级前准备

- 备份重要数据
- 在测试环境验证升级脚本
- 准备回滚方案

### 2. 升级执行

- 选择合适的时间窗口
- 监控升级进度
- 验证升级结果

### 3. 升级后验证

- 检查表结构是否正确
- 验证数据完整性
- 测试相关功能

### 4. 文档维护

- 记录每次升级的内容
- 更新相关文档
- 通知相关人员

## API 参考

### 升级表结构

```
POST /api/schemas/:id/upgrade
```

**请求参数:**

- `schema_version`: 新版本号
- `schema_definition`: 新的表结构定义（JSON）
- `upgrade_notes`: 升级说明（可选）

### 查看版本历史

```
GET /api/schemas/history?table_name=xxx&database_type=xxx
```

**查询参数:**

- `table_name`: 表名
- `database_type`: 数据库类型

### 执行迁移

```
POST /api/execute
```

**请求参数:**

- `schema_id`: 表结构定义 ID
