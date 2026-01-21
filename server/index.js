const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const https = require('https');

// 加载环境变量
require('dotenv').config();

// Redis 消息处理器
const { redisMessageHandler } = require('./lib/redis-message-handler');

// 微信小程序配置
const WX_CONFIG = {
  appId: process.env.WX_APPID || '',
  appSecret: process.env.WX_SECRET || ''
};

const app = express();
const PORT = process.env.PORT || 3000;

// 双环境配置
const ENV = process.env.NODE_ENV || 'test'; // 'test' 或 'production'
const DB_DIR = path.join(__dirname, 'data');
const TEST_DB_PATH = path.join(DB_DIR, 'flashphoto_test.db');
const PROD_DB_PATH = path.join(DB_DIR, 'flashphoto_prod.db');

// 环境配置
const CONFIG = {
  test: {
    dbPath: TEST_DB_PATH,
    newUserPoints: 500,      // 测试环境新用户赠送500
    inviteReward: 100,       // 邀请奖励100
    pointsPerPhoto: 30       // 每张照片30醒币
  },
  production: {
    dbPath: PROD_DB_PATH,
    newUserPoints: 100,      // 正式环境新用户赠送100
    inviteReward: 50,        // 邀请奖励50
    pointsPerPhoto: 500      // 每张照片500醒币
  }
};

// 当前环境配置
let currentEnv = ENV;
let currentConfig = CONFIG[currentEnv];

// 数据库实例（支持双环境）
let databases = {
  test: null,
  production: null
};

// 确保数据目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// 初始化单个数据库
function initSingleDatabase(dbPath) {
  // 使用 better-sqlite3 打开数据库（自动创建）
  const db = new Database(dbPath);

  // 启用 WAL 模式提升并发性能
  db.pragma('journal_mode = WAL');

  console.log(`[Database] 已加载数据库: ${dbPath} (better-sqlite3)`);

  // 创建表结构
  createTables(db);

  return db;
}

