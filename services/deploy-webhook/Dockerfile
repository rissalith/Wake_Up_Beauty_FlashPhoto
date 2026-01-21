FROM m.daocloud.io/docker.io/library/node:18-alpine

WORKDIR /app

# 安装 git 和 docker CLI（用于执行部署命令）
RUN apk add --no-cache git docker-cli bash

# 复制 package.json
COPY package.json ./

# 安装依赖（当前无外部依赖）
RUN npm install --production 2>/dev/null || true

# 复制源码
COPY index.js ./

# 创建日志目录
RUN mkdir -p /app/logs

EXPOSE 3004

CMD ["node", "index.js"]
