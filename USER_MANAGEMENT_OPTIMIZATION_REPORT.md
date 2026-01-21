# 用户管理优化分析报告

> 本报告是对 `USER_ID_ANALYSIS_REPORT.md` 的补充，涵盖该报告未提及的其他用户管理优化点。

---

## 一、安全性问题

### 1.1 🔴 用户信息更新接口缺乏严格身份验证

**位置**: [`admin-server/server/routes/users.js:487-555`](admin-server/server/routes/users.js:487)

```javascript
// 更新用户信息（小程序端使用）
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { nickname, avatarUrl } = req.body;

  // 安全验证：检查请求者是否有权修改该用户信息
  const requestUserId = req.headers['x-user-id'];
  if (requestUserId && requestUserId !== id) {
    return res.status(403).json({ code: 403, message: '无权修改他人信息' });
  }
  // ...
```

**问题**:
- 仅依赖 `x-user-id` header 进行身份验证，容易被伪造
- 没有使用 JWT token 验证用户身份
- 如果不传 `x-user-id`，验证逻辑被跳过

**建议修复**:
```javascript
// 使用 JWT 中间件验证身份
router.put('/:id', userAuthMiddleware, (req, res) => {
  const { id } = req.params;
  const authenticatedUserId = req.user.userId; // 从 JWT 解析
  
  if (authenticatedUserId !== id) {
    return res.status(403).json({ code: 403, message: '无权修改他人信息' });
  }
  // ...
});
```

### 1.2 🔴 用户统计接口无身份验证

**位置**: [`admin-server/server/routes/users.js:421-459`](admin-server/server/routes/users.js:421)

```javascript
// 获取用户统计数据（小程序端使用，无需认证）
router.get('/stats/:userId', (req, res) => {
  const { userId } = req.params;
  // 直接返回用户统计数据，无任何验证
```

**问题**:
- 任何人都可以查询任意用户的统计数据
- 可能泄露用户消费习惯等敏感信息

**建议**: 添加身份验证，只允许用户查询自己的统计数据。

### 1.3 🟡 协议签署接口缺乏防重放攻击

**位置**: [`admin-server/server/routes/users.js:783-834`](admin-server/server/routes/users.js:783)

```javascript
router.post('/sign-agreement', (req, res) => {
  const { userId, agreementType } = req.body;
  // 没有验证请求来源，没有时间戳或 nonce
```

**问题**:
- 没有请求签名验证
- 可能被恶意重放

---

## 二、数据一致性问题

### 2.1 🔴 用户注销时数据清理不完整

**位置**: [`admin-server/server/routes/users.js:1047-1099`](admin-server/server/routes/users.js:1047)

```javascript
router.delete('/:id', authMiddleware, (req, res) => {
  // 删除了多个表的数据，但缺少以下表：
  // - coupons 表（优惠券）
  // - 可能的其他关联表
```

**问题**:
- 用户注销后，优惠券数据未清理
- 没有软删除机制，无法恢复误删用户
- 没有注销冷静期

**建议**:
```javascript
// 1. 添加软删除机制
run('UPDATE users SET status = "deleted", deleted_at = datetime("now") WHERE id = ?', [id]);

// 2. 添加注销冷静期（7天）
// 在冷静期内可以恢复账号

// 3. 清理所有关联数据
const relatedTables = [
  'points_records', 'photo_history', 'orders', 'user_agreements',
  'invites', 'feedbacks', 'virtual_pay_orders', 'user_bindings', 'coupons'
];
```

### 2.2 🟡 积分记录表名不统一

**位置**: 多个文件

| 服务 | 表名 | 余额字段 |
|------|------|----------|
| admin-server (共享DB) | `points_records` | `balance_after` |
| admin-server (独立DB) | `point_records` | `balance` |
| server | `points_records` | `balance_after` |
| core-api | `points_records` | `balance_after` |

**问题**: 表名和字段名不一致，增加维护成本。

### 2.3 🟡 用户创建时缺少事务保护

**位置**: [`admin-server/server/routes/users.js:216-311`](admin-server/server/routes/users.js:216)

```javascript
// 创建新用户
run(`INSERT INTO users ...`);

// 处理邀请关系
if (inviterId) {
  // 多个独立的数据库操作，没有事务包装
  run(`INSERT INTO invites ...`);
  run(`UPDATE users SET points = ...`);
  run(`INSERT INTO points_records ...`);
}

// 记录新用户赠送积分
run(`INSERT INTO points_records ...`);
```

**问题**: 如果中间某步失败，会导致数据不一致。

**建议**: 使用事务包装：
```javascript
const { transaction } = require('../config/database');

transaction(() => {
  // 所有数据库操作
})();
```

