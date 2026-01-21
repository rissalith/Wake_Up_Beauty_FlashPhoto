# 邀请系统分析与优化报告

## 一、当前邀请系统架构

### 1.1 涉及的文件

| 文件 | 功能 |
|------|------|
| [`admin-server/server/routes/users.js:223-235`](admin-server/server/routes/users.js:223) | 用户登录时处理邀请关系 |
| [`admin-server/server/routes/invite.js`](admin-server/server/routes/invite.js) | admin-server邀请统计和记录接口 |
| [`server/routes/user.js:127-142`](server/routes/user.js:127) | server服务处理邀请奖励 |
| [`server/routes/invite.js`](server/routes/invite.js) | server邀请统计接口 |
| [`core-api/routes/miniprogram/user.js:129-143`](core-api/routes/miniprogram/user.js:129) | core-api处理邀请奖励 |
| [`core-api/routes/miniprogram/invite.js`](core-api/routes/miniprogram/invite.js) | core-api邀请统计接口 |
| [`miniprogram/app.js:37-39`](miniprogram/app.js:37) | 小程序端接收邀请参数 |
| [`miniprogram/pages/invite/invite.js`](miniprogram/pages/invite/invite.js) | 邀请页面 |

### 1.2 数据库表结构

```sql
-- invites 表（server/core-api使用）
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, completed
  reward_points INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- users 表中的 inviter_id 字段（admin-server使用）
ALTER TABLE users ADD COLUMN inviter_id TEXT;
```

### 1.3 邀请流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        邀请流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 邀请者分享小程序                                             │
│     ├─ 分享链接: /pages/index/index?inviter={userId}            │
│     └─ 小程序码: 携带 inviter 参数                               │
│                                                                 │
│  2. 被邀请者点击链接                                             │
│     ├─ miniprogram/app.js 接收 inviter 参数                     │
│     └─ 保存到 globalData.inviterId                              │
│                                                                 │
│  3. 被邀请者注册/登录                                            │
│     ├─ 调用 /user/login 接口                                    │
│     ├─ 传递 inviterId 参数                                      │
│     └─ 后端处理邀请关系                                          │
│                                                                 │
│  4. 发放奖励                                                     │
│     ├─ 邀请者获得醒币奖励                                        │
│     └─ 记录邀请关系                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、发现的问题

### 2.1 🔴 问题1: 邀请记录创建逻辑不一致

**admin-server** 仅在 `isSharedDb=true` 时创建邀请记录：

```javascript
// admin-server/server/routes/users.js:231-240
if (inviterId && inviterId !== userId) {
  if (isSharedDb) {  // ⚠️ 仅在共享数据库时创建
    run(`INSERT INTO invite_records (id, inviter_id, invitee_id, status, created_at)
         VALUES (?, ?, ?, 'registered', datetime('now'))`, [...]);
  }
  // isSharedDb=false 时不创建记录！
}
```

**server/core-api** 总是创建记录：

```javascript
// server/routes/user.js:139-141
dbRun(db, 'INSERT INTO invites (id, inviter_id, invitee_id, status, reward_points) VALUES ...', [...]);
```

**问题**:
- 表名不一致：`invite_records` vs `invites`
- admin-server在非共享数据库模式下不创建邀请记录
- 导致邀请数据不完整

---

### 2.2 🔴 问题2: 邀请统计查询方式不一致

| 服务 | 查询方式 | 数据来源 |
|------|----------|----------|
| admin-server | `SELECT COUNT(*) FROM users WHERE inviter_id = ?` | users表的inviter_id字段 |
| server | `SELECT COUNT(*) FROM invites WHERE inviter_id = ?` | invites表 |
| core-api | `SELECT COUNT(*) FROM invites WHERE inviter_id = ?` | invites表 |

**代码对比**:

```javascript
// admin-server/server/routes/invite.js:15
const result = getOne('SELECT COUNT(*) as count FROM users WHERE inviter_id = ?', [userId]);

// server/routes/invite.js:14
const invitedCount = db.prepare("SELECT COUNT(*) as count FROM invites WHERE inviter_id = ? AND status = 'completed'").get(realUserId).count;
```

**问题**: 两种方式可能返回不同结果，造成数据不一致

---

### 2.3 🔴 问题3: 邀请奖励发放逻辑不一致

**server/core-api**: 新用户注册时立即发放奖励

