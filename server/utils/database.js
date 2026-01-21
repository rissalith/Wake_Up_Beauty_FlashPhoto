const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 数据库配置
const DB_DIR = path.join(__dirname, '../data');
const TEST_DB_PATH = path.join(DB_DIR, 'flashphoto_test.db');
const PROD_DB_PATH = path.join(DB_DIR, 'flashphoto_prod.db');

const CONFIG = {
  test: {
    dbPath: TEST_DB_PATH,
    newUserPoints: 500,
    inviteReward: 100,
    pointsPerPhoto: 30
  },
  production: {
    dbPath: PROD_DB_PATH,
    newUserPoints: 100,
    inviteReward: 50,
    pointsPerPhoto: 500
  }
};

let currentEnv = process.env.NODE_ENV || 'test';
let databases = { test: null, production: null };

// 确保数据目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// 创建表结构
function createTables(db) {
  // 用户表
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

  // 积分记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS points_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      description TEXT,
      order_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 照片历史表
  db.exec(`
    CREATE TABLE IF NOT EXISTS photo_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      photo_url TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 订单表
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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

  // 创建索引
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_points_records_user ON points_records(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_photo_history_user ON photo_history(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites(inviter_id)');

  // 初始化默认数据
  const rewardCount = db.prepare("SELECT COUNT(*) as count FROM point_rewards").get().count;
  if (rewardCount === 0) {
    db.exec("INSERT INTO point_rewards (type, name, points, description, max_times, is_active) VALUES ('new_user', '新用户注册', 50, '新用户注册赠送', 1, 1)");
    db.exec("INSERT INTO point_rewards (type, name, points, description, max_times, is_active) VALUES ('invite_friend', '邀请好友', 10, '成功邀请好友注册', -1, 1)");
  }

  const admin = db.prepare("SELECT * FROM admins WHERE username = 'admin'").get();
  if (!admin) {
    db.prepare('INSERT INTO admins (id, username, password, role) VALUES (?, ?, ?, ?)').run(uuidv4(), 'admin', 'admin123', 'superadmin');
  }
}

// 初始化单个数据库
function initSingleDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  createTables(db);
  return db;
}

// 初始化所有数据库
function initDatabase() {
  databases.test = initSingleDatabase(TEST_DB_PATH);
  databases.production = initSingleDatabase(PROD_DB_PATH);
  console.log(`当前运行环境: ${currentEnv}`);
}

// 获取当前数据库
function getDb(env = null) {
  return databases[env || currentEnv];
}

// 保存数据库（better-sqlite3 自动持久化）
function saveDatabase() {
  // better-sqlite3 自动持久化
}

// 获取奖励配置
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
    invite_friend: { points: 10, is_active: true, maxTimes: -1 }
  };
  return defaults[type] || { points: 0, is_active: false, maxTimes: 0 };
}

// 通过 id 或 openid 查找用户
function findUserByIdOrOpenid(db, userId) {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE openid = ?').get(userId);
  }
  return user;
}

// 执行 SQL
function dbRun(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return params.length ? stmt.run(...params) : stmt.run();
}

module.exports = {
  initDatabase,
  getDb,
  saveDatabase,
  getRewardConfig,
  findUserByIdOrOpenid,
  dbRun,
  CONFIG,
  currentEnv
};
