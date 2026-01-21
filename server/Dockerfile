# 小程序 API 服务 Dockerfile
# 端口: 3001

FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖 (用于 better-sqlite3 编译)
RUN apk add --no-cache python3 make g++ sqlite

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制源代码
COPY . .

# 创建数据目录
RUN mkdir -p /app/data

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -q --spider http://localhost:3001/api/health || exit 1

# 启动命令
CMD ["node", "index.js"]