---

## 三、功能缺失

### 3.1 🟡 缺少用户封禁/解封功能

**现状**: 数据库有 `status` 字段，但没有对应的管理接口。

**建议添加**:
```javascript
// 封禁用户
router.post('/:id/ban', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { reason, duration } = req.body; // duration: 封禁时长（天），-1 为永久
  
  run(`UPDATE users SET status = 'banned', ban_reason = ?, ban_until = ? WHERE id = ?`,
    [reason, duration === -1 ? null : addDays(new Date(), duration), id]);
});

// 解封用户
router.post('/:id/unban', authMiddleware, (req, res) => {
  run(`UPDATE users SET status = 'active', ban_reason = NULL, ban_until = NULL WHERE id = ?`, [id]);
});
```

### 3.2 🟡 缺少用户登录日志

**现状**: 没有记录用户登录历史。

**建议添加**:
```sql
CREATE TABLE user_login_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  device_info TEXT,
  platform TEXT,  -- ios/android/devtools
  login_method TEXT  -- wx_login/token_refresh
);
```

### 3.3 🟡 缺少用户行为分析数据

**现状**: 只有基础的统计数据。

**建议添加**:
- 用户活跃度分析（DAU/MAU）
- 用户留存率
- 用户生命周期价值（LTV）
- 用户分群标签

### 3.4 🟢 缺少批量用户操作

**现状**: 只能单个操作用户。

**建议添加**:
```javascript
// 批量调整醒币
router.post('/batch/adjust-points', authMiddleware, (req, res) => {
  const { userIds, amount, reason } = req.body;
  // ...
});

// 批量发送通知
router.post('/batch/notify', authMiddleware, (req, res) => {
  const { userIds, message } = req.body;
  // ...
});
```

---

## 四、性能优化

### 4.1 🟡 用户列表查询性能问题

**位置**: [`admin-server/server/routes/users.js:381-406`](admin-server/server/routes/users.js:381)

```javascript
// 使用子查询获取累计充值和照片数量
listSql = `
  SELECT u.*,
    COALESCE((SELECT SUM(amount) FROM orders WHERE user_id = u.id AND status = 'paid'), 0) as total_recharge,
    COALESCE((SELECT COUNT(*) FROM photo_history WHERE user_id = u.id), 0) as photo_count
  FROM users u
  ...
`;
```

**问题**: 
- 每行用户都执行两个子查询，N+1 问题
- 大数据量时性能差

**建议**:
1. 添加索引：
```sql
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
CREATE INDEX idx_photo_history_user ON photo_history(user_id);
```

2. 使用 JOIN 或预计算：
```javascript
// 方案1: 使用 LEFT JOIN
listSql = `
  SELECT u.*, 
    COALESCE(o.total_recharge, 0) as total_recharge,
    COALESCE(p.photo_count, 0) as photo_count
  FROM users u
  LEFT JOIN (SELECT user_id, SUM(amount) as total_recharge FROM orders WHERE status = 'paid' GROUP BY user_id) o ON u.id = o.user_id
  LEFT JOIN (SELECT user_id, COUNT(*) as photo_count FROM photo_history GROUP BY user_id) p ON u.id = p.user_id
  ...
`;

// 方案2: 在 users 表添加冗余字段，定期更新
ALTER TABLE users ADD COLUMN total_recharge INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN photo_count INTEGER DEFAULT 0;
```

### 4.2 🟡 缺少用户数据缓存

**现状**: 每次请求都查询数据库。

**建议**: 
- 使用 Redis 缓存热点用户数据
- 缓存用户基本信息、积分余额等

```javascript
// 获取用户信息（带缓存）
async function getUserWithCache(userId) {
  const cacheKey = `user:${userId}`;
  let user = await redis.get(cacheKey);
  
  if (!user) {
    user = getOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (user) {
      await redis.setex(cacheKey, 300, JSON.stringify(user)); // 5分钟缓存
    }
  } else {
    user = JSON.parse(user);
  }
  
  return user;
}
```

---

## 五、用户体验优化

### 5.1 🟡 登录状态管理不完善

**位置**: [`miniprogram/app.js:133-165`](miniprogram/app.js:133)

```javascript
async silentLogin() {
  let userId = wx.getStorageSync('userId');
  // ...
  if (userId && (sessionKey || userInfo)) {
    // 已有登录态，恢复全局数据
    this.globalData.isLoggedIn = true;
    return true;
  }
  return false;
}
```

**问题**:
- 没有验证 token 是否过期
- 没有自动刷新 token 机制
- session_key 过期后没有自动重新获取

