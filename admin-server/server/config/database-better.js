require('dotenv').config();

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// 支持通过环境变量配置共享数据库路径
const dbPath = process.env.SHARED_DB_PATH || path.join(__dirname, '../database/xingmei.db');
const dbDir = path.dirname(dbPath);

console.log(`[Database] 使用数据库路径: ${dbPath}`);
console.log(`[Database] 使用 better-sqlite3 (原生 SQLite)`);

// 确保数据库目录存在
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

// 初始化数据库
async function initDatabase() {
  // 使用 better-sqlite3 打开数据库（自动创建）
  db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : null
  });

  // 启用 WAL 模式提升并发性能
  db.pragma('journal_mode = WAL');

  // 创建基础表
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
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
  db.exec(`
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

  // 迁移检查：自动添加缺失的列
  const addColumnIfNotExists = (tableName, columnName, columnDef) => {
    try {
      const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
      const columns = tableInfo.map(row => row.name);
      if (!columns.includes(columnName)) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
        console.log(`[Database] 已为 ${tableName} 表添加 ${columnName} 列`);
      }
    } catch (e) {
      console.error(`[Database] 迁移检查失败 (${tableName}.${columnName}):`, e.message);
    }
  };

  addColumnIfNotExists('users', 'points', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('users', 'inviter_id', 'TEXT');
  addColumnIfNotExists('feedbacks', 'reward_amount', 'INTEGER DEFAULT 0');

  // 创建中台配置相关表
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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

  const insertConfig = db.prepare(`INSERT OR IGNORE INTO system_config (config_key, config_value, config_type, description) VALUES (?, ?, ?, ?)`);
  defaultConfigs.forEach(config => {
    if (!existingKeys.includes(config.key)) {
      insertConfig.run(config.key, config.value, config.type, config.desc);
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

  // 初始化默认场景（如果不存在）
  try {
    const existingScenes = getAll("SELECT id FROM scenes");
    if (existingScenes.length > 0) {
      console.log('[Database] 场景数据已存在，跳过初始化');
    }
  } catch (e) {
    console.log('[Database] 场景初始化跳过（表结构不兼容）:', e.message);
  }

  // 初始化默认规格（如果不存在）
  try {
    const existingSpecs = getAll("SELECT id FROM photo_specs");
    if (existingSpecs.length === 0) {
      const defaultSpecs = [
        { key: '1inch', name: '一寸', name_en: '1 Inch', width: 295, height: 413, ratio: 1.4, sort: 0 },
        { key: '2inch', name: '二寸', name_en: '2 Inch', width: 413, height: 579, ratio: 1.4, sort: 1 },
        { key: 'small1inch', name: '小一寸', name_en: 'Small 1 Inch', width: 260, height: 378, ratio: 1.45, sort: 2 },
        { key: 'big1inch', name: '大一寸', name_en: 'Big 1 Inch', width: 390, height: 567, ratio: 1.45, sort: 3 }
      ];
      const insertSpec = db.prepare(`INSERT INTO photo_specs (spec_key, name, name_en, width, height, ratio, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      defaultSpecs.forEach(spec => {
        insertSpec.run(spec.key, spec.name, spec.name_en, spec.width, spec.height, spec.ratio, spec.sort);
      });
    }
  } catch (e) {
    console.log('[Database] 规格初始化跳过:', e.message);
  }

  // 初始化管理员账号
  try {
    const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get('admin');
    if (!admin) {
      const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-password';
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      db.prepare("INSERT INTO admins (username, password) VALUES (?, ?)").run('admin', hashedPassword);
    }
  } catch (e) {
    console.log('[Database] 管理员初始化跳过:', e.message);
  }

  console.log('数据库初始化完成');
}

// 数据库操作函数
function run(sql, params = []) {
  if (!db) throw new Error('数据库未初始化');
  return db.prepare(sql).run(...params);
}

// 异步版本（为了兼容性，实际上 better-sqlite3 是同步的）
async function runAsync(sql, params = []) {
  return run(sql, params);
}

// 批量执行
function runBatch(sql, params = []) {
  if (!db) throw new Error('数据库未初始化');
  return db.prepare(sql).run(...params);
}

// 提交批量操作（better-sqlite3 自动提交，这里保留接口兼容性）
function commitBatch() {
  // better-sqlite3 不需要手动提交
}

function getOne(sql, params = []) {
  if (!db) throw new Error('数据库未初始化');
  return db.prepare(sql).get(...params) || null;
}

function getAll(sql, params = []) {
  if (!db) throw new Error('数据库未初始化');
  return db.prepare(sql).all(...params);
}

// 事务支持
function transaction(fn) {
  return db.transaction(fn)();
}

// 保存数据库（better-sqlite3 自动持久化，保留接口兼容性）
function saveDatabase() {
  // better-sqlite3 自动持久化到文件，不需要手动保存
}

// 重新加载数据库（保留接口兼容性）
async function reloadDatabase() {
  console.log('[Database] better-sqlite3 不需要重新加载');
  return true;
}

// 关闭数据库连接
function close() {
  if (db) {
    db.close();
    db = null;
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
  reloadDatabase,
  transaction,
  close
};
