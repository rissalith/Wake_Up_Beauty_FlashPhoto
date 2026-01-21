# 醒美闪图 - 后台管理系统

为"醒美闪图"小程序提供的 Web 后台管理系统，支持用户、订单、照片、优惠券的统一管理。

## 技术栈

- **后端**: Node.js + Express + SQLite (better-sqlite3)
- **前端**: Vue 3 + Element Plus + ECharts
- **部署**: Docker

## 功能模块

- 仪表盘：数据总览、收入趋势图、优惠券使用统计
- 用户管理：用户列表、搜索、详情、关联订单/照片查看
- 订单管理：订单列表、筛选、统计
- 照片管理：照片列表、预览、删除
- 优惠券管理：类型配置、发放记录、使用统计

## 快速开始

### Docker 部署（推荐）

项目采用 Docker 微服务架构，所有服务都通过 Docker 容器运行。

```bash
# 进入项目根目录
cd miniprogram-1

# 使用优化的 Docker Compose 配置启动所有服务
docker-compose -f docker-compose.optimized.yml up -d --build

# 查看服务状态
docker-compose -f docker-compose.optimized.yml ps

# 查看日志
docker-compose -f docker-compose.optimized.yml logs -f
```

服务端口映射：
- Admin API: http://localhost:13000 (管理后台 API + 前端静态文件)
- Core API: http://localhost:13001 (小程序 API)
- AI Service: http://localhost:13002 (AI 图片生成)
- Pay Service: http://localhost:13003 (支付服务)
- Redis: localhost:16379

访问管理后台：https://pop-pub.com/admin (需配置 Nginx 反向代理)

### 前端开发部署

前端构建后需要部署到 Docker 容器挂载的目录：

```bash
# 1. 构建前端
cd admin-server/admin-web
npm run build

# 2. 部署到服务器（Docker 挂载目录）
scp -r dist/* root@your-server:/www/wwwroot/flashphoto/admin-server/server/public/admin/

# 容器会自动通过挂载卷访问这些文件
```

### 本地开发

仅用于前端开发调试：

```bash
# 1. 安装前端依赖
cd admin-server/admin-web
npm install

# 2. 启动前端开发服务器
npm run dev
```

前端开发服务器: http://localhost:5173 (Vite 默认端口)

**注意**: 本地开发时，前端会通过 vite.config.js 中的 proxy 配置连接到远程 API 服务器。

## 默认账户

- 用户名：`admin`
- 密码：`pXw1995`

## API 接口

### 认证
- `POST /api/auth/login` - 登录
- `POST /api/auth/logout` - 退出
- `GET /api/auth/info` - 获取当前管理员信息

### 用户管理
- `GET /api/users` - 用户列表
- `GET /api/users/:id` - 用户详情
- `GET /api/users/:id/orders` - 用户订单
- `GET /api/users/:id/photos` - 用户照片

### 订单管理
- `GET /api/orders` - 订单列表
- `GET /api/orders/:id` - 订单详情
- `GET /api/orders/stats/summary` - 订单统计

### 照片管理
- `GET /api/photos` - 照片列表
- `DELETE /api/photos/:id` - 删除照片

### 优惠券管理
- `GET /api/coupons` - 优惠券列表
- `GET /api/coupons/types` - 类型列表
- `POST /api/coupons/types` - 创建类型
- `PUT /api/coupons/types/:id` - 更新类型
- `DELETE /api/coupons/types/:id` - 删除类型

### 统计
- `GET /api/stats/overview` - 数据总览
- `GET /api/stats/daily` - 每日统计
- `GET /api/stats/revenue` - 收入统计

### 小程序数据同步
- `POST /api/sync/user` - 同步用户
- `POST /api/sync/order` - 同步订单
- `POST /api/sync/photo` - 同步照片
- `POST /api/sync/coupon` - 同步优惠券
- `POST /api/sync/batch` - 批量同步

## 目录结构

```
admin-server/
├── server/                 # 后端服务
│   ├── app.js             # Express 入口
│   ├── config/            # 配置文件
│   │   ├── auth.js        # 认证配置
│   │   └── database.js    # 数据库配置
│   ├── middleware/        # 中间件
│   │   └── auth.js        # JWT 认证
│   ├── routes/            # API 路由
│   │   ├── auth.js        # 认证路由
│   │   ├── users.js       # 用户管理
│   │   ├── orders.js      # 订单管理
│   │   ├── photos.js      # 照片管理
│   │   ├── coupons.js     # 优惠券管理
│   │   ├── stats.js       # 统计
│   │   └── sync.js        # 数据同步
│   └── database/          # SQLite 数据库文件
│
├── admin-web/             # 前端管理界面
│   ├── src/
│   │   ├── views/         # 页面组件
│   │   ├── api/           # API 调用
│   │   ├── router/        # 路由配置
│   │   ├── store/         # 状态管理
│   │   └── styles/        # 全局样式
│   └── dist/              # 构建输出
│
├── Dockerfile             # Docker 镜像配置
├── docker-compose.yml     # Docker Compose 配置
└── README.md
```

## 小程序数据同步

后台管理系统提供了数据同步接口，小程序可以调用这些接口将本地数据同步到后端。

示例代码：
```javascript
// 同步用户信息
wx.request({
  url: 'https://your-domain.com/api/sync/user',
  method: 'POST',
  data: {
    user_id: 'xxx',
    nickname: '用户昵称',
    avatar_url: 'https://...'
  }
})

// 同步订单
wx.request({
  url: 'https://your-domain.com/api/sync/order',
  method: 'POST',
  data: {
    order_id: 'ORD_xxx',
    user_id: 'xxx',
    amount: 9.9,
    // ...
  }
})
```

## 注意事项

1. 首次启动会自动创建数据库和默认管理员账户
2. 数据库文件存储在 `server/database/xingmei.db`
3. Docker 部署时数据库会持久化到 `./data/database` 目录
4. 生产环境建议修改 JWT_SECRET 环境变量