**建议**:
```javascript
async silentLogin() {
  const userId = wx.getStorageSync('userId');
  const token = wx.getStorageSync('token');
  const tokenExpiry = wx.getStorageSync('tokenExpiry');
  
  if (!userId || !token) return false;
  
  // 检查 token 是否即将过期（提前 1 小时刷新）
  if (tokenExpiry && Date.now() > tokenExpiry - 3600000) {
    try {
      await this.refreshToken();
    } catch (e) {
      return false;
    }
  }
  
  // 验证 token 有效性
  try {
    const res = await api.validateToken(token);
    if (res.code !== 200) return false;
  } catch (e) {
    return false;
  }
  
  this.globalData.isLoggedIn = true;
  return true;
}
```

### 5.2 🟡 用户信息同步不及时

**现状**: 用户信息更新后，其他页面可能显示旧数据。

**建议**: 使用事件机制通知所有页面刷新用户数据。

```javascript
// app.js 中
updateUserInfo(newInfo) {
  this.globalData.userInfo = { ...this.globalData.userInfo, ...newInfo };
  wx.setStorageSync('userInfo', this.globalData.userInfo);
  this.emit('userInfoUpdated', this.globalData.userInfo);
}

// 页面中
onLoad() {
  getApp().on('userInfoUpdated', this.onUserInfoUpdated.bindthis));
}
```

### 5.3 🟢 缺少用户反馈入口

**现状**: 有 feedbacks 表，但小程序端可能缺少便捷的反馈入口。

**建议**: 在"我的"页面添加反馈入口，支持图片上传。

---

## 六、合规性问题

### 6.1 🟡 用户数据导出功能缺失

**GDPR/个人信息保护法要求**: 用户有权导出自己的数据。

**建议添加**:
```javascript
// 导出用户数据
router.get('/:id/export', userAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  
  // 验证是本人请求
  if (req.user.userId !== id) {
    return res.status(403).json({ code: 403, message: '无权导出他人数据' });
  }
  
  const userData = {
    profile: getOne('SELECT * FROM users WHERE id = ?', [id]),
    orders: getAll('SELECT * FROM orders WHERE user_id = ?', [id]),
    photos: getAll('SELECT * FROM photo_history WHERE user_id = ?', [id]),
    points: getAll('SELECT * FROM points_records WHERE user_id = ?', [id]),
    // ...
  };
  
  res.json({ code: 200, data: userData });
});
```

### 6.2 🟡 敏感数据日志脱敏

**现状**: 日志中可能包含敏感信息。

```javascript
console.log('[微信登录] 获取到 unionid:', unionid, ', openid:', openid);
```

**建议**: 对敏感数据进行脱敏处理。

```javascript
function maskId(id) {
  if (!id) return 'null';
  return id.substring(0, 4) + '****' + id.substring(id.length - 4);
}

console.log('[微信登录] 获取到 unionid:', maskId(unionid), ', openid:', maskId(openid));
```

---

## 七、优化优先级总结

| 优先级 | 问题 | 影响 | 预计工时 |
|--------|------|------|----------|
| P0 | 用户信息更新接口身份验证 | 安全漏洞 | 2h |
| P0 | 用户统计接口无验证 | 数据泄露 | 1h |
| P1 | 用户创建缺少事务保护 | 数据不一致 | 2h |
| P1 | 用户注销数据清理不完整 | 数据残留 | 2h |
| P1 | 添加用户封禁功能 | 运营需求 | 4h |
| P2 | 用户列表查询性能优化 | 性能问题 | 4h |
| P2 | 添加用户登录日志 | 安全审计 | 3h |
| P2 | 登录状态管理优化 | 用户体验 | 4h |
| P3 | 用户数据导出功能 | 合规要求 | 4h |
| P3 | 日志脱敏 | 安全合规 | 2h |
| P3 | 用户数据缓存 | 性能优化 | 4h |

---

## 八、与 USER_ID_ANALYSIS_REPORT.md 的关系

本报告与 `USER_ID_ANALYSIS_REPORT.md` 互为补充：

| 报告 | 关注点 |
|------|--------|
| USER_ID_ANALYSIS_REPORT.md | ID体系设计、跨服务一致性、支付场景 |
| 本报告 | 安全性、数据一致性、功能完整性、性能、合规 |

**建议实施顺序**:
1. 先修复 USER_ID_ANALYSIS_REPORT.md 中的 P0 问题（ID体系基础）
2. 再修复本报告中的 P0 问题（安全漏洞）
3. 按优先级逐步完成其他优化

---

*报告生成时间: 2026-01-21*
*分析范围: admin-server, server, core-api, miniprogram*
