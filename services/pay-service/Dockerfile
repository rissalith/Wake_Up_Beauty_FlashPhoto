# 支付服务 Dockerfile
# 端口: 3003

FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制源代码
COPY . .

# 创建证书目录
RUN mkdir -p /app/certs

# 设置环境变量
ENV NODE_ENV=production
ENV PAY_SERVICE_PORT=3003

# 暴露端口
EXPOSE 3003

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -q --spider http://localhost:3003/health || exit 1

# 启动命令
CMD ["node", "index.js"]
