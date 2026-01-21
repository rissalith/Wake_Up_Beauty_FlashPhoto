# AI 服务 Dockerfile
# 端口: 3002

FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制源代码
COPY . .

# 设置环境变量
ENV NODE_ENV=production
ENV AI_SERVICE_PORT=3002

# 暴露端口
EXPOSE 3002

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -q --spider http://localhost:3002/health || exit 1

# 启动命令
CMD ["node", "index.js"]