```javascript
// server/routes/user.js:127-141
if (inviterId) {
  const inviter = db.prepare('SELECT points FROM users WHERE id = ?').get(inviterId);
  if (inviter) {
    const inviteReward = getRewardConfig(db, 'invite_friend');
    if (inviteReward.is_active && inviteReward.points > 0) {
      // 立即给邀请者发放奖励
      dbRun(db, 'UPDATE users SET points = points + ? WHERE id = ?', [rewardPoints, inviterId]);
      // 记录积分变动
      dbRun(db, 'INSERT INTO points_records ...', [...]);
      // 记录邀请关系
      dbRun(db, 'INSERT INTO invites ...', [...]);
    }
  }
}
```

**admin-server**: 仅记录邀请关系，不发放奖励

```javascript
// admin-server/server/routes/users.js:231-240
if (inviterId && inviterId !== userId) {
  if (isSharedDb) {
    run(`INSERT INTO invite_records ...`);
    // ⚠️ 没有发放奖励的逻辑！
  }
}
```

**问题**: 根据请求路由到不同服务，邀请者可能获得奖励也可能不获得

---

### 2.4 🟡 问题4: 缺少邀请链接有效期管理

**当前实现**:

```javascript
// miniprogram/app.js:37-39
if (options.query && options.query.inviter) {
  this.globalData.inviterId = options.query.inviter;
}
```

**问题**:
- 邀请链接永久有效
- 无法追踪邀请来源渠道
- 无法限制单个邀请码的使用次数
- 无法设置邀请活动的时间范围

---

### 2.5 🟡 问题5: 无防刷机制

**当前风险**:
- 同一设备可以多次注册获取邀请奖励
- 无IP限制
- 无设备指纹校验
- 可能被恶意刷奖励

---

### 2.6 🟡 问题6: 被邀请人无奖励

当前只有邀请者获得奖励，被邀请人没有额外奖励（除了新用户注册奖励）。

**当前奖励配置**:
```javascript
// point_rewards 表
{ type: 'invite_friend', name: '邀请好友', points: 10, description: '成功邀请好友注册' }
```

---

### 2.7 🟢 问题7: 邀请记录缺少详细信息

当前 `invites` 表结构简单，缺少：
- 邀请来源（分享、二维码、链接）
- 邀请时间和完成时间
- 被邀请人奖励记录
- 邀请活动ID（用于区分不同活动）

---

## 三、优化建议

### 3.1 统一邀请记录表结构

```sql
-- 统一使用 invites 表，删除 invite_records
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, completed, expired, cancelled
  inviter_reward INTEGER DEFAULT 0,  -- 邀请者获得的奖励
  invitee_reward INTEGER DEFAULT 0,  -- 被邀请者获得的奖励
  source TEXT,  -- 邀请来源：share, qrcode, link, campaign
  campaign_id TEXT,  -- 关联的活动ID
  invite_code TEXT,  -- 使用的邀请码
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (inviter_id) REFERENCES users(id),
  FOREIGN KEY (invitee_id) REFERENCES users(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites(inviter_id);
CREATE INDEX IF NOT EXISTS idx_invites_invitee ON invites(invitee_id);
CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(status);
CREATE INDEX IF NOT EXISTS idx_invites_campaign ON invites(campaign_id);
```

---

### 3.2 统一邀请处理逻辑

创建共享的邀请处理模块：

