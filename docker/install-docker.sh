#!/bin/bash
# Docker 一键安装脚本
# 支持 Ubuntu/Debian/CentOS

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    print_error "请使用 root 用户运行此脚本"
    print_info "sudo bash $0"
    exit 1
fi

print_info "=========================================="
print_info "  Docker 一键安装脚本"
print_info "=========================================="

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
else
    print_error "无法检测操作系统"
    exit 1
fi

print_info "检测到操作系统: $OS $VERSION"

# 卸载旧版本
print_info "正在卸载旧版本 Docker (如果存在)..."
case $OS in
    ubuntu|debian)
        apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
        ;;
    centos|rhel|fedora)
        yum remove -y docker docker-client docker-client-latest docker-common \
            docker-latest docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null || true
        ;;
esac

# 安装依赖
print_info "正在安装依赖..."
case $OS in
    ubuntu|debian)
        apt-get update
        apt-get install -y \
            apt-transport-https \
            ca-certificates \
            curl \
            gnupg \
            lsb-release
        ;;
    centos|rhel)
        yum install -y yum-utils
        ;;
esac

# 添加 Docker 仓库
print_info "正在添加 Docker 仓库..."
case $OS in
    ubuntu)
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        ;;
    debian)
        curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        ;;
    centos|rhel)
        yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        ;;
esac

# 安装 Docker
print_info "正在安装 Docker..."
case $OS in
    ubuntu|debian)
        apt-get update
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        ;;
    centos|rhel)
        yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        ;;
esac

# 启动 Docker
print_info "正在启动 Docker 服务..."
systemctl start docker
systemctl enable docker

# 配置 Docker 镜像加速 (国内服务器)
print_info "正在配置 Docker 镜像加速..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
    "registry-mirrors": [
        "https://mirror.ccs.tencentyun.com",
        "https://docker.mirrors.ustc.edu.cn"
    ],
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "100m",
        "max-file": "3"
    }
}
EOF

# 重启 Docker 以应用配置
systemctl daemon-reload
systemctl restart docker

# 验证安装
print_info "正在验证安装..."
docker --version
docker compose version

print_info "=========================================="
print_info "  Docker 安装完成!"
print_info "=========================================="
echo ""
print_info "Docker 版本: $(docker --version)"
print_info "Docker Compose 版本: $(docker compose version)"
echo ""
print_info "现在可以运行部署脚本了:"
print_info "  cd /www/wwwroot/flashphoto"
print_info "  ./docker/deploy.sh start"
