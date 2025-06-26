# 脚本使用说明

## 概述

本目录包含用于测试和初始化多租户数据库自动升级工具的脚本。

## 脚本列表

### 1. create-test-enterprise.sql

**功能**: 直接在 MySQL 数据库中创建测试企业数据
**使用方式**:

```bash
# 连接到MySQL数据库
mysql -u root -p

# 执行SQL脚本
source scripts/create-test-enterprise.sql
```

**包含内容**:

- 创建企业表结构（如果不存在）
- 插入 3 个测试企业记录
- 查询企业数据验证

### 2. create-enterprise.js

**功能**: 通过 API 接口创建测试企业记录
**使用方式**:

```bash
# 确保服务已启动
npm run dev

# 在另一个终端运行脚本
node scripts/create-enterprise.js
```

**包含内容**:

- 创建 3 个测试企业记录
- 自动检查 API 服务状态
- 显示创建结果统计
- 获取企业列表验证

## 测试企业数据

### 企业 1: test_enterprise_001

- 企业编号: 100001
- 数据库: test_enterprise_001
- 日志数据库: test_enterprise_001_log
- 订单数据库: test_enterprise_001_order
- 静态数据库: test_enterprise_001_static

### 企业 2: test_enterprise_002

- 企业编号: 100002
- 数据库: test_enterprise_002
- 日志数据库: test_enterprise_002_log
- 订单数据库: test_enterprise_002_order
- 静态数据库: test_enterprise_002_static

### 企业 3: chain_store_001

- 企业编号: 200001
- 数据库: chain_store_001
- 日志数据库: chain_store_001_log
- 订单数据库: chain_store_001_order
- 静态数据库: chain_store_001_static

## 使用步骤

### 方法 1: 使用 SQL 脚本（推荐）

1. 确保 MySQL 服务运行
2. 使用有权限的账号连接 MySQL
3. 执行 SQL 脚本创建企业数据
4. 运行测试脚本验证功能

### 方法 2: 使用 API 脚本

1. 启动应用服务: `npm run dev`
2. 运行企业创建脚本: `node scripts/create-enterprise.js`
3. 运行完整测试脚本: `node test-api.js`

## 注意事项

1. **数据库权限**: 确保 MySQL 用户有创建数据库的权限
2. **服务状态**: 使用 API 脚本前确保服务正常运行
3. **端口配置**: 默认使用 3000 端口，如需修改请更新脚本中的 BASE_URL
4. **数据库配置**: 脚本使用默认的 localhost:3306 配置，请根据实际情况调整

## 验证结果

创建成功后，可以通过以下方式验证：

1. **查看企业列表**:

```bash
curl http://localhost:3000/api/enterprises
```

2. **查看连接统计**:

```bash
curl http://localhost:3000/api/connections/stats
```

3. **运行完整测试**:

```bash
node test-api.js
```

## 故障排除

### 数据库连接失败

- 检查 MySQL 服务状态
- 验证用户名密码
- 确认网络连接

### API 服务不可用

- 检查服务是否启动
- 验证端口是否被占用
- 查看服务日志

### 权限不足

- 确保 MySQL 用户有 CREATE DATABASE 权限
- 检查数据库用户权限设置