// 创建表结构
function createTables(db) {
  // 用户表 - unionid 为核心标识（支持矩阵产品互通）
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      unionid TEXT UNIQUE NOT NULL,
      openid TEXT NOT NULL,
      nickname TEXT,
      avatar_url TEXT,
      email TEXT,
      phone TEXT,
      points INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      session_key TEXT,
      privacy_agreed INTEGER DEFAULT 0,
      terms_agreed INTEGER DEFAULT 0,
      agreement_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 为已存在的用户表添加协议字段（如果不存在）
  try {
    db.exec('ALTER TABLE users ADD COLUMN privacy_agreed INTEGER DEFAULT 0');
  } catch (e) { /* 字段已存在 */ }
  try {
    db.exec('ALTER TABLE users ADD COLUMN terms_agreed INTEGER DEFAULT 0');
  } catch (e) { /* 字段已存在 */ }
  try {
    db.exec('ALTER TABLE users ADD COLUMN agreement_time DATETIME');
  } catch (e) { /* 字段已存在 */ }

  // 醒币记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS points_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      description TEXT,
      order_id TEXT,
      operator TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 照片历史表
  db.exec(`
    CREATE TABLE IF NOT EXISTS photo_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      task_id TEXT,
      status TEXT DEFAULT 'generating',
      scene TEXT,
      spec TEXT,
      beauty TEXT,
      clothing TEXT,
      bg_color TEXT,
      original_url TEXT,
      result_url TEXT,
      error_msg TEXT,
      retry_count INTEGER DEFAULT 0,
      points_cost INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 订单表
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      points_amount INTEGER NOT NULL,
      bonus_points INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      payment_id TEXT,
      payment_method TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 邀请表
  db.exec(`
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      inviter_id TEXT NOT NULL,
      invitee_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      reward_points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (inviter_id) REFERENCES users(id),
      FOREIGN KEY (invitee_id) REFERENCES users(id)
    )
  `);

  // 管理员表
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 操作日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建索引
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_points_records_user ON points_records(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_points_records_type ON points_records(type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_photo_history_user ON photo_history(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_photo_history_status ON photo_history(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites(inviter_id)');

  // 虚拟支付订单表
  db.exec(`
    CREATE TABLE IF NOT EXISTS virtual_pay_orders (
      id TEXT PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      openid TEXT NOT NULL,
      amount INTEGER NOT NULL,
      points INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      wx_transaction_id TEXT,
      attach TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivered_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_virtual_pay_orders_user ON virtual_pay_orders(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_virtual_pay_orders_status ON virtual_pay_orders(status)');

  // 奖励配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS point_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      max_times INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 初始化默认奖励配置
  const rewardCount = db.prepare("SELECT COUNT(*) as count FROM point_rewards").get().count;
  if (rewardCount === 0) {
    db.exec("INSERT INTO point_rewards (type, name, points, description, max_times, is_active) VALUES ('new_user', '新用户注册', 50, '新用户注册赠送', 1, 1)");
    db.exec("INSERT INTO point_rewards (type, name, points, description, max_times, is_active) VALUES ('daily_login', '每日登录', 2, '每日首次登录奖励', 1, 1)");
    db.exec("INSERT INTO point_rewards (type, name, points, description, max_times, is_active) VALUES ('invite_friend', '邀请好友', 10, '成功邀请好友注册', -1, 1)");
    db.exec("INSERT INTO point_rewards (type, name, points, description, max_times, is_active) VALUES ('share_photo', '分享照片', 10, '分享生成的照片', 3, 1)");
    console.log('已初始化默认奖励配置');
  }

  // 初始化默认管理员（如果不存在）
  const admin = db.prepare("SELECT * FROM admins WHERE username = 'admin'").get();
  if (!admin) {
    db.prepare('INSERT INTO admins (id, username, password, role) VALUES (?, ?, ?, ?)').run(uuidv4(), 'admin', 'admin123', 'superadmin');
    console.log('已创建默认管理员账号: admin/admin123');
  }
}

// 获取当前环境的数据库
function getDb(env = null) {
  const targetEnv = env || currentEnv;
  return databases[targetEnv];
}

// 保存当前环境的数据库（better-sqlite3 自动持久化，保留空函数兼容调用）
function saveDatabase(env = null) {
  // better-sqlite3 自动持久化，无需手动保存
}

// 从数据库获取奖励配置
function getRewardConfig(db, type) {
  try {
    const row = db.prepare('SELECT points, is_active, max_times FROM point_rewards WHERE type = ?').get(type);
    if (row) {
      return { points: row.points, is_active: row.is_active === 1, maxTimes: row.max_times };
    }
  } catch (e) {
    console.error('获取奖励配置失败:', e.message);
  }
  const defaults = {
    new_user: { points: 50, is_active: true, maxTimes: 1 },
    daily_login: { points: 2, is_active: true, maxTimes: 1 },
    invite_friend: { points: 10, is_active: true, maxTimes: -1 },
    share_photo: { points: 10, is_active: true, maxTimes: 3 }
  };
  return defaults[type] || { points: 0, is_active: false, maxTimes: 0 };
}

// 初始化所有数据库
function initDatabase() {
  // 初始化测试环境数据库
  databases.test = initSingleDatabase(TEST_DB_PATH);

  // 初始化正式环境数据库
  databases.production = initSingleDatabase(PROD_DB_PATH);

  console.log(`当前运行环境: ${currentEnv}`);
  console.log('数据库初始化完成');
}

// 辅助函数：通过 id 或 openid 查找用户
function findUserByIdOrOpenid(db, userId) {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE openid = ?').get(userId);
  }
  return user;
}

// 兼容层：模拟 sql.js 的 db.exec 返回格式
function dbExec(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (sql.trim().toUpperCase().startsWith('SELECT')) {
    const rows = params.length ? stmt.all(...params) : stmt.all();
    if (rows.length === 0) return [];
    const columns = Object.keys(rows[0]);
    const values = rows.map(row => columns.map(col => row[col]));
    return [{ columns, values }];
  }
  return params.length ? stmt.run(...params) : stmt.run();
}

// 兼容层：模拟 sql.js 的 db.run
function dbRun(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return params.length ? stmt.run(...params) : stmt.run();
}

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // 静态文件服务
app.use('/api/icons', express.static(path.join(__dirname, 'public/icons'))); // 图标静态文件

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] [${currentEnv}] ${req.method} ${req.path}`);
  next();
});

// ==================== 环境切换接口 ====================

// 获取当前环境信息
app.get('/api/admin/env', (req, res) => {
  res.json({
    code: 0,
    data: {
      currentEnv,
      config: currentConfig,
      availableEnvs: ['test', 'production']
    }
  });
});

// 切换环境（仅用于管理后台查看数据，不影响小程序）
app.post('/api/admin/env/switch', (req, res) => {
  const { env } = req.body;
  if (!['test', 'production'].includes(env)) {
    return res.status(400).json({ code: -1, msg: '无效的环境' });
  }

  currentEnv = env;
  currentConfig = CONFIG[env];

  res.json({
    code: 0,
    msg: `已切换到${env === 'test' ? '测试' : '正式'}环境`,
    data: { currentEnv, config: currentConfig }
  });
});

// ==================== 用户相关接口 ====================

// 微信登录（用code换取openid和session_key）
app.post('/api/user/wx-login', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ code: -1, msg: '缺少code参数' });
    }

    console.log('[wx-login] 收到登录请求，code:', code);

    // 调用微信 auth.code2Session 接口
    const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_CONFIG.appId}&secret=${WX_CONFIG.appSecret}&js_code=${code}&grant_type=authorization_code`;

    const wxData = await new Promise((resolve, reject) => {
      https.get(wxUrl, (wxRes) => {
        let data = '';
        wxRes.on('data', chunk => { data += chunk; });
        wxRes.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('解析微信响应失败'));
          }
        });
      }).on('error', reject);
    });

    console.log('[wx-login] 微信返回:', wxData);

    if (wxData.errcode) {
      console.error('[wx-login] 微信接口错误:', wxData);
      return res.status(400).json({
        code: -1,
        msg: `微信登录失败: ${wxData.errmsg}`,
        errcode: wxData.errcode
      });
    }

    // 返回openid和session_key
    res.json({
      code: 200,
      msg: 'success',
      data: {
        openid: wxData.openid,
        sessionKey: wxData.session_key,
        unionid: wxData.unionid || null
      }
    });

  } catch (error) {
    console.error('[wx-login] 错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误: ' + error.message });
  }
});

