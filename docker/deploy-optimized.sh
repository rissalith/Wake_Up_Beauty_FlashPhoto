#!/bin/bash
# 醒美闪图 - Docker 优化架构部署脚本 (完整版)
# 用法: bash deploy-optimized.sh [start|stop|restart|update|logs|status|redis|migrate|ssl]
#
# 架构: 5 服务 (Nginx + Redis + Core API + AI Service + Pay Service)

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 项目目录
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# Docker Compose 文件
COMPOSE_FILE="docker-compose.optimized.yml"

# 打印函数
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查 Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装"
        exit 1
    fi

    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose 未安装"
        exit 1
    fi

    print_success "Docker 环境检查通过"
}

# 检查配置文件
check_config() {
    if [ ! -f "$PROJECT_DIR/docker/config/common.env" ]; then
        print_warning "common.env 不存在，正在从示例创建..."
        if [ -f "$PROJECT_DIR/docker/config/common.env.example" ]; then
            cp "$PROJECT_DIR/docker/config/common.env.example" "$PROJECT_DIR/docker/config/common.env"
            print_warning "请编辑 docker/config/common.env 填写实际配置"
        else
            print_error "common.env.example 不存在"
            exit 1
        fi
    fi
}

# 检查 SSL 证书
check_ssl() {
    local ssl_dir="$PROJECT_DIR/docker/nginx/ssl"

    if [ ! -f "$ssl_dir/fullchain.pem" ] || [ ! -f "$ssl_dir/privkey.pem" ]; then
        print_warning "SSL 证书不存在，将生成自签名证书用于测试..."
        mkdir -p "$ssl_dir"

        # 生成自签名证书
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$ssl_dir/privkey.pem" \
            -out "$ssl_dir/fullchain.pem" \
            -subj "/C=CN/ST=Beijing/L=Beijing/O=FlashPhoto/CN=pop-pub.com" \
            2>/dev/null

        print_warning "已生成自签名证书，生产环境请替换为正式证书"
        print_info "证书位置: $ssl_dir/"
    else
        print_success "SSL 证书检查通过"
    fi
}

# 检查管理后台前端
check_admin_frontend() {
    local admin_dir="$PROJECT_DIR/core-api/public/admin"

    if [ ! -d "$admin_dir" ] || [ ! -f "$admin_dir/index.html" ]; then
        print_warning "管理后台前端未构建"
        print_info "请执行以下命令构建前端:"
        echo "  cd admin-server/admin-web && npm install && npm run build"
        echo "  cp -r dist/* ../server/public/admin/"
        echo "  或"
        echo "  cp -r dist/* ../../core-api/public/admin/"
    else
        print_success "管理后台前端检查通过"
    fi
}

# 启动服务
start_services() {
    print_info "正在启动优化架构服务 (完整 Docker 化)..."

    check_docker
    check_config
    check_ssl
    check_admin_frontend

    # 清理旧容器
    cleanup_old_containers

    # 确保网络和卷存在
    ensure_resources

    docker compose -f "$COMPOSE_FILE" up -d --build

    print_success "服务启动完成！"
    echo ""
    print_info "服务状态:"
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    print_info "访问地址:"
    echo "  HTTP:  http://服务器IP/"
    echo "  HTTPS: https://pop-pub.com/"
    echo "  后台管理: https://pop-pub.com/admin"
    echo "  健康检查: https://pop-pub.com/health"
    echo ""
    print_info "服务列表:"
    echo "  Nginx:          80/443 (反向代理 + SSL)"
    echo "  Redis:          16379 (内部: 6379)"
    echo "  Core API:       内部 3001"
    echo "  AI Service:     内部 3002"
    echo "  Pay Service:    内部 3003"
    echo "  Deploy Webhook: 内部 3004"
}

# 停止服务
stop_services() {
    print_info "正在停止服务..."
    docker compose -f "$COMPOSE_FILE" down
    print_success "服务已停止"
}

# 重启服务
restart_services() {
    print_info "正在重启服务..."
    docker compose -f "$COMPOSE_FILE" restart
    print_success "服务已重启"
}

# 清理旧容器 (解决容器名冲突)
cleanup_old_containers() {
    print_info "清理旧容器..."

    # 停止并删除可能冲突的旧容器
    # 注意: 不清理 deploy-webhook，因为它可能正在执行部署
    local containers="flashphoto-nginx flashphoto-core-api flashphoto-ai-service flashphoto-pay-service flashphoto-redis flashphoto-miniprogram-api flashphoto-admin-api"

    for container in $containers; do
        if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            docker stop "$container" 2>/dev/null || true
            docker rm "$container" 2>/dev/null || true
            print_info "已清理: $container"
        fi
    done

    # 停止宝塔 Nginx (释放 80/443 端口)
    if netstat -tlnp 2>/dev/null | grep -q ':80 .*nginx'; then
        print_info "停止宝塔 Nginx..."
        /etc/init.d/nginx stop 2>/dev/null || killall nginx 2>/dev/null || true
        sleep 2
    fi
}

