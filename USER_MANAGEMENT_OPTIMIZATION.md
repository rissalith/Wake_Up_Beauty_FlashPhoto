# 用户管理额外优化建议

> 本文档是对 [`USER_ID_ANALYSIS_REPORT.md`](USER_ID_ANALYSIS_REPORT.md) 的补充，列出了用户管理方面其他可优化的问题。

---

## 一、安全问题

### 1.1 🔴 Token生成过于简单

**位置**: [`admin-server/server/routes/users.js:138`](admin-server/server/routes/users.js:138)

```javascript
// 当前实现
token: 'wx_token_' + Date.now()
token: 'mock_token_' + Date.now()
```

**问题**:
- Token可预测，仅基于时间戳
- 无加密、无签名
- 无过期机制

**建议**:
```javascript
const jwt = require('jsonwebtoken');

function generateToken(userId) {
  return jwt.sign(
    { userId, iat: Date.now() },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}
```

---

### 1.2 🔴 用户更新接口无认证

**位置**: [`admin-server/server/routes/users.js:429`](admin-server/server/routes/users.js:429)

```javascript
// 当前实现 - 无认证中间件
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { nickname, avatarUrl } = req.body;
  // ...
});
```

**风险**: 任何人可以修改任意用户的信息

**建议**:
```javascript
// 方案1: 添加认证中间件
router.put('/:id', authMiddleware, (req, res) => { ... });

// 方案2: 验证请求者身份
router.put('/:id', (req, res) => {
  const requestUserId = req.headers['x-user-id'];
  if (requestUserId !== id) {
    return res.status(403).json({ code: 403, message: '无权修改他人信息' });
  }
  // ...
});
```

---

### 1.3 🔴 session_key返回给前端

**位置**: [`admin-server/server/routes/users.js:145-146`](admin-server/server/routes/users.js:145)

```javascript
res.json({
  code: 200,
  data: {
    // ...
    sessionKey: session_key,  // ⚠️ 敏感信息
    session_key: session_key, // ⚠️ 敏感信息
  }
});
```

**问题**:
- `session_key` 是微信用于加解密用户数据的密钥
- 泄露后可被用于伪造用户数据
- 违反微信安全规范

**建议**:
- 仅在服务端存储和使用 `session_key`
- 前端需要解密数据时，将加密数据发送到后端处理

---

## 二、数据一致性问题

### 2.1 🟡 用户注销数据清理不完整

**位置**: [`admin-server/server/routes/users.js:983-1007`](admin-server/server/routes/users.js:983)

```javascript
// 当前实现
run('DELETE FROM points_records WHERE user_id = ?', [id]);
run('DELETE FROM photo_history WHERE user_id = ?', [id]);
run('DELETE FROM orders WHERE user_id = ?', [id]);
run('DELETE FROM user_agreements WHERE user_id = ?', [id]);
run('DELETE FROM users WHERE id = ?', [id]);
```

**遗漏的关联数据**:
| 表名 | 说明 |
|------|------|
| `invites` | 邀请记录（作为邀请者或被邀请者） |
| `feedbacks` | 用户反馈 |
| `virtual_pay_orders` | 虚拟支付订单 |
| `operation_logs` | 操作日志（如需保留可匿名化） |

**建议**:
```javascript
// 完整的用户注销
router.delete('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  try {
    db.transaction(() => {
      // 删除积分记录
      run('DELETE FROM points_records WHERE user_id = ?', [id]);
      // 删除照片历史
      run('DELETE FROM photo_history WHERE user_id = ?', [id]);
      // 删除订单
      run('DELETE FROM orders WHERE user_id = ?', [id]);
      // 删除协议签署记录
      run('DELETE FROM user_agreements WHERE user_id = ?', [id]);
      // 删除邀请记录
      run('DELETE FROM invites WHERE inviter_id = ? OR invitee_id = ?', [id, id]);
      // 删除反馈
      run('DELETE FROM feedbacks WHERE user_id = ?', [id]);
      // 删除虚拟支付订单
      run('DELETE FROM virtual_pay_orders WHERE user_id = ?', [id]);
      // 最后删除用户
      run('DELETE FROM users WHERE id = ?', [id]);
    })();
    
    res.json({ code: 200, message: '用户注销成功' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '注销失败' });
  }
});
```

