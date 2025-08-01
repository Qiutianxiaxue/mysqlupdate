# 测试失败SQL收集功能

## 测试步骤

### 1. 一键迁移所有表
```bash
curl -X POST http://localhost:33000/api/migration/execute-all \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 2. 单表迁移
```bash
curl -X POST http://localhost:33000/api/migration/execute \
  -H "Content-Type: application/json" \
  -d '{
    "table_name": "users",
    "database_type": "main"
  }'
```

### 3. 门店分表迁移
```bash
curl -X POST http://localhost:33000/api/migration/execute-store \
  -H "Content-Type: application/json" \
  -d '{
    "store_id": "001",
    "enterprise_id": 1
  }'
```

## 预期返回格式

### 一键迁移响应（包含失败SQL）
```json
{
  "success": false,
  "message": "全企业一键迁移完成！成功: 4/5, 失败: 1/5",
  "data": {
    "total_schemas": 5,
    "tables_migrated": 4,
    "migration_results": [
      {
        "table_name": "users",
        "database_type": "main", 
        "success": true,
        "message": "迁移成功到版本 1.2.0"
      },
      {
        "table_name": "orders",
        "database_type": "order",
        "success": false,
        "message": "迁移失败",
        "error": "SQL execution error"
      }
    ],
    "failed_sqls": [
      {
        "enterprise_name": "测试企业",
        "enterprise_id": 1,
        "database_type": "order",
        "table_name": "orders001",
        "migration_type": "CREATE",
        "sql_statement": "CREATE TABLE `orders001` (...)",
        "error_message": "Table 'orders001' already exists",
        "schema_version": "1.1.0",
        "partition_type": "store"
      }
    ]
  },
  "summary": {
    "migration_success": 4,
    "migration_failure": 1,
    "by_database_type": {
      "main": { "total": 2, "success": 2, "failure": 0 },
      "order": { "total": 3, "success": 2, "failure": 1 }
    },
    "failed_sql_count": 1
  }
}
```

## 新增功能说明

1. **failed_sqls 数组**: 包含所有执行失败的SQL语句详细信息
   - `enterprise_name`: 企业名称
   - `enterprise_id`: 企业ID
   - `database_type`: 数据库类型
   - `table_name`: 表名（实际表名，包含分区后缀）
   - `migration_type`: 迁移类型（CREATE/ALTER/DROP/INDEX）
   - `sql_statement`: 完整的SQL语句
   - `error_message`: 错误信息
   - `schema_version`: 表结构版本
   - `partition_type`: 分区类型

2. **failed_sql_count**: summary中新增失败SQL数量统计

3. **跨表收集**: 在一键迁移中，会收集所有表的失败SQL，不会因为处理下一个表而清空之前的失败记录

## 使用场景

- 开发人员可以快速查看哪些SQL执行失败了
- 可以直接复制失败的SQL语句进行调试
- 可以看到失败的原因和涉及的企业
- 便于批量处理和修复问题
