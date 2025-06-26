-- 创建门店表和测试数据
-- 使用方法: mysql -u用户名 -p密码 数据库名 < create-store-table.sql

-- 删除已存在的门店表（如果存在）
DROP TABLE IF EXISTS store;

-- 创建门店表
CREATE TABLE store (
  store_id INT PRIMARY KEY COMMENT '门店ID',
  store_name VARCHAR(100) NOT NULL COMMENT '门店名称',
  store_code VARCHAR(20) NOT NULL UNIQUE COMMENT '门店编码',
  address VARCHAR(255) DEFAULT NULL COMMENT '门店地址',
  phone VARCHAR(20) DEFAULT NULL COMMENT '联系电话',
  manager VARCHAR(50) DEFAULT NULL COMMENT '店长姓名',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1-正常，0-停用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_status (status),
  INDEX idx_store_code (store_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门店表';

-- 插入测试门店数据
INSERT INTO store (store_id, store_name, store_code, address, phone, manager, status) VALUES
(1001, '北京朝阳店', 'BJ001', '北京市朝阳区建国路88号', '010-12345678', '张三', 1),
(1002, '北京海淀店', 'BJ002', '北京市海淀区中关村大街1号', '010-87654321', '李四', 1),
(1003, '上海浦东店', 'SH001', '上海市浦东新区陆家嘴环路1000号', '021-11111111', '王五', 1),
(1004, '上海徐汇店', 'SH002', '上海市徐汇区淮海中路500号', '021-22222222', '赵六', 1),
(1005, '广州天河店', 'GZ001', '广州市天河区天河路208号', '020-33333333', '孙七', 1),
(1006, '深圳福田店', 'SZ001', '深圳市福田区深南大道1000号', '0755-44444444', '周八', 0);

-- 查询验证数据
SELECT '门店数据创建完成' AS message;
SELECT 
  CONCAT('总门店数: ', COUNT(*)) AS total_stores
FROM store;

SELECT 
  CONCAT('正常门店数: ', COUNT(*)) AS active_stores  
FROM store WHERE status = 1;

SELECT 
  CONCAT('停用门店数: ', COUNT(*)) AS inactive_stores
FROM store WHERE status = 0;

-- 显示所有门店
SELECT 
  store_id AS '门店ID',
  store_name AS '门店名称', 
  store_code AS '门店编码',
  address AS '地址',
  manager AS '店长',
  CASE status 
    WHEN 1 THEN '正常'
    WHEN 0 THEN '停用'
    ELSE '未知'
  END AS '状态'
FROM store 
ORDER BY store_id; 