---

### 2.2 🟡 积分记录表名不一致

| 服务 | 表名 | 字段 |
|------|------|------|
| admin-server (isSharedDb=true) | `points_records` | `id, user_id, type, amount, balance_after` |
| admin-server (isSharedDb=false) | `point_records` | `record_id, user_id, type, amount, balance` |
| server | `points_records` | `id, user_id, type, amount, balance_after` |
| core-api | `points_records` | `id, user_id, type, amount, balance_after` |

**建议**: 统一使用 `points_records` 表名和字段结构

---

### 2.3 🟡 users表缺少session_key字段定义

**位置**: [`admin-server/server/config/database.js:53-66`](admin-server/server/config/database.js:53)

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id VARCHAR(50) UNIQUE NOT NULL,
  unionid VARCHAR(100) UNIQUE NOT NULL,
  openid VARCHAR(100) NOT NULL,
  nickname VARCHAR(100),
  avatar_url TEXT,
  bind_email VARCHAR(100),
  is_new_user BOOLEAN DEFAULT 1,
  points INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- ⚠️ 缺少 session_key 字段
)
```

**问题**: 代码中有对 `session_key` 的读写操作，但表定义中没有该字段

**建议**: 添加迁移脚本
```javascript
addColumnIfNotExists('users', 'session_key', 'TEXT');
```

---

## 三、功能缺失

### 3.1 🟢 缺少用户状态管理

**当前问题**:
- 无用户封禁/冻结功能
- 无异常登录检测
- 无登录日志记录

**建议方案**:

```sql
-- 1. 添加用户状态字段
ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';
-- status: active, banned, frozen, deleted

-- 2. 创建登录日志表
CREATE TABLE login_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  device_info TEXT,
  login_type TEXT,  -- wx_login, token_refresh
  success BOOLEAN DEFAULT 1,
  fail_reason TEXT
);
```

```javascript
// 登录时检查用户状态
if (user.status === 'banned') {
  return res.status(403).json({ code: 403, message: '账号已被封禁' });
}
if (user.status === 'frozen') {
  return res.status(403).json({ code: 403, message: '账号已被冻结，请联系客服' });
}
```

---

### 3.2 🟢 缺少用户数据导出功能

**GDPR合规要求**: 用户有权获取其个人数据的副本

**建议实现**:
```javascript
router.get('/:id/export', authMiddleware, async (req, res) => {
  const { id } = req.params;
  
  const userData = {
    profile: getOne('SELECT * FROM users WHERE id = ?', [id]),
    orders: getAll('SELECT * FROM orders WHERE user_id = ?', [id]),
    photos: getAll('SELECT * FROM photo_history WHERE user_id = ?', [id]),
    points: getAll('SELECT * FROM points_records WHERE user_id = ?', [id]),
    agreements: getAll('SELECT * FROM user_agreements WHERE user_id = ?', [id])
  };
  
  res.json({
    code: 200,
    data: userData,
    exportTime: new Date().toISOString()
  });
});
```

---

### 3.3 🟢 邀请系统不完善

**位置**: [`admin-server/server/routes/users.js:223-235`](admin-server/server/routes/users.js:223)

**当前问题**:
1. 邀请记录仅在 `isSharedDb` 时创建
2. 缺少邀请链接有效期管理
3. 无防刷机制（同一设备多次注册）

**建议**:
```javascript
// 1. 统一创建邀请记录
if (inviterId && inviterId !== userId) {
  const inviteId = 'INV' + Date.now().toString(36).toUpperCase();
  run(`
    INSERT INTO invites (id, inviter_id, invitee_id, status, created_at)
    VALUES (?, ?, ?, 'registered', datetime('now'))
  `, [inviteId, inviterId, userId]);
}

