#!/bin/bash

# MySQL数据库自动升级服务 - Docker快速启动脚本

set -e

echo "🚀 MySQL数据库自动升级服务 - Docker部署"
echo "============================================"

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未找到Docker，请先安装Docker"
    exit 1
fi

# 检查Docker Compose是否安装
if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
    echo "❌ 错误: 未找到Docker Compose，请先安装Docker Compose"
    exit 1
fi

# 检查环境配置文件
if [ ! -f ".env" ]; then
    echo "📝 创建环境配置文件..."
    cp docker.env .env
    echo "✅ 已创建 .env 文件，请根据需要修改配置"
fi

# 构建并启动服务
echo "🔨 构建Docker镜像..."
docker compose build

echo "🚀 启动服务..."
docker compose up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
echo "🔍 检查服务状态..."
docker compose ps

# 测试健康检查
echo "🩺 检查服务健康状态..."
for i in {1..30}; do
    if curl -s http://localhost:3000/health > /dev/null; then
        echo "✅ 服务启动成功！"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ 服务启动超时，请检查日志"
        docker compose logs app
        exit 1
    fi
    echo "   等待服务启动... ($i/30)"
    sleep 2
done

echo ""
echo "🎉 部署完成！"
echo "============================================"
echo "📱 服务信息:"
echo "   - 应用地址: http://localhost:3000"
echo "   - 健康检查: http://localhost:3000/health"
echo "   - API文档: http://localhost:3000/"
echo ""
echo "🗄️ 数据库信息:"
echo "   - 主数据库: localhost:3306"
echo "   - 基准数据库: localhost:3307"
echo ""
echo "📋 常用命令:"
echo "   - 查看日志: docker compose logs -f app"
echo "   - 停止服务: docker compose down"
echo "   - 重启服务: docker compose restart"
echo ""
echo "📖 详细文档请查看: DOCKER.md" 