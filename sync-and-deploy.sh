#!/bin/bash
# 醒美闪图 - 本地同步并远程部署脚本
# 用法: bash sync-and-deploy.sh
#
# 功能:
# 1. 使用 rsync/scp 同步修改的文件到服务器
# 2. SSH 到服务器执行部署命令

set -e

# 从 .env.deploy 读取配置
source .env.deploy 2>/dev/null || {
    echo "错误: 找不到 .env.deploy 文件"
    exit 1
}

# 服务器配置
SERVER="${SERVER_USER}@${SERVER_IP}"
REMOTE_PATH="/www/wwwroot/flashphoto"

echo "=========================================="
echo "  醒美闪图 - 同步部署"
echo "=========================================="
echo "服务器: ${SERVER_IP}"
echo "路径: ${REMOTE_PATH}"
echo ""

# 需要同步的文件
FILES_TO_SYNC=(
    "docker-compose.optimized.yml"
    "docker/nginx/nginx.docker.conf"
    "docker/nginx/conf.d/docker.conf"
    "docker/nginx/ssl/README.md"
    "docker/deploy-optimized.sh"
    "CLAUDE.md"
)

echo "[1/3] 同步文件到服务器..."
for file in "${FILES_TO_SYNC[@]}"; do
    if [ -f "$file" ]; then
        echo "  上传: $file"
        # 确保远程目录存在
        remote_dir=$(dirname "${REMOTE_PATH}/${file}")
        sshpass -p "${SERVER_PASSWORD}" ssh -o StrictHostKeyChecking=no ${SERVER} "mkdir -p ${remote_dir}"
        # 上传文件
        sshpass -p "${SERVER_PASSWORD}" scp -o StrictHostKeyChecking=no "$file" "${SERVER}:${REMOTE_PATH}/${file}"
    else
        echo "  跳过 (不存在): $file"
    fi
done

echo ""
echo "[2/3] 在服务器上执行部署..."
sshpass -p "${SERVER_PASSWORD}" ssh -o StrictHostKeyChecking=no ${SERVER} << 'REMOTE_SCRIPT'
cd /www/wwwroot/flashphoto

echo "停止旧服务..."
docker compose down 2>/dev/null || true
docker compose -f docker-compose.optimized.yml down 2>/dev/null || true

echo "重命名旧配置文件..."
mv docker/nginx/conf.d/default.conf docker/nginx/conf.d/default.conf.bak 2>/dev/null || true
mv docker/nginx/conf.d/pop-pub.com.optimized.conf docker/nginx/conf.d/pop-pub.com.optimized.conf.bak 2>/dev/null || true

echo "启动新架构..."
bash docker/deploy-optimized.sh start

echo "查看服务状态..."
docker compose -f docker-compose.optimized.yml ps
REMOTE_SCRIPT

echo ""
echo "[3/3] 部署完成!"
echo ""
echo "访问地址:"
echo "  后台管理: https://pop-pub.com/admin"
echo "  健康检查: https://pop-pub.com/health"