# 确保网络和卷存在
ensure_resources() {
    print_info "检查 Docker 网络和卷..."

    # 创建网络 (如果不存在)
    if ! docker network ls --format '{{.Name}}' | grep -q '^flashphoto-network$'; then
        print_info "创建网络: flashphoto-network"
        docker network create flashphoto-network
    fi

    # 创建数据卷 (如果不存在)
    if ! docker volume ls --format '{{.Name}}' | grep -q '^flashphoto-redis-data$'; then
        print_info "创建卷: flashphoto-redis-data"
        docker volume create flashphoto-redis-data
    fi

    if ! docker volume ls --format '{{.Name}}' | grep -q '^flashphoto-shared-data$'; then
        print_info "创建卷: flashphoto-shared-data"
        docker volume create flashphoto-shared-data
    fi

    if ! docker volume ls --format '{{.Name}}' | grep -q '^flashphoto-webhook-logs$'; then
        print_info "创建卷: flashphoto-webhook-logs"
        docker volume create flashphoto-webhook-logs
    fi

    print_success "Docker 资源检查完成"
}

# 构建管理后台前端
build_admin_frontend() {
    local admin_web_dir="$PROJECT_DIR/admin-server/admin-web"
    local target_dir="$PROJECT_DIR/core-api/public/admin"

    if [ ! -d "$admin_web_dir" ]; then
        print_warning "管理后台前端目录不存在: $admin_web_dir"
        return 1
    fi

    print_info "正在构建管理后台前端..."

    # 安装依赖
    cd "$admin_web_dir"
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        print_info "安装前端依赖..."
        npm install --silent
    fi

    # 构建（增加 Node.js 内存限制到 2GB 避免 OOM）
    print_info "执行前端构建..."
    NODE_OPTIONS='--max-old-space-size=2048' npm run build

    # 清理旧文件并复制新文件
    print_info "部署前端文件到 core-api..."
    mkdir -p "$target_dir"
    rm -rf "$target_dir"/*
    cp -r dist/* "$target_dir/"

    cd "$PROJECT_DIR"
    print_success "管理后台前端构建完成"
}

# 更新服务
# 参数: --skip-frontend 跳过前端构建
update_services() {
    local skip_frontend=false

    # 解析参数
    for arg in "$@"; do
        case $arg in
            --skip-frontend)
                skip_frontend=true
                ;;
        esac
    done

    print_info "正在更新服务..."

    # 清理旧容器
    cleanup_old_containers

    # 确保网络和卷存在
    ensure_resources

    # 构建管理后台前端（默认构建，除非指定跳过）
    if [ "$skip_frontend" = true ]; then
        print_info "跳过前端构建"
    else
        build_admin_frontend || print_warning "前端构建失败，继续部署..."
    fi

    # 拉取最新基础镜像（redis, nginx）
    docker compose -f "$COMPOSE_FILE" pull redis nginx --quiet || true

    # 启动服务（使用现有镜像，仅在代码变化时重建）
    # --no-deps 避免依赖问题，--remove-orphans 清理孤立容器
    docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans nginx redis core-api ai-service pay-service

    # 清理旧镜像
    docker image prune -f --filter "until=24h" || true

    print_success "服务更新完成"

    # 执行健康检查
    sleep 10
    health_check
}

# 查看日志
view_logs() {
    local service="${2:-}"
    if [ -n "$service" ]; then
        docker compose -f "$COMPOSE_FILE" logs -f --tail=100 "$service"
    else
        docker compose -f "$COMPOSE_FILE" logs -f --tail=100
    fi
}

# 查看状态
view_status() {
    print_info "服务状态:"
    docker compose -f "$COMPOSE_FILE" ps
    echo ""

    print_info "资源使用:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" \
        flashphoto-nginx flashphoto-redis flashphoto-core-api flashphoto-ai-service flashphoto-pay-service flashphoto-deploy-webhook 2>/dev/null || true
    echo ""

    print_info "数据卷:"
    docker volume ls | grep flashphoto
}

# Redis CLI
redis_cli() {
    print_info "进入 Redis CLI..."
    docker exec -it flashphoto-redis redis-cli
}

# 从旧架构迁移数据
migrate_data() {
    print_info "从旧架构迁移数据..."
    
    # 检查旧数据卷是否存在
    if docker volume ls | grep -q "flashphoto-miniprogram-data"; then
        print_info "发现旧数据卷 flashphoto-miniprogram-data"
        
        # 创建临时容器复制数据
        docker run --rm \
            -v flashphoto-miniprogram-data:/old-data:ro \
            -v flashphoto-core-data:/new-data \
            alpine sh -c "cp -r /old-data/* /new-data/ 2>/dev/null || true"
        
        print_success "数据迁移完成"
    else
        print_warning "未发现旧数据卷，跳过迁移"
    fi
}

# 备份数据
backup_data() {
    local backup_dir="$PROJECT_DIR/backups"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$backup_dir/flashphoto_backup_$timestamp.tar.gz"

    mkdir -p "$backup_dir"

    print_info "正在备份数据..."

    docker run --rm \
        -v flashphoto-core-data:/data:ro \
        -v "$backup_dir":/backup \
        alpine tar czf "/backup/flashphoto_backup_$timestamp.tar.gz" -C /data .

    print_success "备份完成: $backup_file"
}

# 回滚到上一版本
rollback() {
    local backup_dir="$PROJECT_DIR/backups"

    print_info "正在回滚到上一版本..."

    # 查找最新的备份文件
    local latest_backup=$(ls -t "$backup_dir"/*.tar.gz 2>/dev/null | head -1)

    if [ -z "$latest_backup" ]; then
        print_error "没有找到备份文件，无法回滚"
        exit 1
    fi

    print_info "使用备份: $latest_backup"

    # 停止服务
    print_info "停止服务..."
    docker compose -f "$COMPOSE_FILE" down

    # 恢复数据卷
    print_info "恢复数据..."
    docker run --rm \
        -v flashphoto-core-data:/data \
        -v "$backup_dir":/backup:ro \
        alpine sh -c "rm -rf /data/* && tar xzf /backup/$(basename $latest_backup) -C /data"

    # 重启服务
    print_info "重启服务..."
    docker compose -f "$COMPOSE_FILE" up -d

    print_success "回滚完成"

    # 执行健康检查
    sleep 10
    health_check
}

# 健康检查
health_check() {
    print_info "执行健康检查..."

    echo ""
    echo "Nginx:"
    curl -s http://localhost/health || echo "无法连接"
    echo ""
    echo ""
    echo "Core API:"
    curl -s http://localhost/health/core | head -c 200 || echo "无法连接"
    echo ""
    echo ""
    echo "AI Service:"
    curl -s http://localhost/health/ai | head -c 200 || echo "无法连接"
    echo ""
    echo ""
    echo "Pay Service:"
    curl -s http://localhost/health/pay | head -c 200 || echo "无法连接"
    echo ""
    echo ""
    echo "Deploy Webhook:"
    curl -s http://localhost/webhook/health | head -c 200 || echo "无法连接"
    echo ""
    echo ""
    echo "Redis:"
    docker exec flashphoto-redis redis-cli ping || echo "无法连接"
}

# 安装/更新 SSL 证书
setup_ssl() {
    local ssl_dir="$PROJECT_DIR/docker/nginx/ssl"
    mkdir -p "$ssl_dir"

    print_info "SSL 证书设置"
    echo ""
    echo "请将您的 SSL 证书文件放置到以下位置:"
    echo "  证书文件: $ssl_dir/fullchain.pem"
    echo "  私钥文件: $ssl_dir/privkey.pem"
    echo ""
    echo "如果使用 Let's Encrypt，可以使用 certbot:"
    echo "  certbot certonly --webroot -w /var/www/certbot -d pop-pub.com"
    echo ""

    if [ ! -f "$ssl_dir/fullchain.pem" ]; then
        read -p "是否生成自签名证书用于测试? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            check_ssl
        fi
    else
        print_success "SSL 证书已存在"
    fi
}

# 显示帮助
show_help() {
    echo "醒美闪图 - Docker 优化架构部署脚本 (完整版)"
    echo ""
    echo "用法: $0 <命令>"
    echo ""
    echo "命令:"
    echo "  start       启动所有服务"
    echo "  stop        停止所有服务"
    echo "  restart     重启所有服务"
    echo "  update      更新并重启服务"
    echo "  logs [服务] 查看日志"
    echo "  status      查看服务状态"
    echo "  redis       进入 Redis CLI"
    echo "  migrate     从旧架构迁移数据"
    echo "  backup      备份数据"
    echo "  rollback    回滚到上一版本"
    echo "  health      健康检查"
    echo "  ssl         SSL 证书设置"
    echo "  help        显示帮助"
    echo ""
    echo "服务列表:"
    echo "  nginx          - Nginx 反向代理 (SSL + 路由)"
    echo "  redis          - Redis 消息队列"
    echo "  core-api       - 统一后端 (小程序 + 后台管理)"
    echo "  ai-service     - AI 图片生成"
    echo "  pay-service    - 支付服务"
    echo "  deploy-webhook - 部署 Webhook (GitHub Actions 触发)"
    echo ""
    echo "示例:"
    echo "  $0 start           # 启动服务"
    echo "  $0 logs core-api   # 查看 Core API 日志"
    echo "  $0 logs nginx      # 查看 Nginx 日志"
    echo "  $0 health          # 健康检查"
    echo "  $0 ssl             # SSL 证书设置"
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
    migrate)
        migrate_data
        ;;
    backup)
        backup_data
        ;;
    rollback)
        rollback
        ;;
    health)
        health_check
        ;;
    ssl)
        setup_ssl
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
