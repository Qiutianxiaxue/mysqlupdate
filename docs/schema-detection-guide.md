# 表结构检测功能使用指南

## 概述

表结构检测功能允许你监控基准数据库中表结构的变化，自动生成新的 schema 定义，并与现有的 TableSchema 记录进行对比。这个功能对于维护多环境数据库一致性非常有用。

## 功能特性

- ✅ 检测单个表的结构变化
- ✅ 批量检测所有表的结构变化
- ✅ 自动生成 schema 定义
- ✅ 智能版本号管理
- ✅ 详细的变化追踪
- ✅ 自动保存检测结果
- ✅ 支持多种数据库类型（main、log、order、static）

## API 接口

### 基础信息接口

#### 获取所有表信息

```http
GET /api/schema-detection/tables
```

**响应示例：**

```json
{
  "success": true,
  "message": "获取到 5 个表的信息",
  "data": [
    {
      "table_name": "users",
      "comment": "用户表",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-02T00:00:00.000Z"
    }
  ],
  "summary": {
    "total_tables": 5
  }
}
```

#### 获取表详细信息

```http
GET /api/schema-detection/table/{tableName}/info
```

**参数：**

- `tableName`: 表名

**响应示例：**

```json
{
  "success": true,
  "message": "获取表 users 信息成功",
  "data": {
    "table_name": "users",
    "columns": [
      {
        "COLUMN_NAME": "id",
        "DATA_TYPE": "int",
        "IS_NULLABLE": "NO",
        "COLUMN_KEY": "PRI",
        "EXTRA": "auto_increment"
      }
    ],
    "indexes": [
      {
        "INDEX_NAME": "idx_email",
        "COLUMN_NAME": "email",
        "NON_UNIQUE": 0
      }
    ]
  }
}
```

### 检测接口

#### 检测单个表变化

```http
POST /api/schema-detection/table
```

**请求参数：**

```json
{
  "tableName": "users",
  "databaseType": "main"
}
```

**响应示例：**

```json
{
  "success": true,
  "message": "检测到表 users 有结构变化",
  "data": {
    "table_name": "users",
    "database_type": "main",
    "partition_type": "none",
    "current_version": "1.0.0",
    "new_version": "1.0.1",
    "schema_definition": "{\"tableName\":\"users\",\"columns\":[...]}",
    "changes_detected": [
      "新增列: phone (VARCHAR)",
      "列 email 长度变化: 100 -> 255"
    ],
    "upgrade_notes": "自动检测到的结构变化: 新增列: phone (VARCHAR), 列 email 长度变化: 100 -> 255"
  }
}
```

#### 检测所有表变化

```http
POST /api/schema-detection/all
```

**请求参数：**

```json
{
  "databaseType": "main",
  "tableNames": ["users", "orders"] // 可选，不提供则检测所有表
}
```

**响应示例：**

```json
{
  "success": true,
  "message": "检测完成，共发现 2 个表有结构变化",
  "data": [
    {
      "table_name": "users",
      "database_type": "main",
      "current_version": "1.0.0",
      "new_version": "1.0.1",
      "changes_detected": ["新增列: phone (VARCHAR)"]
    }
  ],
  "summary": {
    "total_tables_with_changes": 2,
    "tables_changed": ["users", "orders"]
  }
}
```

#### 检测并自动保存

```http
POST /api/schema-detection/detect-and-save
```

**请求参数：**

```json
{
  "databaseType": "main",
  "tableNames": ["users"], // 可选
  "autoSave": true
}
```

**响应示例：**

```json
{
  "success": true,
  "message": "检测完成，发现 1 个表有结构变化，已自动保存",
  "data": [...],
  "summary": {
    "total_tables_with_changes": 1,
    "tables_changed": [
      {
        "table_name": "users",
        "version": "1.0.0 -> 1.0.1",
        "changes_count": 2
      }
    ],
    "saved": true
  }
}
```

### 保存接口

#### 保存检测结果

```http
POST /api/schema-detection/save
```

**请求参数：**

```json
{
  "changes": [
    {
      "table_name": "users",
      "database_type": "main",
      "partition_type": "none",
      "current_version": "1.0.0",
      "new_version": "1.0.1",
      "schema_definition": "{...}",
      "changes_detected": [...],
      "upgrade_notes": "..."
    }
  ]
}
```

## 使用场景

### 场景 1：日常表结构监控

定期检查基准数据库中所有表的结构变化：

```bash
# 使用示例脚本
node examples/schema-detection-example.js

# 或者直接调用API
curl -X POST http://localhost:3000/api/schema-detection/all \
  -H "Content-Type: application/json" \
  -d '{"databaseType": "main"}'
```

