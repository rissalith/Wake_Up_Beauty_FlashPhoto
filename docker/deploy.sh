#!/bin/bash
# 醒美闪图 - Docker 一键部署脚本 (v2 - Redis 消息队列版)
# 用法: bash deploy.sh [start|stop|restart|update|logs|status|redis]
# 
# 架构特点:
# - Redis 消息队列实现服务间异步通信
# - 服务完全解耦，无直接 HTTP 依赖
# - 支持独立扩展和部署

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目目录
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# 打印带颜色的消息
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装，正在安装..."
        install_docker
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose 未安装"
        exit 1
    fi
    
    print_success "Docker 环境检查通过"
}

# 安装 Docker
install_docker() {
    print_info "正在安装 Docker..."
    
    # 检测系统类型
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        apt-get update
        apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    elif [ -f /etc/redhat-release ]; then
        # CentOS/RHEL
        yum install -y yum-utils
        yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    else
        print_error "不支持的操作系统，请手动安装 Docker"
        exit 1
    fi
    
    # 启动 Docker
    systemctl start docker
    systemctl enable docker
    
    print_success "Docker 安装完成"
}

# 检查环境变量文件
check_env() {
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        print_warning ".env 文件不存在，正在从示例文件创建..."
        if [ -f "$PROJECT_DIR/.env.example" ]; then
            cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
            print_warning "请编辑 .env 文件填写实际配置值"
            print_info "vim $PROJECT_DIR/.env"
        else
            print_error ".env.example 文件不存在"
            exit 1
        fi
    fi
}

# 检查 SSL 证书
check_ssl() {
    SSL_DIR="$PROJECT_DIR/docker/nginx/ssl"
    if [ ! -f "$SSL_DIR/fullchain.pem" ] || [ ! -f "$SSL_DIR/privkey.pem" ]; then
        print_warning "SSL 证书不存在，将使用 HTTP 模式 (端口 8080)"
        print_info "如需 HTTPS，请将证书放置到: $SSL_DIR/"
        print_info "  - fullchain.pem (证书链)"
        print_info "  - privkey.pem (私钥)"
    fi
}

# 启动服务
start_services() {
    print_info "正在启动服务..."
    
    check_docker
    check_env
    check_ssl
    
    # 构建并启动
    docker compose up -d --build
    
    print_success "服务启动完成！"
    echo ""
    print_info "服务状态:"
    docker compose ps
    echo ""
    print_info "访问地址:"
    echo "  - 后台管理: https://pop-pub.com/admin (或 http://localhost:8080/admin)"
    echo "  - 小程序API: https://pop-pub.com/api"
    echo "  - 健康检查: https://pop-pub.com/health"
}

# 停止服务
stop_services() {
    print_info "正在停止服务..."
    docker compose down
    print_success "服务已停止"
}

# 重启服务
restart_services() {
    print_info "正在重启服务..."
    docker compose restart
    print_success "服务已重启"
}

# 更新服务
update_services() {
    print_info "正在更新服务..."
    
    # 拉取最新代码 (如果是 git 仓库)
    if [ -d ".git" ]; then
        git pull
    fi
    
    # 重新构建并启动
    docker compose up -d --build
    
    # 清理旧镜像
    docker image prune -f
    
    print_success "服务更新完成"
}

# 查看日志
view_logs() {
    SERVICE=${2:-""}
    if [ -n "$SERVICE" ]; then
        docker compose logs -f "$SERVICE"
    else
        docker compose logs -f
    fi
}

# 查看状态
view_status() {
    print_info "容器状态:"
    docker compose ps
    echo ""
    print_info "资源使用:"
    docker stats --no-stream
}

# 备份数据
backup_data() {
    BACKUP_DIR="$PROJECT_DIR/backups"
    BACKUP_FILE="$BACKUP_DIR/flashphoto-backup-$(date +%Y%m%d_%H%M%S).tar.gz"
    
    mkdir -p "$BACKUP_DIR"
    
    print_info "正在备份数据..."
    
    # 备份 Docker 卷数据
    docker run --rm \
        -v flashphoto-miniprogram-data:/data/miniprogram \
        -v flashphoto-admin-data:/data/admin \
        -v "$BACKUP_DIR":/backup \
        alpine tar czf "/backup/$(basename $BACKUP_FILE)" -C /data .
    
    print_success "备份完成: $BACKUP_FILE"
}

# 恢复数据
restore_data() {
    BACKUP_FILE=$2
    if [ -z "$BACKUP_FILE" ]; then
        print_error "请指定备份文件路径"
        echo "用法: $0 restore /path/to/backup.tar.gz"
        exit 1
    fi
    
    if [ ! -f "$BACKUP_FILE" ]; then
        print_error "备份文件不存在: $BACKUP_FILE"
        exit 1
    fi
    
    print_warning "这将覆盖现有数据，是否继续? (y/N)"
    read -r confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "操作已取消"
        exit 0
    fi
    
    print_info "正在恢复数据..."
    
    # 停止服务
    docker compose down
    
    # 恢复数据
    docker run --rm \
        -v flashphoto-miniprogram-data:/data/miniprogram \
        -v flashphoto-admin-data:/data/admin \
        -v "$(dirname $BACKUP_FILE)":/backup \
        alpine tar xzf "/backup/$(basename $BACKUP_FILE)" -C /data
    
    # 启动服务
    docker compose up -d
    
    print_success "数据恢复完成"
}

# 清理资源
cleanup() {
    print_warning "这将删除所有未使用的 Docker 资源，是否继续? (y/N)"
    read -r confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "操作已取消"
        exit 0
    fi
    
    print_info "正在清理..."
    docker system prune -af
    print_success "清理完成"
}

# 显示帮助
show_help() {
    echo "醒美闪图 - Docker 部署脚本"
    echo ""
    echo "用法: $0 <命令> [参数]"
    echo ""
    echo "命令:"
    echo "  start       启动所有服务"
    echo "  stop        停止所有服务"
    echo "  restart     重启所有服务"
    echo "  update      更新并重启服务"
    echo "  logs [服务] 查看日志 (可指定服务名)"
    echo "  status      查看服务状态"
    echo "  redis       进入 Redis CLI"
    echo "  backup      备份数据"
    echo "  restore     恢复数据"
    echo "  cleanup     清理未使用的 Docker 资源"
    echo "  help        显示此帮助信息"
    echo ""
    echo "服务列表:"
    echo "  redis           - Redis 消息队列"
    echo "  miniprogram-api - 小程序 API 服务"
    echo "  admin-api       - 后台管理 API 服务"
    echo "  ai-service      - AI 图片生成服务"
    echo "  pay-service     - 支付服务"
    echo ""
    echo "示例:"
    echo "  $0 start              # 启动所有服务"
    echo "  $0 logs pay-service   # 查看支付服务日志"
    echo "  $0 redis              # 进入 Redis CLI"
    echo "  $0 backup             # 备份数据"
}

# Redis CLI
redis_cli() {
    print_info "进入 Redis CLI..."
    docker exec -it flashphoto-redis redis-cli
}

# 主入口
case "${1:-help}" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    update)
        update_services
        ;;
    logs)
        view_logs "$@"
        ;;
    status)
        view_status
        ;;
    redis)
        redis_cli
        ;;
    backup)
        backup_data
        ;;
    restore)
        restore_data "$@"
        ;;
    cleanup)
        cleanup
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "未知命令: $1"
        show_help
        exit 1
        ;;
esac
