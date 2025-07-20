# 使用官方Node.js 20运行时作为基础镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 设置npm配置为淘宝镜像
RUN npm config set registry https://registry.npmmirror.com

# 安装系统依赖
RUN apk add --no-cache \
    tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && apk del tzdata

# 复制package.json和package-lock.json（如果存在）
COPY package*.json ./
# 复制环境变量文件
COPY .env ./

# 安装项目依赖（包含开发依赖用于构建）
RUN npm install

# 复制项目源码
COPY . .

# 编译TypeScript
RUN npm run build

# 暴露端口
EXPOSE 33000

# 设置环境变量
ENV NODE_ENV=production

# 启动应用
CMD ["npm", "start"] 