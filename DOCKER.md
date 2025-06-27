# Docker 部署指南

本文档介绍如何使用 Docker 部署 MySQL 数据库自动升级服务。

## 🚀 快速开始

### 1. 准备环境

确保您的系统已安装：

- Docker (20.0+)
- Docker Compose (2.0+)

### 2. 配置环境变量

复制环境配置文件：

```bash
cp docker.env .env
```

根据您的需求编辑 `.env` 文件中的配置。

### 3. 启动服务

```bash
# 构建并启动所有服务
docker compose up -d

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f app
```

### 4. 验证部署

访问健康检查端点：

```bash
curl http://localhost:3000/health
```

预期响应：

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "mysql-update"
}
```

## 📦 服务架构

Docker Compose 包含以下服务：

### 1. MySQL 主数据库 (mysql)

- **端口**: 3306
- **用途**: 存储 TableSchema 和 MigrationHistory
- **数据卷**: `mysql_data`

### 2. MySQL 基准数据库 (mysql-base)

- **端口**: 3307
- **用途**: 表结构检测的参考数据库
- **数据卷**: `mysql_base_data`

### 3. Node.js 应用 (app)

- **端口**: 3000
- **用途**: 核心迁移服务
- **依赖**: mysql, mysql-base

## 🔧 配置说明

### 环境变量

| 变量名                | 默认值               | 说明            |
| --------------------- | -------------------- | --------------- |
| `APP_PORT`            | 3000                 | 应用端口        |
| `MYSQL_ROOT_PASSWORD` | 123456               | MySQL root 密码 |
| `MYSQL_DATABASE`      | mysql_update         | 主数据库名      |
| `BASE_MYSQL_DATABASE` | base_schema_database | 基准数据库名    |

详细配置请参考 `docker.env` 文件。

### 数据持久化

数据存储在 Docker volumes 中：

- `mysql_data`: 主数据库数据
- `mysql_base_data`: 基准数据库数据

## 🎯 使用指南

### 1. 表结构检测

```bash
# 检测所有表变化
curl -X POST http://localhost:3000/api/schema-detection/detect-all

# 检测特定表变化
curl -X POST http://localhost:3000/api/schema-detection/detect \
  -H "Content-Type: application/json" \
  -d '{"table_name": "users", "database_type": "main"}'
```

### 2. 执行迁移

```bash
# 迁移特定表
curl -X POST http://localhost:3000/api/migration/execute \
  -H "Content-Type: application/json" \
  -d '{"table_name": "users", "database_type": "main", "schema_version": "1.0.1"}'

# 一键迁移所有表
curl -X POST http://localhost:3000/api/migration/execute-all
```

### 3. 查看迁移历史

```bash
# 获取迁移历史
curl http://localhost:3000/api/migration/history?table_name=users
```

## 🔍 监控和调试

### 查看日志

```bash
# 查看应用日志
docker compose logs -f app

# 查看MySQL日志
docker compose logs -f mysql

# 查看所有服务日志
docker compose logs -f
```

### 进入容器

```bash
# 进入应用容器
docker compose exec app sh

# 进入MySQL容器
docker compose exec mysql mysql -u root -p
```

### 健康检查

所有服务都配置了健康检查：

```bash
# 检查服务健康状态
docker compose ps

# 应用健康检查
curl http://localhost:3000/health

# MySQL健康检查
docker compose exec mysql mysqladmin ping -h localhost -u root -p123456
```

## 🚨 故障排除

### 常见问题

1. **端口冲突**

   ```bash
   # 修改 .env 文件中的端口配置
   APP_PORT=3001
   MYSQL_PORT=3307
   ```

2. **数据库连接失败**

   ```bash
   # 检查MySQL容器状态
   docker compose ps mysql

   # 查看MySQL日志
   docker compose logs mysql
   ```

3. **应用启动失败**

   ```bash
   # 查看应用日志
   docker compose logs app

   # 重新构建镜像
   docker compose build --no-cache app
   ```

### 重置环境

```bash
# 停止并删除所有容器
docker compose down

# 删除数据卷（注意：这会删除所有数据）
docker compose down -v

# 重新启动
docker compose up -d
```

## 🔒 安全建议

1. **修改默认密码**

   ```bash
   # 在 .env 文件中设置强密码
   MYSQL_ROOT_PASSWORD=your_strong_password
   BASE_MYSQL_ROOT_PASSWORD=your_strong_password
   ```

2. **网络隔离**

   - 服务运行在独立的 Docker 网络中
   - 只暴露必要的端口

3. **数据备份**
   ```bash
   # 备份数据卷
   docker run --rm -v mysqlupdate_mysql_data:/data -v $(pwd):/backup ubuntu tar czf /backup/mysql_backup.tar.gz /data
   ```

## 📈 扩展部署

### 生产环境建议

1. **使用外部数据库**

   - 修改 `.env` 中的数据库配置
   - 移除 docker-compose.yml 中的 MySQL 服务

2. **负载均衡**

   ```yaml
   # 在 docker-compose.yml 中添加多个应用实例
   app1:
     extends: app
     ports:
       - "3001:3000"

   app2:
     extends: app
     ports:
       - "3002:3000"
   ```

3. **日志管理**
   ```yaml
   # 配置日志驱动
   logging:
     driver: "json-file"
     options:
       max-size: "10m"
       max-file: "3"
   ```

## 📞 支持

如果您在使用过程中遇到问题：

1. 查看本文档的故障排除部分
2. 检查应用日志：`docker compose logs app`
3. 提交 Issue 到项目仓库
