-- 移除table_name的唯一约束，支持版本化
-- 用于支持同一个表名的多个版本

-- 查看当前表的索引
SHOW INDEX FROM `qc_table_schemas`;

-- 移除table_name的唯一约束（如果存在）
-- 注意：需要根据实际的索引名称来删除
-- 通常唯一约束的索引名称是 table_name 或者 qc_table_schemas_table_name_unique

-- 方法1：如果知道确切的索引名称
-- DROP INDEX `table_name` ON `qc_table_schemas`;

-- 方法2：通过查询information_schema来找到唯一索引
SELECT 
    INDEX_NAME,
    COLUMN_NAME,
    NON_UNIQUE
FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'qc_table_schemas' 
  AND COLUMN_NAME = 'table_name'
  AND NON_UNIQUE = 0;

-- 根据查询结果删除唯一索引
-- 例如：DROP INDEX `索引名称` ON `qc_table_schemas`;

-- 验证约束是否已移除
SHOW INDEX FROM `qc_table_schemas`; 