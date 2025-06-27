# 模型命名规范修改总结

## 修改概述

按照统一的命名规范，将所有模型的主键修改为 `表名_id` 格式，时间字段修改为 `create_time` 和 `update_time`。

## 修改详情

### 1. TableSchema 模型 (src/models/TableSchema.ts)

**修改内容：**

- 主键：`id` → `table_schema_id`
- 创建时间：`created_at` → `create_time`
- 更新时间：`updated_at` → `update_time`
- 添加了 `timestamps: false` 配置，使用自定义时间字段

**接口变更：**

```typescript
// 修改前
export interface TableSchemaAttributes {
  id: number;
  // ...
  created_at: Date;
  updated_at: Date;
}

// 修改后
export interface TableSchemaAttributes {
  table_schema_id: number;
  // ...
  create_time: Date;
  update_time: Date;
}
```

### 2. MigrationHistory 模型 (src/models/MigrationHistory.ts)

**修改内容：**

- 主键：`id` → `migration_history_id`
- 创建时间：`created_at` → `create_time`
- 索引名称：`idx_created_at` → `idx_create_time`
- 添加了 `timestamps: false` 配置

**接口变更：**

```typescript
// 修改前
export interface MigrationHistoryAttributes {
  id: number;
  // ...
  created_at: Date;
}

// 修改后
export interface MigrationHistoryAttributes {
  migration_history_id: number;
  // ...
  create_time: Date;
}
```

### 3. Enterprise 模型 (src/models/Enterprise.ts)

**状态：** ✅ 已符合规范

- 主键：`enterprise_id` (正确)
- 时间字段：`create_time`、`update_time` (正确)

## 相关代码修改

### 1. 控制器修改 (src/controllers/MigrationController.ts)

**修改内容：**

- 排序字段：`order: [["created_at", "DESC"]]` → `order: [["create_time", "DESC"]]`

### 2. 控制器修改 (src/controllers/SchemaDetectionController.ts)

**修改内容：**

- 字段映射：

  ```typescript
  // 修改前
  created_at: table.CREATE_TIME,
  updated_at: table.UPDATE_TIME,

  // 修改后
  create_time: table.CREATE_TIME,
  update_time: table.UPDATE_TIME,
  ```

## 数据库表结构影响

### 需要执行的数据库迁移

1. **qc_table_schemas 表：**

```sql
-- 修改主键字段名
ALTER TABLE qc_table_schemas CHANGE id table_schema_id INT AUTO_INCREMENT;

-- 修改时间字段名
ALTER TABLE qc_table_schemas CHANGE created_at create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE qc_table_schemas CHANGE updated_at update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
```

2. **qc_migration_history 表：**

```sql
-- 修改主键字段名
ALTER TABLE qc_migration_history CHANGE id migration_history_id INT AUTO_INCREMENT;

-- 修改时间字段名
ALTER TABLE qc_migration_history CHANGE created_at create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 重建索引
DROP INDEX idx_created_at ON qc_migration_history;
CREATE INDEX idx_create_time ON qc_migration_history (create_time);
```

## 验证检查

### 需要检查的文件

1. **模型文件：** ✅ 已完成

   - `src/models/TableSchema.ts`
   - `src/models/MigrationHistory.ts`
   - `src/models/Enterprise.ts` (已符合规范)

2. **控制器文件：** ✅ 已完成

   - `src/controllers/MigrationController.ts`
   - `src/controllers/SchemaDetectionController.ts`

3. **服务文件：** ✅ 已检查
   - `src/services/SchemaDetectionService.ts` (无需修改)
   - `src/services/DatabaseMigrationService.ts` (无需修改)

### 潜在影响

1. **现有数据：** 需要执行数据库迁移脚本
2. **API 响应：** 字段名称会发生变化，前端可能需要相应调整
3. **查询语句：** 所有涉及时间字段的排序和查询都已更新

## 命名规范总结

**主键规范：** `表名_id`

- ✅ enterprise_id (Enterprise 表)
- ✅ table_schema_id (TableSchema 表)
- ✅ migration_history_id (MigrationHistory 表)

**时间字段规范：** `create_time` / `update_time`

- ✅ 所有模型都使用统一的时间字段名称
- ✅ 设置 `timestamps: false` 使用自定义时间字段

**索引命名：** 相应更新

- ✅ `idx_create_time` 替代 `idx_created_at`

## 完成状态

- [x] TableSchema 模型修改
- [x] MigrationHistory 模型修改
- [x] Enterprise 模型检查 (已符合规范)
- [x] 控制器相关代码修改
- [x] 字段映射修改
- [ ] 数据库迁移脚本执行 (需要手动执行)
- [ ] 前端字段名称适配 (如有必要)
