# 删除表功能使用指南

## 概述

本系统支持通过表结构定义来实现表的删除操作。删除表的逻辑已整合到统一的迁移系统中，通过在`schema_definition`中设置特殊的配置来标记表需要被删除。

## 实现原理

- 在`schema_definition`的 JSON 配置中添加`"action": "DROP"`字段
- 迁移系统检测到此配置后，会执行删除表操作而不是创建/升级操作
- **自动检测**: 表结构检测服务会自动发现已删除的表，并生成相应的删除配置
- 支持所有分区类型的表删除（store、time、none）
- 删除操作会记录到 SQL 执行历史中

## 使用方法

### 方法 1: 自动检测删除的表（推荐）

系统可以自动检测基准数据库中已删除的表，并生成相应的删除配置：

```javascript
// 1. 执行全表检测
POST / api / schema - detection / all;

// 2. 检测结果中会包含删除的表，并自动生成 action: "DROP" 配置
// 3. 保存检测到的变化
POST / api / schema - detection / detect - and - save;

// 4. 执行一键迁移（包括删除操作）
POST / api / migration / execute - all;
```

### 方法 2: 手动创建删除表配置

通过 API 创建一个新的表结构版本，在`schema_definition`中指定删除操作：

```javascript
POST /api/migration/schemas
{
  "table_name": "要删除的表名",
  "database_type": "main", // 或 log、order、static
  "partition_type": "none", // 或 store、time
  "schema_version": "2.0.0", // 新版本号
  "schema_definition": JSON.stringify({
    "tableName": "要删除的表名",
    "action": "DROP", // 关键：指定删除操作
    "columns": [], // 删除操作时可以为空
    "indexes": [] // 删除操作时可以为空
  }),
  "upgrade_notes": "删除表的说明"
}
```

### 执行删除迁移

使用标准的迁移接口执行删除操作：

```javascript
POST /api/migration/execute
{
  "table_name": "要删除的表名",
  "database_type": "main",
  "partition_type": "none",
  "schema_version": "2.0.0" // 指定删除版本
}
```

### 一键删除所有配置的表

如果有多个表需要删除，可以使用一键迁移功能：

```javascript
POST / api / migration / execute - all;
```

## 配置示例

### 普通表删除

```json
{
  "tableName": "old_user_table",
  "action": "DROP",
  "columns": [],
  "indexes": []
}
```

### 门店分表删除

```json
{
  "tableName": "store_orders",
  "action": "DROP",
  "columns": [],
  "indexes": []
}
```

当`partition_type`为`store`时，系统会删除所有相关的门店分表，如：

- `store_orders_store_1001`
- `store_orders_store_1002`
- 等等...

### 时间分表删除

```json
{
  "tableName": "log_data",
  "action": "DROP",
  "columns": [],
  "indexes": []
}
```

当`partition_type`为`time`时，系统会删除所有相关的时间分表，如：

- `log_data_2023_01`
- `log_data_2023_02`
- 等等...

## 安全特性

1. **确认机制**: 删除操作需要显式设置`"action": "DROP"`
2. **自动检测**: 系统自动检测已删除的表，避免手动配置错误
3. **版本控制**: 删除配置作为新版本保存，保留操作历史
4. **批量处理**: 支持多企业环境下的批量删除
5. **错误处理**: 删除失败不会影响其他表的迁移
6. **日志记录**: 所有删除操作都会记录到 SQL 执行历史中

## 注意事项

1. **不可逆操作**: 表删除后数据无法恢复，请谨慎操作
2. **版本升级**: 删除配置应该作为新版本，版本号要大于当前版本
3. **分区表**: 删除分区表时会删除所有相关的子表
4. **数据备份**: 建议在删除前备份重要数据
5. **依赖检查**: 确保没有其他表或应用依赖要删除的表

## 完整示例

以下是一个完整的删除表流程示例：

```javascript
// 1. 创建删除配置
const response1 = await axios.post("/api/migration/schemas", {
  table_name: "obsolete_table",
  database_type: "main",
  partition_type: "none",
  schema_version: "2.0.0",
  schema_definition: JSON.stringify({
    tableName: "obsolete_table",
    action: "DROP",
    columns: [],
    indexes: [],
  }),
  upgrade_notes: "删除过时的表",
});

// 2. 执行删除迁移
const response2 = await axios.post("/api/migration/execute", {
  table_name: "obsolete_table",
  database_type: "main",
  partition_type: "none",
  schema_version: "2.0.0",
});

console.log("删除结果:", response2.data);
```

## 错误处理

常见错误及解决方法：

1. **表不存在**: 系统会跳过不存在的表，不会报错
2. **版本冲突**: 确保新版本号大于当前版本
3. **权限不足**: 确保数据库用户有 DROP TABLE 权限
4. **外键约束**: 删除前请先处理外键约束

## 监控和日志

所有删除操作都会记录在以下位置：

1. **MigrationHistory 表**: 记录具体的 SQL 执行历史
2. **应用日志**: 记录详细的操作过程
3. **TableSchema 表**: 保留删除配置的版本历史

通过这些记录可以追踪所有的删除操作，便于审计和问题排查。
