require('dotenv').config();

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// 统一数据库路径 - 通过环境变量 SHARED_DB_PATH 配置
// 宝塔部署时设置: SHARED_DB_PATH=/www/wwwroot/你的域名/data/flashphoto.db
const dbPath = process.env.SHARED_DB_PATH || path.join(__dirname, '../database/flashphoto.db');
const dbDir = path.dirname(dbPath);

console.log(`[Database] 使用数据库路径: ${dbPath}`);

// 确保数据库目录存在
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;
let SQL = null;  // 保存 SQL.js 实例用于重新加载
let isProcessing = false;  // 操作锁，防止并发
const operationQueue = [];  // 操作队列

// 重新加载数据库（用于错误恢复）
async function reloadDatabase() {
  console.log('[Database] 正在重新加载数据库...');
  try {
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      console.log('[Database] 数据库重新加载成功');
      return true;
    }
  } catch (e) {
    console.error('[Database] 重新加载失败:', e.message);
  }
  return false;
}

// 保存数据库到文件（带错误处理）
function saveDatabase() {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (e) {
      console.error('[Database] 保存失败:', e.message);
    }
  }
}

// 安全执行数据库操作（带重试和恢复）
async function safeExecute(operation, maxRetries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return operation();
    } catch (e) {
      lastError = e;
      console.error(`[Database] 操作失败 (尝试 ${attempt + 1}/${maxRetries + 1}):`, e.message);

      // 如果是内存错误，尝试重新加载数据库
      if (e.message.includes('memory access out of bounds') ||
          e.message.includes('out of memory')) {
        console.log('[Database] 检测到内存错误，尝试恢复...');
        const reloaded = await reloadDatabase();
        if (!reloaded) {
          throw new Error('数据库恢复失败: ' + e.message);
        }
        // 重新加载后再重试
        continue;
      }

      // 其他错误直接抛出
      if (attempt === maxRetries) {
        throw e;
      }
    }
  }

  throw lastError;
}

