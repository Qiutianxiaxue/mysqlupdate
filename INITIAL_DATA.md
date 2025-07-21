# 初始数据管理系统

## 概述

本系统提供了一个基于数据库的初始数据管理方案，允许您通过数据库表来维护和管理各个企业的初始数据脚本，而不需要修改代码文件。

## 系统架构

### 核心表结构

1. **initial_data_template** - 初始数据脚本模板表
   - 存储所有的初始数据SQL脚本模板
   - 支持版本管理和依赖关系
   - 可以启用/禁用特定模板

2. **initial_data_history** - 初始数据执行历史表
   - 记录每个企业每个脚本的执行状态
   - 支持执行时间、影响行数等详细信息
   - 用于避免重复执行

### 主要功能模块

1. **InitialDataTemplate** - 脚本模板管理
2. **InitialDataService** - 初始数据执行服务
3. **InitialDataController** - API控制器

## API接口

### 脚本模板管理

#### 获取所有模板
```http
POST /api/initial-data-template/list
Body (可选):
{
  "databaseType": "main", // main|log|order|static (可选)
  "isEnabled": true       // true|false (可选)
}
```

#### 创建新模板
```http
POST /api/initial-data-template/create
Body:
{
  "template_name": "脚本名称",
  "template_version": "1.0.0",
  "database_type": "main",
  "script_content": "SQL脚本内容",
  "description": "脚本描述",
  "execution_order": 10,
  "dependencies": ["依赖的脚本名称"],
  "is_enabled": true
}
```

#### 根据ID获取模板
```http
POST /api/initial-data-template/get-by-id
Body:
{
  "templateId": 1
}
```

#### 更新模板
```http
POST /api/initial-data-template/update
Body:
{
  "templateId": 1,
  "template_name": "脚本名称",
  "template_version": "1.1.0",
  "database_type": "main",
  "script_content": "SQL脚本内容",
  "description": "脚本描述",
  "execution_order": 10,
  "dependencies": ["依赖的脚本名称"],
  "is_enabled": true
}
```

#### 删除模板
```http
POST /api/initial-data-template/delete
Body:
{
  "templateId": 1
}
```

#### 启用/禁用模板
```http
POST /api/initial-data-template/toggle
Body:
{
  "templateId": 1,
  "is_enabled": true
}
```

### 初始数据执行

#### 执行初始数据
```http
POST /api/initial-data/execute
Body:
{
  "enterpriseId": 123,
  "databaseType": "main", // 可选，不指定则执行所有类型
  "forceRerun": false     // 可选，是否强制重新执行已成功的脚本
}
```

#### 获取执行状态
```http
POST /api/initial-data/status
Body:
{
  "enterpriseId": 123,
  "databaseType": "main"  // 可选
}
```

#### 获取执行历史
```http
POST /api/initial-data/history
Body:
{
  "enterpriseId": 123,
  "databaseType": "main", // 可选
  "limit": 50             // 可选，默认50
}
```

#### 检查特定脚本执行状态
```http
POST /api/initial-data/check-script
Body:
{
  "enterpriseId": 123,
  "databaseType": "main",
  "script_name": "001_system_config",
  "script_version": "1.0.0"
}
```

## 使用指南

### 1. 添加新的初始数据脚本

通过API创建新的脚本模板（POST /api/initial-data-template/create）：

```json
{
  "template_name": "004_product_categories",
  "template_version": "1.0.0",
  "database_type": "main",
  "script_content": "INSERT INTO product_categories (name, description) VALUES ('电子产品', '各类电子产品分类');",
  "description": "初始化商品分类数据",
  "execution_order": 4,
  "dependencies": ["003_admin_menus"],
  "is_enabled": true
}
```

完整的curl示例：

```bash
curl -X POST http://localhost:3000/api/initial-data-template/create \
  -H "Content-Type: application/json" \
  -d '{
    "template_name": "004_product_categories",
    "template_version": "1.0.0",
    "database_type": "main",
    "script_content": "INSERT INTO product_categories (name, description) VALUES (\"电子产品\", \"各类电子产品分类\");",
    "description": "初始化商品分类数据",
    "execution_order": 4,
    "dependencies": ["003_admin_menus"],
    "is_enabled": true
  }'
```

### 2. 执行企业初始数据

```bash
curl -X POST http://localhost:3000/api/initial-data/execute \
  -H "Content-Type: application/json" \
  -d '{
    "enterpriseId": 123,
    "databaseType": "main",
    "forceRerun": false
  }'
```

### 3. 查看执行状态

```bash
curl -X POST http://localhost:3000/api/initial-data/status \
  -H "Content-Type: application/json" \
  -d '{
    "enterpriseId": 123
  }'
```

### 4. 脚本依赖管理

系统支持脚本间的依赖关系：

- 在 `dependencies` 字段中指定依赖的脚本名称
- 系统会按依赖关系和执行顺序自动排序执行
- 如果检测到循环依赖会抛出错误

### 5. 版本管理

- 每个脚本模板都有版本号
- 同一个脚本的不同版本可以共存
- 执行时会记录具体的版本信息

## 优势

1. **动态管理**: 无需修改代码，通过数据库即可添加新的初始数据脚本
2. **版本控制**: 支持脚本版本管理，便于升级和回滚
3. **依赖管理**: 自动处理脚本间的依赖关系
4. **执行追踪**: 详细记录每次执行的状态和结果
5. **企业隔离**: 每个企业的执行状态独立管理
6. **数据库分离**: 支持不同类型数据库的独立管理

## 初始化系统

首次使用时，可以运行初始化脚本来创建默认的模板：

```bash
npm run init-templates
```

这将在数据库中创建一些常用的初始数据模板。

## 注意事项

1. 脚本内容应该使用幂等的SQL语句（如 ON DUPLICATE KEY UPDATE）
2. 确保脚本的执行顺序正确，通过 execution_order 和 dependencies 控制
3. 生产环境建议先在测试环境验证脚本的正确性
4. 定期备份 initial_data_template 表的数据

## 示例场景

### 新企业初始化流程

1. 企业注册成功后，调用初始数据执行API
2. 系统自动按顺序执行所有启用的脚本模板
3. 为企业创建基础数据（管理员账号、菜单、配置等）
4. 记录执行状态，避免重复执行

### 系统升级场景

1. 添加新的脚本模板（新版本）
2. 对所有企业执行初始数据更新
3. 系统自动跳过已执行的脚本，只执行新增的部分
4. 升级完成后，所有企业数据保持一致