// 用户登录/注册 - 以 UnionID 为核心标识（支持矩阵产品互通）
app.post('/api/user/login', (req, res) => {
  try {
    const db = getDb();
    const { openid, unionid, nickname, avatarUrl, inviterId } = req.body;

    console.log('[登录] 收到登录请求:', { unionid, openid });

    // UnionID 是必须的（需要绑定微信开放平台）
    if (!unionid) {
      return res.status(400).json({ code: -1, msg: '缺少unionid，请确保小程序已绑定微信开放平台' });
    }

    if (!openid) {
      return res.status(400).json({ code: -1, msg: '缺少openid' });
    }

    // 优先通过 UnionID 查找用户（支持跨产品识别同一用户）
    let userObj = db.prepare('SELECT * FROM users WHERE unionid = ?').get(unionid);

    console.log('[登录] 查找用户结果:', userObj ? { 
      id: userObj.id, 
      privacy_agreed: userObj.privacy_agreed, 
      terms_agreed: userObj.terms_agreed 
    } : '新用户');

    if (!userObj) {
      // 新用户注册 - 从数据库获取奖励配置
      const userId = uuidv4();
      const newUserReward = getRewardConfig(db, 'new_user');
      const initialPoints = newUserReward.is_active ? newUserReward.points : 0;

      dbRun(db,
        'INSERT INTO users (id, openid, unionid, nickname, avatar_url, points) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, openid, unionid, nickname || null, avatarUrl || null, initialPoints]);

      // 记录新用户赠送积分
      if (initialPoints > 0) {
        dbRun(db,
          'INSERT INTO points_records (id, user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?, ?)',
          [uuidv4(), userId, 'new_user', initialPoints, initialPoints, '新用户注册赠送']);
      }

      // 处理邀请关系 - 从数据库获取邀请奖励配置
      if (inviterId) {
        const inviter = db.prepare('SELECT points FROM users WHERE id = ?').get(inviterId);
        if (inviter) {
          const inviterPoints = inviter.points;
          const inviteReward = getRewardConfig(db, 'invite_friend');

          if (inviteReward.is_active && inviteReward.points > 0) {
            const rewardPoints = inviteReward.points;
            const newInviterBalance = inviterPoints + rewardPoints;

            dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newInviterBalance, inviterId]);
            dbRun(db,
              'INSERT INTO points_records (id, user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?, ?)',
              [uuidv4(), inviterId, 'invite_friend', rewardPoints, newInviterBalance, '邀请好友奖励']);
            dbRun(db,
              'INSERT INTO invites (id, inviter_id, invitee_id, status, reward_points) VALUES (?, ?, ?, ?, ?)',
              [uuidv4(), inviterId, userId, 'completed', rewardPoints]);
          }
        }
      }

      saveDatabase();

      userObj = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    } else {
      // 老用户更新信息
      if (nickname || avatarUrl) {
        dbRun(db,
          'UPDATE users SET nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [nickname || null, avatarUrl || null, userObj.id]);
        saveDatabase();
        userObj = db.prepare('SELECT * FROM users WHERE id = ?').get(userObj.id);
      }
    }

    console.log('[登录] 返回用户数据:', {
      userId: userObj.id,
      privacy_agreed: userObj.privacy_agreed,
      terms_agreed: userObj.terms_agreed,
      privacyAgreed: userObj.privacy_agreed === 1,
      termsAgreed: userObj.terms_agreed === 1
    });

    res.json({
      code: 0,
      msg: 'success',
      data: {
        userId: userObj.id,
        unionid: userObj.unionid,
        openid: userObj.openid,
        nickname: userObj.nickname,
        avatarUrl: userObj.avatar_url,
        email: userObj.email,
        points: userObj.points,
        // 协议签署状态
        privacyAgreed: userObj.privacy_agreed === 1,
        termsAgreed: userObj.terms_agreed === 1,
        agreementTime: userObj.agreement_time
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误: ' + error.message });
  }
});

// 获取用户信息
app.get('/api/user/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const userObj = findUserByIdOrOpenid(db, userId);

    if (!userObj) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    res.json({
      code: 0,
      data: {
        userId: userObj.id,
        nickname: userObj.nickname,
        avatarUrl: userObj.avatar_url,
        email: userObj.email,
        points: userObj.points
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新用户信息
app.put('/api/user/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { nickname, avatarUrl, email } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    dbRun(db,
      'UPDATE users SET nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url), email = COALESCE(?, email), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nickname || null, avatarUrl || null, email || null, userId]);
    saveDatabase();

    const userObj = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    res.json({
      code: 0,
      msg: 'success',
      data: {
        userId: userObj.id,
        nickname: userObj.nickname,
        avatarUrl: userObj.avatar_url,
        email: userObj.email,
        points: userObj.points
      }
    });
  } catch (error) {
    console.error('更新用户信息错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 积分相关接口 ====================

// 获取积分余额
app.get('/api/points/balance/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const user = findUserByIdOrOpenid(db, userId);

    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    res.json({
      code: 0,
      data: {
        balance: user.points
      }
    });
  } catch (error) {
    console.error('获取积分余额错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 消费积分
app.post('/api/points/consume', (req, res) => {
  try {
    const db = getDb();
    const { userId, amount, description, orderId } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const user = findUserByIdOrOpenid(db, userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const currentPoints = user.points;
    if (currentPoints < amount) {
      return res.status(400).json({ code: -2, msg: '醒币不足', data: { balance: currentPoints } });
    }

    const newBalance = currentPoints - amount;
    const realUserId = user.id;
    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, realUserId]);
    dbRun(db,
      'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), realUserId, 'consume', -amount, newBalance, description || '消费', orderId || null]);

    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { balance: newBalance }
    });
  } catch (error) {
    console.error('消费积分错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 充值积分
app.post('/api/points/recharge', (req, res) => {
  try {
    const db = getDb();
    const { userId, amount, paymentId } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const user = findUserByIdOrOpenid(db, userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const currentPoints = user.points;
    const newBalance = currentPoints + amount;
    const realUserId = user.id;

    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, realUserId]);
    dbRun(db,
      'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), realUserId, 'recharge', amount, newBalance, '充值', paymentId || null]);

    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { balance: newBalance }
    });
  } catch (error) {
    console.error('充值积分错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 退还积分
app.post('/api/points/refund', (req, res) => {
  try {
    const db = getDb();
    const { userId, amount, description, orderId } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const user = findUserByIdOrOpenid(db, userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const currentPoints = user.points;
    const newBalance = currentPoints + amount;
    const realUserId = user.id;

    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, realUserId]);
    dbRun(db,
      'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), realUserId, 'refund', amount, newBalance, description || '退还', orderId || null]);

    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { balance: newBalance }
    });
  } catch (error) {
    console.error('退还积分错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取积分记录
app.get('/api/points/records/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    const user = findUserByIdOrOpenid(db, userId);
    const realUserId = user ? user.id : userId;

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const records = db.prepare(
      `SELECT * FROM points_records WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(realUserId, parseInt(pageSize), offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM points_records WHERE user_id = ?').get(realUserId).count;

    res.json({
      code: 0,
      data: {
        list: records,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取积分记录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 邀请相关接口 ====================

// 获取邀请统计
app.get('/api/invite/stats/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    const user = findUserByIdOrOpenid(db, userId);
    const realUserId = user ? user.id : userId;

    const invitedCount = db.prepare("SELECT COUNT(*) as count FROM invites WHERE inviter_id = ? AND status = 'completed'").get(realUserId).count;
    const earnedPoints = db.prepare("SELECT SUM(reward_points) as sum FROM invites WHERE inviter_id = ? AND status = 'completed'").get(realUserId).sum || 0;

    const inviteReward = getRewardConfig(db, 'invite_friend');

    res.json({
      code: 0,
      data: {
        invitedCount,
        earnedPoints,
        pointsPerInvite: inviteReward.points
      }
    });
  } catch (error) {
    console.error('获取邀请统计错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取邀请记录
app.get('/api/invite/records/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    const records = db.prepare(`
      SELECT i.*, u.nickname, u.avatar_url
      FROM invites i
      LEFT JOIN users u ON i.invitee_id = u.id
      WHERE i.inviter_id = ?
      ORDER BY i.created_at DESC
    `).all(userId);

    res.json({
      code: 0,
      data: records
    });
  } catch (error) {
    console.error('获取邀请记录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 照片历史相关接口 ====================

// 创建照片任务
app.post('/api/photo/create', (req, res) => {
  try {
    const db = getDb();
    const { userId, taskId, scene, spec, beauty, clothing, bgColor, originalUrl, pointsCost } = req.body;

    if (!userId) {
      return res.status(400).json({ code: -1, msg: '缺少用户ID' });
    }

    const photoId = uuidv4();

    dbRun(db, `
      INSERT INTO photo_history (id, user_id, task_id, scene, spec, beauty, clothing, bg_color, original_url, status, points_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating', ?)
    `, [photoId, userId, taskId || null, scene || null, spec || null, beauty || null, clothing || null, bgColor || null, originalUrl || null, pointsCost || currentConfig.pointsPerPhoto]);

    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { photoId }
    });
  } catch (error) {
    console.error('创建照片任务错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新照片状态
app.put('/api/photo/:photoId', (req, res) => {
  try {
    const db = getDb();
    const { photoId } = req.params;
    const { status, resultUrl, errorMsg } = req.body;

    dbRun(db, `
      UPDATE photo_history
      SET status = COALESCE(?, status),
          result_url = COALESCE(?, result_url),
          error_msg = COALESCE(?, error_msg),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status || null, resultUrl || null, errorMsg || null, photoId]);

    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新照片状态错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取照片历史
app.get('/api/photo/history/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { status, page = 1, pageSize = 20 } = req.query;

    let sql = 'SELECT * FROM photo_history WHERE user_id = ?';
    const params = [userId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const photos = db.prepare(sql + ` LIMIT ? OFFSET ?`).all(...params, parseInt(pageSize), offset);

    let countSql = 'SELECT COUNT(*) as count FROM photo_history WHERE user_id = ?';
    const countParams = [userId];
    if (status) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }
    const total = db.prepare(countSql).get(...countParams).count;

    res.json({
      code: 0,
      data: {
        list: photos,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取照片历史错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 删除照片
app.delete('/api/photo/:photoId', (req, res) => {
  try {
    const db = getDb();
    const { photoId } = req.params;

    dbRun(db, 'DELETE FROM photo_history WHERE id = ?', [photoId]);
    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('删除照片错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 批量删除照片
app.post('/api/photo/batch-delete', (req, res) => {
  try {
    const db = getDb();
    const { photoIds } = req.body;

    if (!photoIds || !photoIds.length) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const placeholders = photoIds.map(() => '?').join(',');
    dbRun(db, `DELETE FROM photo_history WHERE id IN (${placeholders})`, photoIds);
    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { deletedCount: photoIds.length }
    });
  } catch (error) {
    console.error('批量删除照片错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 管理后台接口 ====================

// 管理员登录
app.post('/api/admin/login', (req, res) => {
  try {
    const db = getDb();
    const { username, password } = req.body;

    const admin = db.prepare('SELECT * FROM admins WHERE username = ? AND password = ?').get(username, password);

    if (!admin) {
      return res.status(401).json({ code: -1, msg: '用户名或密码错误' });
    }

    dbRun(db, 'UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
    saveDatabase();

    res.json({
      code: 0,
      data: {
        adminId: admin.id,
        username: admin.username,
        role: admin.role,
        token: Buffer.from(`${admin.id}:${Date.now()}`).toString('base64')
      }
    });
  } catch (error) {
    console.error('管理员登录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取仪表盘统计
app.get('/api/admin/dashboard', (req, res) => {
  try {
    const { env } = req.query;
    const db = getDb(env);

    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const todayUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = DATE('now')").get().count;

    const totalPoints = db.prepare('SELECT SUM(points) as sum FROM users').get().sum || 0;
    const todayRecharge = db.prepare("SELECT SUM(amount) as sum FROM points_records WHERE type = 'recharge' AND DATE(created_at) = DATE('now')").get().sum || 0;
    const todayConsume = db.prepare("SELECT SUM(ABS(amount)) as sum FROM points_records WHERE type = 'consume' AND DATE(created_at) = DATE('now')").get().sum || 0;

    const totalPhotos = db.prepare('SELECT COUNT(*) as count FROM photo_history').get().count;
    const todayPhotos = db.prepare("SELECT COUNT(*) as count FROM photo_history WHERE DATE(created_at) = DATE('now')").get().count;
    const successPhotos = db.prepare("SELECT COUNT(*) as count FROM photo_history WHERE status = 'done'").get().count;
    const failedPhotos = db.prepare("SELECT COUNT(*) as count FROM photo_history WHERE status = 'failed'").get().count;

    const totalInvites = db.prepare("SELECT COUNT(*) as count FROM invites WHERE status = 'completed'").get().count;
    const todayInvites = db.prepare("SELECT COUNT(*) as count FROM invites WHERE status = 'completed' AND DATE(created_at) = DATE('now')").get().count;

    res.json({
      code: 0,
      data: {
        users: { total: totalUsers, today: todayUsers },
        points: { total: totalPoints, todayRecharge: todayRecharge || 0, todayConsume: todayConsume || 0 },
        photos: { total: totalPhotos, today: todayPhotos, success: successPhotos, failed: failedPhotos },
        invites: { total: totalInvites, today: todayInvites }
      }
    });
  } catch (error) {
    console.error('获取仪表盘统计错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取用户列表（管理后台）
app.get('/api/admin/users', (req, res) => {
  try {
    const { env, page = 1, pageSize = 20, keyword, status } = req.query;
    const db = getDb(env);

    let sql = 'SELECT * FROM users WHERE 1=1';
    const params = [];

    if (keyword) {
      sql += ' AND (nickname LIKE ? OR openid LIKE ? OR email LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const users = db.prepare(sql + ` LIMIT ? OFFSET ?`).all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as count')).get(...params).count;

    res.json({
      code: 0,
      data: {
        list: users,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 调整用户醒币（管理后台）
app.post('/api/admin/users/:userId/adjust-points', (req, res) => {
  try {
    const { env } = req.query;
    const db = getDb(env);
    const { userId } = req.params;
    const { amount, reason, operator } = req.body;

    if (!amount || amount === 0) {
      return res.status(400).json({ code: -1, msg: '调整数量不能为0' });
    }

    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const currentPoints = user.points;
    const newBalance = currentPoints + amount;

    if (newBalance < 0) {
      return res.status(400).json({ code: -1, msg: '调整后余额不能为负数' });
    }

    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, userId]);
    dbRun(db,
      'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, operator) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), userId, 'admin_adjust', amount, newBalance, reason || '管理员调整', operator || 'admin']);

    saveDatabase(env);

    res.json({
      code: 0,
      msg: 'success',
      data: { newBalance }
    });
  } catch (error) {
    console.error('调整用户醒币错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 禁用/启用用户
app.post('/api/admin/users/:userId/toggle-status', (req, res) => {
  try {
    const { env } = req.query;
    const db = getDb(env);
    const { userId } = req.params;

    const user = db.prepare('SELECT status FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const currentStatus = user.status;
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';

    dbRun(db, 'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, userId]);
    saveDatabase(env);

    res.json({
      code: 0,
      msg: 'success',
      data: { newStatus }
    });
  } catch (error) {
    console.error('切换用户状态错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取醒币流水记录（管理后台）
app.get('/api/admin/points-records', (req, res) => {
  try {
    const { env, page = 1, pageSize = 20, userId, type, startDate, endDate } = req.query;
    const db = getDb(env);

    let sql = `
      SELECT pr.*, u.nickname, u.openid
      FROM points_records pr
      LEFT JOIN users u ON pr.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      sql += ' AND pr.user_id = ?';
      params.push(userId);
    }

    if (type) {
      sql += ' AND pr.type = ?';
      params.push(type);
    }

    if (startDate) {
      sql += ' AND DATE(pr.created_at) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND DATE(pr.created_at) <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY pr.created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const records = db.prepare(sql + ` LIMIT ? OFFSET ?`).all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace(/SELECT pr\.\*, u\.nickname, u\.openid/i, 'SELECT COUNT(*) as count')).get(...params).count;

    res.json({
      code: 0,
      data: {
        list: records,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取醒币流水错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取照片生成记录（管理后台）
app.get('/api/admin/photos', (req, res) => {
  try {
    const { env, page = 1, pageSize = 20, userId, status, startDate, endDate } = req.query;
    const db = getDb(env);

    let sql = `
      SELECT ph.*, u.nickname, u.openid
      FROM photo_history ph
      LEFT JOIN users u ON ph.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      sql += ' AND ph.user_id = ?';
      params.push(userId);
    }

    if (status) {
      sql += ' AND ph.status = ?';
      params.push(status);
    }

    if (startDate) {
      sql += ' AND DATE(ph.created_at) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND DATE(ph.created_at) <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY ph.created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const photos = db.prepare(sql + ` LIMIT ? OFFSET ?`).all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace(/SELECT ph\.\*, u\.nickname, u\.openid/i, 'SELECT COUNT(*) as count')).get(...params).count;

    res.json({
      code: 0,
      data: {
        list: photos,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取照片记录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 虚拟支付相关 ====================
const virtualPayConfig = require('./config/virtualPay');
const signService = require('./services/signService');

// 创建虚拟支付订单
app.post('/api/virtual-pay/create-order', async (req, res) => {
  try {
    const { userId, openid, amount, points, platform = 'ios' } = req.body;
    const env = req.query.env || currentEnv;
    const db = getDb(env);

    if (!userId || !openid || !amount || !points) {
      return res.status(400).json({ code: 400, message: '参数不完整' });
    }

    const user = db.prepare('SELECT session_key FROM users WHERE id = ?').get(userId);

    if (!user || !user.session_key) {
      return res.status(400).json({ code: 400, message: '用户会话无效，请重新登录' });
    }

    const orderId = signService.generateOrderId();

    const paymentParams = signService.generatePaymentParams({
      orderId,
      amount,
      points,
      userId,
      sessionKey: user.session_key,
      platform
    });

    dbRun(db, `
      INSERT INTO virtual_pay_orders (id, order_id, user_id, openid, amount, points, status, attach)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [uuidv4(), orderId, userId, openid, amount * 100, points, JSON.stringify({ userId, points })]);
    saveDatabase(env);

    console.log('[虚拟支付] 创建订单:', orderId, '金额:', amount, '元, 醒币:', points);

    const signDataStr = JSON.stringify(paymentParams.signData);

    res.json({
      code: 200,
      data: {
        orderId,
        signData: signDataStr,
        paySig: paymentParams.paySig,
        signature: paymentParams.signature,
        sigMethod: paymentParams.sigMethod,
        mode: paymentParams.mode
      }
    });
  } catch (error) {
    console.error('[虚拟支付] 创建订单失败:', error);
    res.status(500).json({ code: 500, message: '创建订单失败', error: error.message });
  }
});

// 发货推送处理 (xpay_goods_deliver_notify / xpay_coin_pay_notify)
app.post('/api/virtual-pay/notify/deliver', async (req, res) => {
  console.log('[虚拟支付] 收到发货推送:', JSON.stringify(req.body));

  try {
    const env = req.query.env || currentEnv;
    const db = getDb(env);

    let notifyData = req.body;
    if (typeof notifyData === 'string') {
      notifyData = JSON.parse(notifyData);
    }

    const outTradeNo = notifyData.OutTradeNo || notifyData.out_trade_no;
    const transactionId = notifyData.WeChatPayInfo?.TransactionId || notifyData.transaction_id || '';
    const attachStr = notifyData.GoodsInfo?.Attach || notifyData.attach || '{}';

    if (!outTradeNo) {
      console.error('[虚拟支付] 订单号为空');
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    const order = db.prepare('SELECT * FROM virtual_pay_orders WHERE order_id = ?').get(outTradeNo);

    if (!order) {
      console.error('[虚拟支付] 订单不存在:', outTradeNo);
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    if (order.status === 'delivered') {
      console.log('[虚拟支付] 订单已发货，跳过:', outTradeNo);
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    let attach = {};
    try {
      attach = JSON.parse(attachStr);
    } catch (e) {
      attach = { userId: order.user_id, points: order.points };
    }

    const userId = attach.userId || order.user_id;
    const points = attach.points || order.points;

    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);

    if (!user) {
      console.error('[虚拟支付] 用户不存在:', userId);
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    const currentPoints = user.points || 0;
    const newBalance = currentPoints + points;

    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, userId]);

    dbRun(db, `
      INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id)
      VALUES (?, ?, 'virtual_recharge', ?, ?, '虚拟支付充值', ?)
    `, [uuidv4(), userId, points, newBalance, outTradeNo]);

    dbRun(db, `
      UPDATE virtual_pay_orders
      SET status = 'delivered', wx_transaction_id = ?, delivered_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `, [transactionId, outTradeNo]);

    saveDatabase(env);

    console.log('[虚拟支付] 发货成功:', { orderId: outTradeNo, points, newBalance });

    res.json({ ErrCode: 0, ErrMsg: 'success' });
  } catch (error) {
    console.error('[虚拟支付] 发货处理失败:', error);
    res.json({ ErrCode: -1, ErrMsg: error.message });
  }
});

// 代币支付推送
app.post('/api/virtual-pay/notify/coin-pay', async (req, res) => {
  console.log('[虚拟支付] 收到代币支付推送:', JSON.stringify(req.body));
  // 代币充值模式下，此推送用于记录代币充值成功
  // 逻辑与 deliver 类似
  res.json({ ErrCode: 0, ErrMsg: 'success' });
});

// 查询虚拟支付订单状态
app.get('/api/virtual-pay/order/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const env = req.query.env || currentEnv;
    const db = getDb(env);

    const order = db.prepare(`
      SELECT order_id, user_id, amount, points, status, wx_transaction_id, created_at, delivered_at
      FROM virtual_pay_orders WHERE order_id = ?
    `).get(orderId);

    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }

    res.json({ code: 200, data: order });
  } catch (error) {
    console.error('[虚拟支付] 查询订单失败:', error);
    res.status(500).json({ code: 500, message: '查询订单失败' });
  }
});

// 取消虚拟支付订单
app.post('/api/virtual-pay/cancel/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const env = req.query.env || currentEnv;
    const db = getDb(env);

    if (!orderId) {
      return res.status(400).json({ code: 400, message: '缺少订单号' });
    }

    const order = db.prepare('SELECT * FROM virtual_pay_orders WHERE order_id = ?').get(orderId);

    if (!order) {
      return res.json({ code: 200, message: '订单不存在或已处理' });
    }

    if (order.status !== 'pending') {
      return res.json({ code: 200, message: '订单状态不允许取消' });
    }

    dbRun(db, 'UPDATE virtual_pay_orders SET status = ? WHERE order_id = ?', ['cancelled', orderId]);
    saveDatabase(env);

    console.log('[虚拟支付] 订单已取消:', orderId, '原因:', reason || '未知');

    res.json({ code: 200, message: '订单已取消' });
  } catch (error) {
    console.error('[虚拟支付] 取消订单失败:', error);
    res.status(500).json({ code: 500, message: '取消订单失败' });
  }
});

// 查询用户代币余额 (调用微信API)
app.get('/api/virtual-pay/coin-balance', async (req, res) => {
  try {
    const { openid, env: envParam } = req.query;
    const env = envParam || currentEnv;

    if (!openid) {
      return res.status(400).json({ code: 400, message: '缺少openid' });
    }

    // 构建请求参数
    const postBody = JSON.stringify({
      openid,
      env: virtualPayConfig.env,
      user_ip: req.ip || '127.0.0.1'
    });

    // 计算签名
    const paySig = signService.calculatePaySig('/xpay/query_user_balance', postBody);

    // 获取 access_token (简化版，实际需要缓存)
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_CONFIG.appId}&secret=${WX_CONFIG.appSecret}`;

    // TODO: 实现完整的微信API调用
    // 这里返回模拟数据，实际需要调用微信接口
    res.json({
      code: 200,
      data: {
        balance: 0,
        present_balance: 0,
        message: '请在真机测试时调用微信API'
      }
    });
  } catch (error) {
    console.error('[虚拟支付] 查询余额失败:', error);
    res.status(500).json({ code: 500, message: error.message });
  }
});

// ==================== 用户协议同步接口 ====================
// 同步用户协议签署状态
// 支持两种路径：/api/users/sign-agreement 和 /api/user/sign-agreement
const signAgreementHandler = (req, res) => {
  try {
    const db = getDb();
    const { userId, agreementType } = req.body;

    console.log('[协议签署] 收到请求:', { userId, agreementType });

    if (!userId || !agreementType) {
      console.log('[协议签署] 参数缺失');
      return res.status(400).json({ code: -1, msg: '缺少参数' });
    }

    const user = findUserByIdOrOpenid(db, userId);
    if (!user) {
      console.log('[协议签署] 用户不存在:', userId);
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const realUserId = user.id;
    const now = new Date().toISOString();

    console.log('[协议签署] 找到用户:', realUserId, '当前协议状态:', {
      privacy_agreed: user.privacy_agreed,
      terms_agreed: user.terms_agreed
    });

    if (agreementType === 'privacy') {
      dbRun(db, `UPDATE users SET privacy_agreed = 1, agreement_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [now, realUserId]);
    } else if (agreementType === 'terms') {
      dbRun(db, `UPDATE users SET terms_agreed = 1, agreement_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [now, realUserId]);
    } else if (agreementType === 'all') {
      dbRun(db, `UPDATE users SET privacy_agreed = 1, terms_agreed = 1, agreement_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [now, realUserId]);
    }

    const verifyUser = db.prepare(`SELECT privacy_agreed, terms_agreed, agreement_time FROM users WHERE id = ?`).get(realUserId);
    console.log('[协议签署] 内存验证:', verifyUser);

    saveDatabase();
    console.log('[协议签署] 数据库已保存到文件');

    const updatedUser = findUserByIdOrOpenid(db, realUserId);
    console.log('[协议签署] 最终状态:', {
      userId: realUserId,
      privacy_agreed: updatedUser?.privacy_agreed,
      terms_agreed: updatedUser?.terms_agreed,
      agreement_time: updatedUser?.agreement_time
    });

    res.json({
      code: 0,
      msg: 'success',
      data: {
        privacyAgreed: updatedUser?.privacy_agreed === 1,
        termsAgreed: updatedUser?.terms_agreed === 1,
        agreementTime: updatedUser?.agreement_time || now
      }
    });
  } catch (error) {
    console.error('[协议签署] 错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误: ' + error.message });
  }
};

app.post('/api/users/sign-agreement', signAgreementHandler);
app.post('/api/user/sign-agreement', signAgreementHandler);

// 获取用户统计数据
app.get('/api/user/stats/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    const user = findUserByIdOrOpenid(db, userId);
    const realUserId = user ? user.id : userId;

    const photoCount = db.prepare("SELECT COUNT(*) as count FROM photo_history WHERE user_id = ? OR user_id = ?").get(realUserId, userId).count;
    const successCount = db.prepare("SELECT COUNT(*) as count FROM photo_history WHERE (user_id = ? OR user_id = ?) AND status = 'done'").get(realUserId, userId).count;

    res.json({
      code: 0,
      data: {
        photoCount,
        successCount
      }
    });
  } catch (error) {
    console.error('获取用户统计错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 配置路由 ====================
const configRoutes = require('./routes/config');
app.use('/api/config', configRoutes);

// ==================== 获取奖励配置 ====================
app.get('/api/rewards/config', (req, res) => {
  try {
    const db = getDb();
    const rewards = db.prepare('SELECT type, name, points, description, max_times, is_active FROM point_rewards ORDER BY id').all();

    res.json({
      code: 0,
      data: rewards.map(r => ({
        type: r.type,
        name: r.name,
        points: r.points,
        description: r.description,
        maxTimes: r.max_times,
        isActive: r.is_active === 1
      }))
    });
  } catch (error) {
    console.error('获取奖励配置错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 健康检查 ====================
const startTime = Date.now();

app.get('/api/health', async (req, res) => {
  const memUsage = process.memoryUsage();
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  let dbStatus = 'unknown';
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'error';
  }

  // 检查 Redis 状态
  const redisHealth = await redisMessageHandler.healthCheck();

  res.json({
    code: 0,
    status: 'online',
    service: 'miniprogram-api',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: uptime,
    uptimeFormatted: formatUptime(uptime),
    env: currentEnv,
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    },
    database: {
      status: dbStatus,
      env: currentEnv
    },
    redis: redisHealth,
    config: {
      newUserPoints: currentConfig.newUserPoints,
      inviteReward: currentConfig.inviteReward,
      pointsPerPhoto: currentConfig.pointsPerPhoto
    }
  });
});

// ==================== 内部 HTTP 接口已移除 ====================
// 服务间通信现在通过 Redis 消息队列实现
// 参见: ./lib/redis-message-handler.js

// 格式化运行时间
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

// 启动服务器
async function startServer() {
  try {
    initDatabase();

    // 初始化 COS
    try {
      const { initCOS } = require('./config/cos');
      initCOS();
    } catch (cosError) {
      console.warn('[COS] 初始化失败:', cosError.message);
    }

    // 初始化 Redis 消息处理器
    try {
      await redisMessageHandler.connect(getDb, dbRun, saveDatabase);
      console.log('[Redis] 消息处理器已连接');
    } catch (redisError) {
      console.warn('[Redis] 消息处理器连接失败，服务将在无 Redis 模式下运行:', redisError.message);
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log('==========================================');
      console.log('  FlashPhoto API 服务已启动 (v2 - Redis)');
      console.log(`  端口: ${PORT}`);
      console.log(`  环境: ${currentEnv}`);
      console.log(`  Redis: ${process.env.REDIS_URL || 'redis://127.0.0.1:6379'}`);
      console.log(`  测试数据库: ${TEST_DB_PATH}`);
      console.log(`  正式数据库: ${PROD_DB_PATH}`);
      console.log('==========================================');
    });
  } catch (error) {
    console.error('服务启动失败:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('[服务] 收到 SIGTERM 信号，正在关闭...');
  await redisMessageHandler.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[服务] 收到 SIGINT 信号，正在关闭...');
  await redisMessageHandler.disconnect();
  process.exit(0);
});

startServer();