```javascript
// shared/services/inviteService.js

const { v4: uuidv4 } = require('uuid');

class InviteService {
  constructor(db, getRewardConfig) {
    this.db = db;
    this.getRewardConfig = getRewardConfig;
  }

  /**
   * 处理邀请关系
   * @param {string} inviterId - 邀请者ID
   * @param {string} inviteeId - 被邀请者ID
   * @param {object} options - 可选参数
   */
  async processInvite(inviterId, inviteeId, options = {}) {
    const { source = 'link', campaignId = null, inviteCode = null } = options;

    // 1. 验证邀请者存在
    const inviter = this.db.prepare('SELECT id, points FROM users WHERE id = ?').get(inviterId);
    if (!inviter) {
      console.log('[Invite] 邀请者不存在:', inviterId);
      return { success: false, reason: 'inviter_not_found' };
    }

    // 2. 检查是否已存在邀请关系
    const existingInvite = this.db.prepare(
      'SELECT id FROM invites WHERE inviter_id = ? AND invitee_id = ?'
    ).get(inviterId, inviteeId);
    if (existingInvite) {
      console.log('[Invite] 邀请关系已存在');
      return { success: false, reason: 'already_invited' };
    }

    // 3. 获取奖励配置
    const inviteReward = this.getRewardConfig('invite_friend');
    if (!inviteReward.is_active) {
      console.log('[Invite] 邀请奖励未启用');
      return { success: false, reason: 'reward_disabled' };
    }

    const inviterRewardPoints = inviteReward.points || 10;
    const inviteeRewardPoints = inviteReward.invitee_points || 0;

    // 4. 使用事务处理
    const result = this.db.transaction(() => {
      // 创建邀请记录
      const inviteId = uuidv4();
      this.db.prepare(`
        INSERT INTO invites (id, inviter_id, invitee_id, status, inviter_reward, invitee_reward, source, campaign_id, invite_code, completed_at)
        VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, datetime('now'))
      `).run(inviteId, inviterId, inviteeId, inviterRewardPoints, inviteeRewardPoints, source, campaignId, inviteCode);

      // 发放邀请者奖励
      const newInviterBalance = inviter.points + inviterRewardPoints;
      this.db.prepare('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newInviterBalance, inviterId);
      
      this.db.prepare(`
        INSERT INTO points_records (id, user_id, type, amount, balance_after, description)
        VALUES (?, ?, 'invite_friend', ?, ?, '邀请好友奖励')
      `).run(uuidv4(), inviterId, inviterRewardPoints, newInviterBalance);

      // 发放被邀请者奖励（如果有）
      if (inviteeRewardPoints > 0) {
        const invitee = this.db.prepare('SELECT points FROM users WHERE id = ?').get(inviteeId);
        const newInviteeBalance = (invitee?.points || 0) + inviteeRewardPoints;
        
        this.db.prepare('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(newInviteeBalance, inviteeId);
        
        this.db.prepare(`
          INSERT INTO points_records (id, user_id, type, amount, balance_after, description)
          VALUES (?, ?, 'invite_bonus', ?, ?, '被邀请奖励')
        `).run(uuidv4(), inviteeId, inviteeRewardPoints, newInviteeBalance);
      }

      return {
        success: true,
        inviteId,
        inviterReward: inviterRewardPoints,
        inviteeReward: inviteeRewardPoints
      };
    })();

    return result;
  }

  /**
   * 获取邀请统计
   */
  getInviteStats(userId) {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as invited_count,
        COALESCE(SUM(inviter_reward), 0) as earned_points,
        COUNT(CASE WHEN DATE(created_at) = DATE('now') THEN 1 END) as today_count
      FROM invites 
      WHERE inviter_id = ? AND status = 'completed'
    `).get(userId);

    return {
      invitedCount: stats?.invited_count || 0,
      earnedPoints: stats?.earned_points || 0,
      todayCount: stats?.today_count || 0
    };
  }

  /**
   * 获取邀请记录
   */
  getInviteRecords(userId, page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    
    const total = this.db.prepare(
      'SELECT COUNT(*) as count FROM invites WHERE inviter_id = ?'
    ).get(userId)?.count || 0;

    const records = this.db.prepare(`
      SELECT i.*, u.nickname, u.avatar_url
      FROM invites i
      LEFT JOIN users u ON i.invitee_id = u.id
      WHERE i.inviter_id = ?
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, pageSize, offset);

    return { list: records, total, page, pageSize };
  }
}

module.exports = InviteService;
```

---

### 3.3 添加邀请码管理

```sql
-- 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  expires_at DATETIME,
  max_uses INTEGER DEFAULT -1,  -- -1表示无限制
  used_count INTEGER DEFAULT 0,
  source TEXT,  -- 生成来源
  campaign_id TEXT,  -- 关联活动
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inviter_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_inviter ON invite_codes(inviter_id);
```

```javascript
// 生成邀请码接口
router.post('/generate-code', (req, res) => {
  const { userId, expiresIn = 7 * 24 * 3600, maxUses = -1 } = req.body;
  
  // 生成6位短码
  const code = generateShortCode();
  const expiresAt = expiresIn > 0 
    ? new Date(Date.now() + expiresIn * 1000).toISOString() 
    : null;
  
  run(`
    INSERT INTO invite_codes (id, inviter_id, code, expires_at, max_uses)
    VALUES (?, ?, ?, ?, ?)
  `, [uuidv4(), userId, code, expiresAt, maxUses]);
  
  res.json({
    code: 200,
    data: {
      inviteCode: code,
      expiresAt,
      maxUses,
      shareUrl: `https://xxx.com/invite?code=${code}`
    }
  });
});