// 处理队列中的下一个操作
async function processQueue() {
  if (isProcessing || operationQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (operationQueue.length > 0) {
    const { operation, resolve, reject } = operationQueue.shift();
    try {
      const result = await safeExecute(operation);
      resolve(result);
    } catch (e) {
      reject(e);
    }
  }

  isProcessing = false;
}

// 将操作加入队列
function queueOperation(operation) {
  return new Promise((resolve, reject) => {
    operationQueue.push({ operation, resolve, reject });
    processQueue();
  });
}

// 初始化数据库
async function initDatabase() {
  SQL = await initSqlJs();  // 保存到模块变量以便重新加载时使用

  // 如果存在数据库文件则加载，否则创建新的
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // 创建基础表
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
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
    )
  `);

  // 创建反馈表
  db.run(`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_id VARCHAR(50) UNIQUE NOT NULL,
      user_id VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      images TEXT,
      contact VARCHAR(100),
      status VARCHAR(20) DEFAULT 'pending',
      reply_content TEXT,
      replied_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建充值套餐表
  db.run(`
    CREATE TABLE IF NOT EXISTS recharge_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount DECIMAL(10,2) NOT NULL,
      points INTEGER NOT NULL,
      bonus_points INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建积分奖励配置表
  db.run(`
    CREATE TABLE IF NOT EXISTS point_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type VARCHAR(50) UNIQUE NOT NULL,
      points INTEGER NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建积分记录表（兼容独立数据库）
  db.run(`
    CREATE TABLE IF NOT EXISTS point_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id VARCHAR(50) UNIQUE NOT NULL,
      user_id VARCHAR(50) NOT NULL,
      type VARCHAR(50) NOT NULL,
      amount INTEGER NOT NULL,
      balance INTEGER DEFAULT 0,
      description TEXT,
      related_id VARCHAR(50),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建订单表（兼容独立数据库）
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id VARCHAR(50) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      points_amount INTEGER DEFAULT 0,
      bonus_points INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      payment_id VARCHAR(100),
      payment_method VARCHAR(50),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建虚拟支付订单表（iOS虚拟支付）
  db.run(`
    CREATE TABLE IF NOT EXISTS virtual_pay_orders (
      id VARCHAR(50) PRIMARY KEY,
      order_id VARCHAR(50) UNIQUE NOT NULL,
      user_id VARCHAR(50) NOT NULL,
      openid VARCHAR(100),
      amount INTEGER NOT NULL,
      points INTEGER NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      wx_transaction_id VARCHAR(100),
      attach TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivered_at DATETIME,
      cancelled_at DATETIME,
      cancel_reason TEXT
    )
  `);

  // 迁移检查：自动添加缺失的列
  const addColumnIfNotExists = (tableName, columnName, columnDef) => {
    try {
      const res = db.exec(`PRAGMA table_info(${tableName})`);
      if (res.length > 0) {
        const columns = res[0].values.map(row => row[1]);
        if (!columns.includes(columnName)) {
          db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
          console.log(`[Database] 已为 ${tableName} 表添加 ${columnName} 列`);
        }
      }
    } catch (e) {
      console.error(`[Database] 迁移检查失败 (${tableName}.${columnName}):`, e.message);
    }
  };

  addColumnIfNotExists('users', 'points', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('users', 'inviter_id', 'TEXT');
  addColumnIfNotExists('feedbacks', 'reward_amount', 'INTEGER DEFAULT 0');

  // 创建中台配置相关表
  // 场景主表
  // status: active(上线), coming_soon(即将上线), offline(未上线/下线), beta(内测中)
  db.run(`
    CREATE TABLE IF NOT EXISTS scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_key VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      name_en VARCHAR(100),
      description TEXT,
      description_en TEXT,
      icon VARCHAR(255),
      cover_image VARCHAR(255),
      price INTEGER DEFAULT 0,
      is_free BOOLEAN DEFAULT 0,
      status VARCHAR(20) DEFAULT 'offline',
      is_review_safe BOOLEAN DEFAULT 0,
      page_path VARCHAR(255),
      use_dynamic_render BOOLEAN DEFAULT 0,
      coming_soon_text VARCHAR(100),
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 场景步骤表
  db.run(`
    CREATE TABLE IF NOT EXISTS scene_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id INTEGER NOT NULL,
      step_key VARCHAR(50) NOT NULL,
      step_name VARCHAR(100) NOT NULL,
      step_name_en VARCHAR(100),
      step_type VARCHAR(50) DEFAULT 'select',
      step_order INTEGER DEFAULT 0,
      is_required BOOLEAN DEFAULT 1,
      is_active BOOLEAN DEFAULT 1,
      config TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 步骤选项表
  db.run(`
    CREATE TABLE IF NOT EXISTS step_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_id INTEGER NOT NULL,
      option_key VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      name_en VARCHAR(100),
      option_value VARCHAR(255),
      image_url VARCHAR(255),
      prompt_text TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Prompt模板表
  db.run(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id INTEGER NOT NULL,
      template_name VARCHAR(100),
      template_content TEXT NOT NULL,
      variables TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 系统配置表（兼容生产数据库字段名）
  db.run(`
    CREATE TABLE IF NOT EXISTS system_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT NOT NULL,
      config_type TEXT DEFAULT 'string',
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 规格配置表
  db.run(`
    CREATE TABLE IF NOT EXISTS photo_specs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spec_key VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      name_en VARCHAR(100),
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      ratio DECIMAL(5,2),
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 初始化默认系统配置
  const existingConfig = getAll("SELECT config_key FROM system_config");
  const existingKeys = existingConfig.map(c => c.config_key);

  const defaultConfigs = [
    { key: 'review_mode', value: 'false', type: 'boolean', desc: '审核模式开关', is_public: 1 },
    { key: 'maintenance_mode', value: 'false', type: 'boolean', desc: '维护模式开关', is_public: 1 },
    { key: 'announcement_enabled', value: 'false', type: 'boolean', desc: '公告开关', is_public: 1 },
    { key: 'announcement_text', value: '', type: 'string', desc: '公告内容', is_public: 1 },
    { key: 'config_version', value: '1.0.0', type: 'string', desc: '配置版本号', is_public: 1 },
    { key: 'default_scene_price', value: '50', type: 'number', desc: '默认场景价格', is_public: 1 },
    { key: 'new_user_points', value: '100', type: 'number', desc: '新用户赠送醒币', is_public: 0 }
  ];

  defaultConfigs.forEach(config => {
    if (!existingKeys.includes(config.key)) {
      // 兼容生产数据库：使用 config_value 和 config_type
      db.run(`INSERT INTO system_config (config_key, config_value, config_type, description) VALUES ('${config.key}', '${config.value}', '${config.type}', '${config.desc}')`);
    }
  });

  // 迁移：为scenes表添加新字段（如果不存在）
  addColumnIfNotExists('scenes', 'status', "VARCHAR(20) DEFAULT 'offline'");
  addColumnIfNotExists('scenes', 'page_path', 'VARCHAR(255)');
  addColumnIfNotExists('scenes', 'use_dynamic_render', 'BOOLEAN DEFAULT 0');
  addColumnIfNotExists('scenes', 'coming_soon_text', 'VARCHAR(100)');
  addColumnIfNotExists('scenes', 'description_en', 'TEXT');

  // 迁移：为scene_steps表添加新字段（如果不存在）
  addColumnIfNotExists('scene_steps', 'icon', 'VARCHAR(255)');
  addColumnIfNotExists('scene_steps', 'gender_based', 'BOOLEAN DEFAULT 0');
  addColumnIfNotExists('scene_steps', 'title', 'VARCHAR(100)');
  addColumnIfNotExists('scene_steps', 'title_en', 'VARCHAR(100)');
  addColumnIfNotExists('scene_steps', 'component_type', "VARCHAR(50) DEFAULT 'select'");
  addColumnIfNotExists('scene_steps', 'is_visible', 'BOOLEAN DEFAULT 1');

  // 迁移：为step_options表添加新字段（如果不存在）
  addColumnIfNotExists('step_options', 'label', 'VARCHAR(100)');
  addColumnIfNotExists('step_options', 'label_en', 'VARCHAR(100)');
  addColumnIfNotExists('step_options', 'color', 'VARCHAR(50)');
  addColumnIfNotExists('step_options', 'image', 'VARCHAR(255)');
  addColumnIfNotExists('step_options', 'is_visible', 'BOOLEAN DEFAULT 1');
  addColumnIfNotExists('step_options', 'is_default', 'BOOLEAN DEFAULT 0');
  addColumnIfNotExists('step_options', 'gender', 'VARCHAR(20)');
  addColumnIfNotExists('step_options', 'extra_points', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('step_options', 'metadata', 'TEXT');

  // 初始化默认场景（如果不存在）- 使用 try-catch 兼容不同表结构
  // status: active(上线), coming_soon(即将上线), offline(未上线), beta(内测)
  // COS图片基础路径: https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com
  const CDN_BASE = 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com';
  const IMG_VERSION = 'v7';

  try {
    // 尝试查询场景，兼容不同表结构
    const existingScenes = getAll("SELECT id FROM scenes");
    // 如果已有场景数据，跳过初始化
    if (existingScenes.length > 0) {
      console.log('[Database] 场景数据已存在，跳过初始化');
    }
  } catch (e) {
    console.log('[Database] 场景初始化跳过（表结构不兼容）:', e.message);
  }

  // 初始化默认规格（如果不存在）- 使用 try-catch 兼容
  try {
    const existingSpecs = getAll("SELECT id FROM photo_specs");
    if (existingSpecs.length === 0) {
      const defaultSpecs = [
        { key: '1inch', name: '一寸', name_en: '1 Inch', width: 295, height: 413, ratio: 1.4, sort: 0 },
        { key: '2inch', name: '二寸', name_en: '2 Inch', width: 413, height: 579, ratio: 1.4, sort: 1 },
        { key: 'small1inch', name: '小一寸', name_en: 'Small 1 Inch', width: 260, height: 378, ratio: 1.45, sort: 2 },
        { key: 'big1inch', name: '大一寸', name_en: 'Big 1 Inch', width: 390, height: 567, ratio: 1.45, sort: 3 }
      ];
      defaultSpecs.forEach(spec => {
        db.run(`INSERT INTO photo_specs (spec_key, name, name_en, width, height, ratio, sort_order) VALUES ('${spec.key}', '${spec.name}', '${spec.name_en}', ${spec.width}, ${spec.height}, ${spec.ratio}, ${spec.sort})`);
      });
    }
  } catch (e) {
    console.log('[Database] 规格初始化跳过:', e.message);
  }

  // 初始化默认充值套餐（如果不存在）
  try {
    const existingPackages = getAll("SELECT id FROM recharge_packages");
    if (existingPackages.length === 0) {
      const defaultPackages = [
        { amount: 5, points: 50, bonus: 0, sort: 0 },
        { amount: 10, points: 100, bonus: 10, sort: 1 },
        { amount: 20, points: 200, bonus: 30, sort: 2 },
        { amount: 50, points: 500, bonus: 100, sort: 3 },
        { amount: 100, points: 1000, bonus: 300, sort: 4 },
        { amount: 200, points: 2000, bonus: 800, sort: 5 }
      ];
      defaultPackages.forEach(pkg => {
        db.run(`INSERT INTO recharge_packages (amount, points, bonus_points, is_active, sort_order) VALUES (${pkg.amount}, ${pkg.points}, ${pkg.bonus}, 1, ${pkg.sort})`);
      });
      console.log('[Database] 已初始化默认充值套餐');
    }
  } catch (e) {
    console.log('[Database] 充值套餐初始化跳过:', e.message);
  }

  // 初始化默认积分奖励配置（如果不存在）
  try {
    const existingRewards = getAll("SELECT id FROM point_rewards");
    if (existingRewards.length === 0) {
      const defaultRewards = [
        { type: 'new_user', points: 100, desc: '新用户注册奖励' },
        { type: 'share_image', points: 5, desc: '分享图片奖励' },
        { type: 'invite_friend', points: 50, desc: '邀请好友奖励' },
        { type: 'invite_reward', points: 20, desc: '被邀请人首次消费奖励' }
      ];
      defaultRewards.forEach(reward => {
        db.run(`INSERT INTO point_rewards (type, points, description, is_active) VALUES ('${reward.type}', ${reward.points}, '${reward.desc}', 1)`);
      });
      console.log('[Database] 已初始化默认积分奖励配置');
    }
  } catch (e) {
    console.log('[Database] 积分奖励配置初始化跳过:', e.message);
  }

  // 初始化管理员账号 - 使用 try-catch 兼容
  try {
    const admin = db.exec("SELECT * FROM admins WHERE username = 'admin'");
    if (admin.length === 0) {
      const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-password';
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      db.run("INSERT INTO admins (username, password) VALUES (?, ?)", ['admin', hashedPassword]);
    }
  } catch (e) {
    console.log('[Database] 管理员初始化跳过:', e.message);
  }

  saveDatabase();
  console.log('数据库初始化完成');
}

// 数据库操作包装（同步版本，用于向后兼容）
function run(sql, params = []) {
  if (!db) throw new Error('数据库未初始化');
  try {
    db.run(sql, params);
    saveDatabase();
  } catch (e) {
    // 如果是内存错误，尝试同步恢复
    if (e.message.includes('memory access out of bounds') || e.message.includes('out of memory')) {
      console.log('[Database] run() 检测到内存错误，尝试恢复...');
      if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
        console.log('[Database] 数据库恢复成功，重试操作...');
        db.run(sql, params);
        saveDatabase();
        return;
      }
    }
    throw e;
  }
}

// 异步安全执行（推荐使用）
async function runAsync(sql, params = []) {
  return queueOperation(() => {
    if (!db) throw new Error('数据库未初始化');
    db.run(sql, params);
    saveDatabase();
  });
}

// 批量执行（不立即保存，最后统一保存）
function runBatch(sql, params = []) {
  if (!db) throw new Error('数据库未初始化');
  try {
    db.run(sql, params);
  } catch (e) {
    if (e.message.includes('memory access out of bounds') || e.message.includes('out of memory')) {
      console.log('[Database] runBatch() 检测到内存错误，尝试恢复...');
      if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
        console.log('[Database] 数据库恢复成功，重试操作...');
        db.run(sql, params);
        return;
      }
    }
    throw e;
  }
}

// 提交批量操作
function commitBatch() {
  saveDatabase();
}

function getOne(sql, params = []) {
  if (!db) throw new Error('数据库未初始化');
  try {
    const result = db.exec(sql, params);
    if (result.length > 0) {
      const columns = result[0].columns;
      const values = result[0].values[0];
      const obj = {};
      columns.forEach((col, index) => {
        obj[col] = values[index];
      });
      return obj;
    }
    return null;
  } catch (e) {
    if (e.message.includes('memory access out of bounds') || e.message.includes('out of memory')) {
      console.log('[Database] getOne() 检测到内存错误，尝试恢复...');
      if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
        console.log('[Database] 数据库恢复成功，重试查询...');
        return getOne(sql, params);  // 递归重试
      }
    }
    throw e;
  }
}

function getAll(sql, params = []) {
  if (!db) throw new Error('数据库未初始化');
  try {
    const result = db.exec(sql, params);
    if (result.length > 0) {
      const columns = result[0].columns;
      return result[0].values.map(row => {
        const obj = {};
        columns.forEach((col, index) => {
          obj[col] = row[index];
        });
        return obj;
      });
    }
    return [];
  } catch (e) {
    if (e.message.includes('memory access out of bounds') || e.message.includes('out of memory')) {
      console.log('[Database] getAll() 检测到内存错误，尝试恢复...');
      if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
        console.log('[Database] 数据库恢复成功，重试查询...');
        return getAll(sql, params);  // 递归重试
      }
    }
    throw e;
  }
}

module.exports = {
  initDatabase,
  run,
  runAsync,
  runBatch,
  commitBatch,
  getOne,
  getAll,
  saveDatabase,
  reloadDatabase
};