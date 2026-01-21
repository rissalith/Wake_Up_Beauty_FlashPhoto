# 用户标识体系规范

## 一、三种 ID 说明

| ID 类型 | 作用范围 | 获取条件 | 用途 |
|---------|----------|----------|------|
| **openid** | 单个小程序内唯一 | 用户授权登录即可获取 | 微信支付、消息推送 |
| **unionid** | 同一开放平台下所有应用唯一 | 需绑定微信开放平台 | 跨应用识别同一用户 |
| **user_id** | 业务系统内唯一 | 首次登录时生成 | 业务数据关联的主键 |

## 二、数据库表结构

### users 表（用户主表）
```sql
CREATE TABLE users (
  id VARCHAR(100) PRIMARY KEY,      -- 业务主键 user_id（格式：u_时间戳_随机串）
  unionid VARCHAR(100) UNIQUE,      -- 微信 unionid（唯一索引）
  openid VARCHAR(100),              -- 当前小程序的 openid（兼容旧数据）
  nickname VARCHAR(100),
  avatar_url TEXT,
  points INTEGER DEFAULT 0,
  created_at DATETIME,
  updated_at DATETIME
);
```

### user_bindings 表（多应用绑定表）
```sql
CREATE TABLE user_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id VARCHAR(100) NOT NULL,    -- 关联 users.id
  app_type VARCHAR(20) NOT NULL,    -- 应用类型：miniapp/mp/app
  app_id VARCHAR(100) NOT NULL,     -- 微信 AppID
  openid VARCHAR(100) NOT NULL,     -- 该应用下的 openid
  created_at DATETIME,
  UNIQUE(app_id, openid)            -- 同一应用下 openid 唯一
);
CREATE INDEX idx_user_bindings_user_id ON user_bindings(user_id);
```

## 三、登录流程

```
小程序调用 wx.login() 获取 code
        ↓
后端用 code 换取 openid + unionid
        ↓
用 unionid 查 users 表
        ↓
    ┌───────────────────┐
    │ 用户存在？         │
    └───────────────────┘
      │是              │否
      ▼                ▼
返回 user_id      创建新用户，生成 user_id
      │                │
      └───────┬────────┘
              ▼
   在 user_bindings 记录当前小程序的 openid
              ▼
   返回 user_id 给前端存储
```

## 四、使用规范

### 前端存储
```javascript
// 登录成功后存储
wx.setStorageSync('userId', res.user_id)    // 业务主键，所有接口使用

// API 调用时传递
header: { 'X-User-Id': userId }
```

### 后端接口
- 所有业务接口统一使用 `user_id` 参数
- 微信支付、消息推送使用 `openid`（从 user_bindings 查询）

### 数据库关联
- 所有业务表（订单、积分记录等）关联 `user_id`
- 不要在业务表中存储 openid

## 五、各场景使用的 ID

| 场景 | 使用的 ID |
|------|-----------|
| 前端存储用户身份 | user_id |
| API 请求传参 | user_id |
| 数据库业务表关联 | user_id |
| 判断是否同一用户（跨应用） | unionid |
| 微信支付 | openid |
| 微信消息推送 | openid |

## 六、迁移脚本

运行以下命令创建 user_bindings 表并迁移现有数据：

```bash
cd admin-server/server
node scripts/migrate_user_bindings.js
```
