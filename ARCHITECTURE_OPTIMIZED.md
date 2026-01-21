# 醒美闪图 - 优化架构说明

## 架构对比

### 优化前 (5 服务)
```
┌─────────────────────────────────────────────────────────────┐
│                      外部 Nginx                              │
└─────────────────────────────────────────────────────────────┘
                              │
    ┌─────────────┬───────────┼───────────┬─────────────┐
    │             │           │           │             │
    ▼             ▼           ▼           ▼             ▼
┌───────┐   ┌───────────┐ ┌───────────┐ ┌─────────┐ ┌───────┐
│admin- │   │miniprogram│ │ai-service │ │pay-     │ │Redis  │
│api    │   │-api       │ │           │ │service  │ │       │
│:13000 │   │:13001     │ │:13002     │ │:13003   │ │:16379 │
└───┬───┘   └─────┬─────┘ └───────────┘ └────┬────┘ └───────┘
    │             │                          │
    ▼             ▼                          │
┌───────┐   ┌───────────┐                   │
│SQLite │   │ SQLite    │◄──────Redis───────┘
│(独立) │   │(test/prod)│
└───────┘   └───────────┘

问题:
- 数据库分散，数据孤岛
- 代码重复 (用户/订单/积分管理)
- 服务间依赖复杂
- 5 个容器，资源占用高
```

### 优化后 (4 服务)
```
┌─────────────────────────────────────────────────────────────┐
│                      外部 Nginx                              │
│              (SSL终止 + 路由分发)                            │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
   ┌───────────┐        ┌───────────┐        ┌───────────┐
   │ Core API  │        │ai-service │        │pay-service│
   │  :13001   │        │  :13002   │        │  :13003   │
   │           │        │           │        │           │
   │ 小程序API │        │ AI图片    │        │ 微信支付  │
   │ 后台管理  │        │ 生成      │        │ 虚拟支付  │
   └─────┬─────┘        └───────────┘        └─────┬─────┘
         │                                         │
         │          ┌───────────┐                  │
         └─────────►│   Redis   │◄─────────────────┘
                    │  :16379   │
                    │           │
                    │ 消息队列  │
                    │ 缓存      │
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │  SQLite   │
                    │  (统一)   │
                    └───────────┘

优势:
✅ 统一数据库，无数据孤岛
✅ 代码复用，DRY原则
✅ 服务完全解耦
✅ 4 个容器，资源节省 20%
✅ 单一后端入口，易于维护
```

## 文件结构

```
miniprogram-1/
├── core-api/                    # 统一后端服务 (新)
│   ├── index.js                 # 主入口
│   ├── package.json
│   ├── Dockerfile
│   ├── config/
│   │   └── database.js          # 统一数据库配置
│   ├── lib/
│   │   └── redis-message-handler.js
│   ├── routes/
│   │   ├── miniprogram/         # 小程序端路由
│   │   │   ├── user.js
│   │   │   ├── points.js
│   │   │   ├── photo.js
│   │   │   ├── invite.js
│   │   │   ├── config.js
│   │   │   └── virtual-pay.js
│   │   └── admin/               # 后台管理路由
│   │       ├── auth.js
│   │       ├── users.js
│   │       ├── stats.js
│   │       ├── config.js
│   │       └── scenes.js
│   └── public/                  # 静态文件
│       └── admin/               # 后台前端
│
├── services/
│   ├── ai-service/              # AI 服务 (保持不变)
│   └── pay-service/             # 支付服务 (Redis 版)
│
├── docker/
│   ├── config/
│   │   ├── common.env           # 通用配置
│   │   └── common.env.example
│   ├── certs/                   # SSL 证书
│   ├── deploy-optimized.sh      # 优化版部署脚本
│   └── deploy.sh                # 旧版部署脚本
│
├── docker-compose.optimized.yml # 优化版编排文件
├── docker-compose.yml           # 旧版编排文件
│
├── server/                      # 旧 miniprogram-api (可删除)
├── admin-server/                # 旧 admin-api (可删除)
```

## API 路由映射

### Core API (:13001)

| 路由前缀 | 用途 | 说明 |
|---------|------|------|
| `/api/user/*` | 小程序用户 | 登录、注册、信息管理 |
| `/api/points/*` | 小程序积分 | 余额、消费、充值、记录 |
| `/api/photo/*` | 小程序照片 | 创建、历史、删除 |
| `/api/invite/*` | 小程序邀请 | 统计、记录 |
| `/api/config/*` | 小程序配置 | 公开配置、场景 |
| `/api/virtual-pay/*` | 虚拟支付 | iOS 虚拟支付 |
| `/api/admin/auth/*` | 后台认证 | 登录、验证 |
| `/api/admin/users/*` | 后台用户 | 用户管理 |
| `/api/admin/stats/*` | 后台统计 | 仪表盘、趋势 |
| `/api/admin/config/*` | 后台配置 | 系统配置、奖励 |
| `/api/admin/scenes/*` | 后台场景 | 场景管理 |
| `/api/health` | 健康检查 | 服务状态 |

## 部署步骤

### 1. 配置环境变量

```bash
cp docker/config/common.env.example docker/config/common.env
vim docker/config/common.env  # 编辑填写实际值
```

### 2. 启动服务

```bash
bash docker/deploy-optimized.sh start
```

### 3. 迁移旧数据 (可选)

```bash
bash docker/deploy-optimized.sh migrate
```

### 4. 健康检查

```bash
bash docker/deploy-optimized.sh health
```

## Nginx 配置更新

更新外部 Nginx 配置，将原来的两个 upstream 合并：

```nginx
# 旧配置
upstream admin_api { server 127.0.0.1:13000; }
upstream core_api { server 127.0.0.1:13001; }

# 新配置 - 统一后端
upstream core_api {
    server 127.0.0.1:13001;
    keepalive 32;
}

# 小程序 API
location /api/ {
    proxy_pass http://core_api;
}

# 后台管理 API (统一到 core_api)
location /admin-api/ {
    rewrite ^/admin-api/(.*)$ /api/admin/$1 break;
    proxy_pass http://core_api;
}

# 后台管理前端
location /admin {
    proxy_pass http://core_api;
}
```

## 资源对比

| 指标 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| 容器数量 | 5 | 4 | 20% |
| 内存占用 | ~1.2GB | ~900MB | 25% |
| 代码行数 | ~5000 | ~3000 | 40% |
| 数据库文件 | 3个 | 1个 | 67% |

## 回滚方案

如需回滚到旧架构：

```bash
# 停止新架构
docker compose -f docker-compose.optimized.yml down

# 启动旧架构
docker compose -f docker-compose.yml up -d
```
