# 服务端重构指南

## 重构目标

将 1795 行的单体 `index.js` 拆分为模块化的路由和工具层，提升代码可维护性和可扩展性。

## 已完成的工作

### 1. 创建的新文件

```
server/
├── utils/
│   └── database.js          # 数据库工具模块（已完成）
├── routes/
│   ├── user.js              # 用户路由模块（已完成）
│   └── points.js            # 积分路由模块（已完成）
└── index.new.js             # 精简版入口文件示例（已完成）
```

### 2. 模块说明

#### [utils/database.js](utils/database.js)
- 数据库初始化和连接管理
- 表结构创建
- 工具函数：`getDb()`, `saveDatabase()`, `getRewardConfig()`, `findUserByIdOrOpenid()`, `dbRun()`

#### [routes/user.js](routes/user.js)
包含以下路由：
- `POST /wx-login` - 微信登录
- `POST /login` - 用户登录/注册
- `GET /:userId` - 获取用户信息
- `PUT /:userId` - 更新用户信息

#### [routes/points.js](routes/points.js)
包含以下路由：
- `GET /balance/:userId` - 获取积分余额
- `POST /consume` - 消费积分
- `POST /recharge` - 充值积分
- `POST /refund` - 退还积分
- `GET /records/:userId` - 获取积分记录

#### [index.new.js](index.new.js)
精简版入口文件（仅 80 行），展示重构后的结构：
- 导入数据库工具和路由模块
- 配置中间件
- 注册路由
- 全局错误处理

## 待完成的工作

### 3. 需要创建的路由模块

```
routes/
├── photo.js              # 照片相关路由
├── invite.js             # 邀请相关路由
├── admin.js              # 管理后台路由
├── payment.js            # 虚拟支付路由
├── internal.js           # 内部服务路由
└── config.js             # 配置相关路由（已存在，需整合）
```

### 4. 路由分类

#### photo.js - 照片路由
```
POST   /create              # 创建照片记录
PUT    /:photoId            # 更新照片
GET    /history/:userId     # 获取照片历史
DELETE /:photoId            # 删除照片
POST   /batch-delete        # 批量删除
```

#### invite.js - 邀请路由
```
GET /stats/:userId          # 邀请统计
GET /records/:userId        # 邀请记录
```

#### admin.js - 管理后台路由
```
POST /login                 # 管理员登录
GET  /env                   # 获取环境信息
POST /env/switch            # 切换环境
GET  /dashboard             # 仪表盘数据
GET  /users                 # 用户列表
POST /users/:userId/adjust-points    # 调整用户积分
POST /users/:userId/toggle-status    # 切换用户状态
GET  /points-records        # 积分记录列表
GET  /photos                # 照片列表
```

#### payment.js - 虚拟支付路由
```
POST /create-order          # 创建订单
POST /notify/deliver        # 发货通知
POST /notify/coin-pay       # 代币支付通知
GET  /order/:orderId        # 查询订单
POST /cancel/:orderId       # 取消订单
GET  /coin-balance          # 查询代币余额
```

#### internal.js - 内部服务路由
```
POST /orders/create         # 创建订单（内部）
POST /orders/complete       # 完成订单（内部）
GET  /orders/:orderId       # 查询订单（内部）
```

## 迁移步骤

### 方案 A：渐进式迁移（推荐）

1. **保留原 index.js，逐步迁移**
   ```bash
   # 当前文件
   server/index.js          # 保持不变，继续运行

   # 新文件
   server/index.new.js      # 新的入口文件
   server/routes/*.js       # 新的路由模块
   server/utils/database.js # 数据库工具
   ```

2. **测试新路由**
   ```bash
   # 启动新服务（使用不同端口）
   PORT=3002 node server/index.new.js

   # 测试用户登录
   curl -X POST http://localhost:3002/api/user/login \
     -H "Content-Type: application/json" \
     -d '{"openid":"test","unionid":"test123","nickname":"测试用户"}'

   # 测试积分查询
   curl http://localhost:3002/api/points/balance/USER_ID
   ```

3. **逐步替换**
   - 确认新路由工作正常后
   - 备份原 index.js：`cp index.js index.old.js`
   - 替换：`mv index.new.js index.js`
   - 重启服务：`pm2 restart miniprogram-api`

### 方案 B：一次性完整重构

1. **完成所有路由模块创建**
   - 创建 photo.js, invite.js, admin.js, payment.js, internal.js
   - 从原 index.js 中提取对应代码

2. **创建中间件层**
   ```
   middleware/
   ├── auth.js              # 认证中间件
   ├── validate.js          # 参数验证
   └── errorHandler.js      # 错误处理
   ```

3. **完整替换**
   - 备份原文件
   - 全面测试
   - 一次性切换

## 关键注意事项

### 1. 数据库工具函数访问

新路由通过 `req.app.locals` 访问数据库工具：

```javascript
// 在路由中使用
const { getDb, saveDatabase, dbRun } = req.app.locals;
const db = getDb();
```

### 2. 环境变量

确保 `.env` 文件包含必要配置：
```
NODE_ENV=production
PORT=3001
WX_APPID=your_appid
WX_SECRET=your_secret
```

### 3. 依赖包

无需安装新依赖，使用现有的：
- express
- better-sqlite3
- cors
- dotenv
- uuid

### 4. 向后兼容

新路由完全兼容原有 API 端点：
- `/api/user/*` → `routes/user.js`
- `/api/points/*` → `routes/points.js`

## 测试清单

- [ ] 用户登录/注册
- [ ] 获取用户信息
- [ ] 更新用户信息
- [ ] 积分余额查询
- [ ] 积分消费
- [ ] 积分充值
- [ ] 积分记录查询
- [ ] 健康检查 `/api/health`

## 性能对比

### 重构前
- 单文件：1795 行
- 路由数量：40+
- 可维护性：❌ 差

### 重构后
- 入口文件：~80 行
- 路由模块：6-8 个文件
- 工具模块：1 个文件
- 可维护性：✅ 优秀

## 下一步优化建议

1. **添加 Service 层**
   - 将业务逻辑从路由中提取到 services/
   - 路由只负责请求处理和响应

2. **统一错误处理**
   - 创建 `middleware/errorHandler.js`
   - 统一错误响应格式

3. **参数验证**
   - 使用 Joi 或 Yup 进行参数验证
   - 创建 `middleware/validate.js`

4. **日志系统**
   - 引入 Winston 或 Pino
   - 结构化日志输出

5. **API 版本控制**
   - 添加 `/api/v1/` 前缀
   - 为未来版本预留空间

## 回滚方案

如果新版本出现问题：

```bash
# 停止服务
pm2 stop miniprogram-api

# 恢复原文件
cp index.old.js index.js

# 重启服务
pm2 start index.js --name miniprogram-api
```

## 联系方式

如有问题，请查看：
- 原始分析报告（已生成）
- 本重构指南
- 代码注释
