# Core API 服务 Dockerfile
# 多阶段构建优化

# ==================== 基础镜像 ====================
FROM m.daocloud.io/docker.io/library/node:18-alpine AS base
WORKDIR /app

# 安装构建工具 (better-sqlite3 需要)
RUN apk add --no-cache python3 make g++ sqlite

# ==================== 依赖安装阶段 ====================
FROM base AS deps

# 复制 package 文件
COPY package*.json ./

# 配置 npm 镜像并安装依赖
# 使用环境变量设置 better-sqlite3 预编译二进制下载地址
RUN npm config set registry https://registry.npmmirror.com && \
    npm_config_better_sqlite3_binary_host=https://registry.npmmirror.com/-/binary/better-sqlite3 \
    npm install --omit=dev && npm cache clean --force

# ==================== 生产运行阶段 ====================
FROM base AS production

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001

# 复制依赖
COPY --from=deps /app/node_modules ./node_modules

# 复制源代码
COPY . .

# 创建数据目录
RUN mkdir -p /app/data /app/public/admin

# 创建非 root 用户运行
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -q --spider http://localhost:3001/api/health || exit 1

# 启动命令
CMD ["node", "index.js"]