### 场景 2：特定表结构检测

当你知道某个表可能有变化时：

```bash
# 检测单个表
node examples/schema-detection-example.js detect users

# 或者API调用
curl -X POST http://localhost:3000/api/schema-detection/table \
  -H "Content-Type: application/json" \
  -d '{"tableName": "users", "databaseType": "main"}'
```

### 场景 3：自动化工作流

在 CI/CD 流程中自动检测并保存变化：

```bash
# 检测并自动保存
node examples/schema-detection-example.js save

# 或者API调用
curl -X POST http://localhost:3000/api/schema-detection/detect-and-save \
  -H "Content-Type: application/json" \
  -d '{"databaseType": "main", "autoSave": true}'
```

## 配置说明

### 基准数据库配置

表结构检测功能使用项目配置中的主数据库作为基准数据库。确保以下环境变量正确配置：

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_base_database
DB_USER=root
DB_PASSWORD=your_password
```

### 数据库类型

支持的数据库类型：

- `main`: 主数据库（默认）
- `log`: 日志数据库
- `order`: 订单数据库
- `static`: 静态数据库

## 版本管理

### 版本号规则

- 如果没有现有版本：从 `1.0.0` 开始
- 如果有现有版本：按语义化版本递增（如 `1.0.0` -> `1.0.1`）
- 如果版本格式不标准：添加时间戳后缀

### 版本历史

系统会自动管理版本历史：

- 新版本创建时，旧版本的 `is_active` 设为 `false`
- 新版本的 `is_active` 设为 `true`
- 保留完整的版本历史记录

## 检测能力

### 列变化检测

- ✅ 新增列
- ✅ 删除列
- ✅ 列类型变化
- ✅ 列长度变化
- ✅ 可空性变化
- ✅ 默认值变化
- ✅ 注释变化

### 索引变化检测

- ✅ 新增索引
- ✅ 删除索引
- ✅ 索引类型变化（唯一/普通）
- ✅ 索引列变化

### 主键变化检测

- ✅ 主键列变化
- ✅ 自增属性变化

## 错误处理

### 常见错误

1. **基准数据库连接失败**

   ```json
   {
     "success": false,
     "message": "数据库连接失败",
     "error": "Connection refused"
   }
   ```

2. **表不存在**

   ```json
   {
     "success": false,
     "message": "表 users 不存在"
   }
   ```

3. **权限不足**
   ```json
   {
     "success": false,
     "message": "权限不足，无法访问 INFORMATION_SCHEMA"
   }
   ```

### 错误排查

1. 检查数据库连接配置
2. 确认数据库用户权限
3. 验证表名是否正确
4. 查看服务器日志获取详细错误信息

## 性能优化

### 大量表检测

对于包含大量表的数据库：

1. 使用 `tableNames` 参数限制检测范围
2. 分批检测，避免一次性检测所有表
3. 在低峰期运行检测任务

### 并发处理

- 检测任务会按顺序执行，避免数据库连接冲突
- 可以通过多个进程并行检测不同数据库类型

## 监控和日志

### 日志级别

- `INFO`: 正常操作信息
- `WARN`: 警告信息（如多版本选择）
- `ERROR`: 错误信息

### 监控指标

可以监控以下指标：

- 检测执行时间
- 发现变化的表数量
- 检测失败的表数量
- API 响应时间

## 示例脚本使用

```bash
# 完整示例
node examples/schema-detection-example.js

# 获取所有表
node examples/schema-detection-example.js tables

# 检测所有表变化
node examples/schema-detection-example.js detect

# 检测单个表
node examples/schema-detection-example.js detect users

# 获取表信息
node examples/schema-detection-example.js info users

# 检测并保存
node examples/schema-detection-example.js save
```

## 最佳实践

1. **定期检测**：建议每天或每周定期检测表结构变化
2. **版本管理**：保持语义化版本号格式
3. **备份策略**：在应用重大结构变化前备份数据
4. **测试环境**：先在测试环境验证检测结果
5. **监控告警**：设置监控，及时发现结构变化

## 故障排除

### 常见问题

**Q: 检测到的变化不准确？**
A: 检查基准数据库是否为最新状态，确认表结构定义格式正确。

**Q: 无法保存检测结果？**
A: 检查 TableSchema 表的写入权限，确认数据格式正确。

**Q: 检测性能慢？**
A: 对于大型数据库，建议分批检测或在低峰期执行。

**Q: 版本号不递增？**
A: 检查现有版本号格式，确保符合语义化版本规范。