// 2. 添加邀请码有效期
CREATE TABLE invite_codes (
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  expires_at DATETIME,
  max_uses INTEGER DEFAULT 10,
  used_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

// 3. 防刷：记录设备指纹
CREATE TABLE device_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(device_id)
);
```

---

### 3.4 🟢 退出登录时隐私确认状态处理

**位置**: [`miniprogram/app.js:555-557`](miniprogram/app.js:555)

```javascript
logout() {
  // 保留隐私政策确认状态，不需要重新确认
  // wx.removeStorageSync('privacyPolicyConfirmed');
  // wx.removeStorageSync('privacyConfirmTime');
}
```

**问题**: 换账号登录时，新用户应该重新确认隐私协议

**建议**:
```javascript
logout() {
  // 清除用户相关数据
  wx.removeStorageSync('userId');
  wx.removeStorageSync('userInfo');
  // ...
  
  // 清除隐私确认状态（换账号需重新确认）
  wx.removeStorageSync('privacyPolicyConfirmed');
  wx.removeStorageSync('privacyConfirmTime');
  wx.removeStorageSync('agreementSynced');
}
```

---

### 3.5 🟢 缺少用户账号合并功能

**场景**: 同一用户可能通过不同方式产生多个账号
- 先用openid注册，后来小程序绑定开放平台获得unionid
- 在不同小程序分别注册

**建议**:
```javascript
// 账号合并接口
router.post('/merge', authMiddleware, async (req, res) => {
  const { primaryUserId, secondaryUserId } = req.body;
  
  db.transaction(() => {
    // 1. 合并积分
    const secondary = getOne('SELECT points FROM users WHERE id = ?', [secondaryUserId]);
    run('UPDATE users SET points = points + ? WHERE id = ?', [secondary.points, primaryUserId]);
    
    // 2. 迁移关联数据
    run('UPDATE orders SET user_id = ? WHERE user_id = ?', [primaryUserId, secondaryUserId]);
    run('UPDATE photo_history SET user_id = ? WHERE user_id = ?', [primaryUserId, secondaryUserId]);
    run('UPDATE points_records SET user_id = ? WHERE user_id = ?', [primaryUserId, secondaryUserId]);
    
    // 3. 删除次要账号
    run('DELETE FROM users WHERE id = ?', [secondaryUserId]);
  })();
  
  res.json({ code: 200, message: '账号合并成功' });
});
```

---

## 四、优化优先级汇总

| 优先级 | 问题 | 类型 | 预计工时 |
|--------|------|------|----------|
| **P0** | Token生成安全 | 安全 | 2h |
| **P0** | 用户更新接口认证 | 安全 | 1h |
| **P1** | session_key泄露 | 安全 | 1h |
| **P1** | 用户注销数据清理 | 数据一致性 | 2h |
| **P1** | users表添加session_key字段 | 数据一致性 | 0.5h |
| **P2** | 用户状态管理 | 功能 | 4h |
| **P2** | 登录日志记录 | 功能 | 2h |
| **P2** | 统一积分记录表名 | 数据一致性 | 2h |
| **P3** | 用户数据导出 | 功能 | 3h |
| **P3** | 邀请系统完善 | 功能 | 4h |
| **P3** | 账号合并功能 | 功能 | 4h |

---

## 五、实施建议

### 第一阶段：安全修复（1天）
1. 实现JWT token生成
2. 为用户更新接口添加认证
3. 移除session_key返回

### 第二阶段：数据一致性（1天）
1. 完善用户注销逻辑
2. 添加缺失的数据库字段
3. 统一表名和字段

### 第三阶段：功能增强（3-5天）
1. 用户状态管理
2. 登录日志
3. 数据导出
4. 邀请系统优化
5. 账号合并

---

## 六、相关文件

- [`admin-server/server/routes/users.js`](admin-server/server/routes/users.js) - 后台用户管理路由
- [`server/routes/user.js`](server/routes/user.js) - 主服务用户路由
- [`core-api/routes/miniprogram/user.js`](core-api/routes/miniprogram/user.js) - 核心API用户路由
- [`miniprogram/app.js`](miniprogram/app.js) - 小程序全局逻辑
- [`admin-server/server/config/database.js`](admin-server/server/config/database.js) - 数据库配置