// 验证邀请码
function validateInviteCode(code) {
  const invite = getOne(`
    SELECT * FROM invite_codes 
    WHERE code = ? 
      AND is_active = 1
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `, [code]);
  
  if (!invite) return null;
  if (invite.max_uses > 0 && invite.used_count >= invite.max_uses) return null;
  
  return invite;
}
```

---

### 3.4 添加防刷机制

```sql
-- 设备指纹表
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_info TEXT,  -- 设备详细信息JSON
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_fingerprints_device ON device_fingerprints(device_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_ip ON device_fingerprints(ip_address);
```

```javascript
// 注册时检查设备
router.post('/login', async (req, res) => {
  const { openid, inviterId, deviceId, deviceInfo } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'];
  
  let validInviterId = inviterId;
  
  // 防刷检查
  if (deviceId && inviterId) {
    // 检查设备是否已注册过
    const existingDevice = getOne(
      'SELECT * FROM device_fingerprints WHERE device_id = ?', 
      [deviceId]
    );
    
    if (existingDevice) {
      console.log('[防刷] 设备已注册，跳过邀请奖励');
      validInviterId = null;
    }
    
    // 检查同一IP短时间内注册次数
    const recentRegistrations = getOne(`
      SELECT COUNT(*) as count FROM device_fingerprints 
      WHERE ip_address = ? AND created_at > datetime('now', '-1 hour')
    `, [clientIp]);
    
    if (recentRegistrations?.count >= 5) {
      console.log('[防刷] 同一IP注册过于频繁');
      validInviterId = null;
    }
  }
  
  // ... 正常注册流程，使用 validInviterId
  
  // 记录设备指纹
  if (deviceId) {
    run(`
      INSERT OR IGNORE INTO device_fingerprints (user_id, device_id, device_info, ip_address)
      VALUES (?, ?, ?, ?)
    `, [userId, deviceId, JSON.stringify(deviceInfo), clientIp]);
  }
});
```

---

### 3.5 统一邀请统计接口

```javascript
// 统一的邀请统计接口
router.get('/stats/:userId', (req, res) => {
  const { userId } = req.params;
  
  // 从 invites 表统计（统一数据源）
  const stats = getOne(`
    SELECT 
      COUNT(*) as invited_count,
      COALESCE(SUM(inviter_reward), 0) as earned_points,
      COUNT(CASE WHEN DATE(created_at) = DATE('now') THEN 1 END) as today_count,
      COUNT(CASE WHEN DATE(created_at) >= DATE('now', '-7 days') THEN 1 END) as week_count
    FROM invites 
    WHERE inviter_id = ? AND status = 'completed'
  `, [userId]);
  
  const inviteReward = getRewardConfig('invite_friend');
  
  res.json({
    code: 200,
    data: {
      invitedCount: stats?.invited_count || 0,
      earnedPoints: stats?.earned_points || 0,
      todayCount: stats?.today_count || 0,
      weekCount: stats?.week_count || 0,
      pointsPerInvite: inviteReward.points,
      inviteeReward: inviteReward.invitee_points || 0
    }
  });
});
```

---

## 四、实施计划

### 阶段一：修复紧急问题（1天）

| 任务 | 优先级 | 工时 |
|------|--------|------|
| 统一邀请记录表名为 `invites` | P0 | 1h |
| 统一所有服务的邀请处理逻辑 | P0 | 2h |
| 统一邀请统计查询方式 | P0 | 1h |
| 修复admin-server不发放奖励的问题 | P0 | 1h |

### 阶段二：功能增强（2天）

| 任务 | 优先级 | 工时 |
|------|--------|------|
| 添加被邀请人奖励 | P1 | 2h |
| 实现邀请码管理 | P1 | 4h |
| 添加邀请来源追踪 | P2 | 2h |
| 完善邀请记录详情 | P2 | 2h |

### 阶段三：安全加固（1天）

| 任务 | 优先级 | 工时 |
|------|--------|------|
| 实现设备指纹防刷 | P1 | 3h |
| 添加IP频率限制 | P2 | 2h |
| 邀请码有效期管理 | P2 | 2h |

---

## 五、测试检查清单

### 5.1 基础功能测试
- [ ] 新用户通过邀请链接注册
- [ ] 邀请者获得正确的奖励
- [ ] 被邀请者获得正确的奖励（如果配置了）
- [ ] 邀请记录正确创建
- [ ] 邀请统计数据准确

### 5.2 边界情况测试
- [ ] 邀请者不存在时的处理
- [ ] 重复邀请同一用户
- [ ] 自己邀请自己
- [ ] 邀请奖励未启用时的处理

### 5.3 防刷测试
- [ ] 同一设备多次注册
- [ ] 同一IP频繁注册
- [ ] 过期邀请码使用
- [ ] 超过使用次数的邀请码

### 5.4 跨服务一致性测试
- [ ] 通过admin-server注册的邀请奖励
- [ ] 通过server注册的邀请奖励
- [ ] 通过core-api注册的邀请奖励
- [ ] 各服务邀请统计数据一致

---

## 六、相关文件清单

### 后端文件
- [`admin-server/server/routes/users.js`](admin-server/server/routes/users.js) - 用户登录处理
- [`admin-server/server/routes/invite.js`](admin-server/server/routes/invite.js) - 邀请接口
- [`server/routes/user.js`](server/routes/user.js) - 用户登录处理
- [`server/routes/invite.js`](server/routes/invite.js) - 邀请接口
- [`core-api/routes/miniprogram/user.js`](core-api/routes/miniprogram/user.js) - 用户登录处理
- [`core-api/routes/miniprogram/invite.js`](core-api/routes/miniprogram/invite.js) - 邀请接口

### 前端文件
- [`miniprogram/app.js`](miniprogram/app.js) - 接收邀请参数
- [`miniprogram/pages/invite/invite.js`](miniprogram/pages/invite/invite.js) - 邀请页面
- [`miniprogram/pages/index/index.js`](miniprogram/pages/index/index.js) - 首页处理邀请
- [`miniprogram/pages/mine/mine.js`](miniprogram/pages/mine/mine.js) - 个人中心邀请统计

### 数据库配置
- [`admin-server/server/config/database.js`](admin-server/server/config/database.js) - 表结构定义
- [`core-api/config/database.js`](core-api/config/database.js) - 表结构定义
- [`server/utils/database.js`](server/utils/database.js) - 表结构定义

---

## 七、已完成的修复（2026-01-21）

### ✅ 7.1 创建统一邀请服务模块

已创建 [`shared/services/inviteService.js`](shared/services/inviteService.js)，提供：
- `processInvite()` - 统一的邀请处理逻辑
- `getInviteStats()` - 统一的邀请统计查询
- `getInviteRecords()` - 统一的邀请记录查询
- `isAlreadyInvited()` - 检查是否已被邀请

### ✅ 7.2 修复 admin-server 邀请处理逻辑

[`admin-server/server/routes/users.js:231-291`](admin-server/server/routes/users.js:231) 已修复：
- 统一使用 `invites` 表（不再使用 `invite_records`）
- 新用户注册时正确发放邀请奖励
- 记录邀请者积分变动到 `points_records` 表

### ✅ 7.3 统一邀请统计查询方式

[`admin-server/server/routes/invite.js`](admin-server/server/routes/invite.js) 已修复：
- 统计接口改为从 `invites` 表查询
- 记录列表接口改为从 `invites` 表查询并关联用户信息
- 添加 `todayCount` 今日邀请统计

### ✅ 7.4 数据库迁移脚本

已创建 [`admin-server/server/database/migrate-invites-table.sql`](admin-server/server/database/migrate-invites-table.sql)：
- 确保 `invites` 表存在
- 创建必要的索引
- 提供从旧表迁移数据的SQL（注释状态，需手动执行）

### 📋 待完成任务

| 任务 | 优先级 | 状态 |
|------|--------|------|
| 添加被邀请人奖励配置 | P1 | 待开发 |
| 实现邀请码管理 | P1 | 待开发 |
| 添加设备指纹防刷 | P1 | 待开发 |
| 添加邀请来源追踪 | P2 | 待开发 |
| 邀请码有效期管理 | P2 | 待开发 |
