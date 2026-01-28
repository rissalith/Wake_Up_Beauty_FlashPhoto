/**
 * 统一数据库配置
 * 合并了 miniprogram-api 和 admin-api 的数据库逻辑
 * 使用单一 SQLite 数据库
 *
 * 所有服务（小程序API、后台管理、支付服务等）共享此数据库
 * 通过环境变量 SHARED_DB_PATH 或 DB_PATH 配置数据库路径
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// 数据库路径配置 - 支持多种环境变量名称以兼容不同服务
const DB_DIR = process.env.DB_DIR || path.join(__dirname, '../data');
const DB_PATH = process.env.SHARED_DB_PATH || process.env.DB_PATH || path.join(DB_DIR, 'flashphoto.db');

let db = null;

// 确保数据目录存在
function ensureDbDir() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

// 初始化数据库
async function initDatabase() {
  ensureDbDir();
  
  db = new Database(DB_PATH, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : null
  });
  
  // 启用 WAL 模式提升并发性能
  db.pragma('journal_mode = WAL');
  
  console.log(`[Database] 已加载数据库: ${DB_PATH}`);
  
  // 创建表结构
  createTables();
  
  // 初始化默认数据
  await initDefaultData();
  
  return db;
}

// 创建表结构
function createTables() {
  // ==================== 用户相关表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE,
      unionid TEXT UNIQUE,
      openid TEXT NOT NULL,
      nickname TEXT,
      avatar_url TEXT,
      bind_email TEXT,
      email TEXT,
      phone TEXT,
      points INTEGER DEFAULT 0,
      is_new_user INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      session_key TEXT,
      privacy_agreed INTEGER DEFAULT 0,
      terms_agreed INTEGER DEFAULT 0,
      agreement_time DATETIME,
      inviter_id TEXT,
      last_login_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 积分相关表 ====================
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 订单相关表 ====================
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 照片相关表 ====================
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 邀请相关表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      inviter_id TEXT NOT NULL,
      invitee_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      reward_points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 用户绑定表（支持多小程序） ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_bindings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      openid TEXT NOT NULL,
      session_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(app_id, openid)
    )
  `);

  // ==================== 管理员相关表 ====================
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

  // ==================== 场景配置表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      description TEXT,
      description_en TEXT,
      icon TEXT,
      cover_image TEXT,
      price INTEGER DEFAULT 0,
      points_cost INTEGER DEFAULT 0,
      is_free INTEGER DEFAULT 0,
      status TEXT DEFAULT 'offline',
      is_review_safe INTEGER DEFAULT 0,
      page_path TEXT,
      use_dynamic_render INTEGER DEFAULT 0,
      coming_soon_text TEXT,
      sort_order INTEGER DEFAULT 0,
      is_highlighted INTEGER DEFAULT 0,
      highlight_color TEXT DEFAULT '#ff6b6b',
      highlight_intensity REAL DEFAULT 0.3,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 场景步骤表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS scene_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id INTEGER NOT NULL,
      step_key TEXT NOT NULL,
      step_name TEXT NOT NULL,
      step_name_en TEXT,
      title TEXT,
      title_en TEXT,
      step_type TEXT DEFAULT 'select',
      component_type TEXT DEFAULT 'select',
      step_order INTEGER DEFAULT 0,
      is_required INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      is_visible INTEGER DEFAULT 1,
      icon TEXT,
      gender_based INTEGER DEFAULT 0,
      config TEXT,
      free_count INTEGER DEFAULT 1,
      cost_per_roll INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 为已存在的表添加新字段（如果不存在）
  try {
    db.exec('ALTER TABLE scene_steps ADD COLUMN free_count INTEGER DEFAULT 1');
  } catch (e) { /* 字段可能已存在 */ }
  try {
    db.exec('ALTER TABLE scene_steps ADD COLUMN cost_per_roll INTEGER DEFAULT 10');
  } catch (e) { /* 字段可能已存在 */ }

  // ==================== 步骤选项表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS step_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_id INTEGER NOT NULL,
      option_key TEXT NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      label TEXT,
      label_en TEXT,
      option_value TEXT,
      image_url TEXT,
      image TEXT,
      color TEXT,
      prompt_text TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      is_visible INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      gender TEXT,
      extra_points INTEGER DEFAULT 0,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== Prompt模板表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id INTEGER NOT NULL,
      template_name TEXT,
      template_content TEXT NOT NULL,
      variables TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 照片规格表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS photo_specs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spec_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      ratio REAL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 充值套餐表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS recharge_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      points INTEGER NOT NULL,
      price INTEGER NOT NULL,
      bonus_points INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 系统配置表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT NOT NULL,
      config_type TEXT DEFAULT 'string',
      description TEXT,
      is_public INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 奖励配置表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS point_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      max_times INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 虚拟支付订单表 ====================
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
      delivered_at DATETIME
    )
  `);

  // ==================== 反馈表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      images TEXT,
      contact TEXT,
      status TEXT DEFAULT 'pending',
      reply_content TEXT,
      replied_at DATETIME,
      reward_amount INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 随机词组池表（吉祥成语） ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS random_phrase_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id TEXT NOT NULL,
      phrase TEXT NOT NULL,
      phrase_en TEXT,
      rarity TEXT DEFAULT 'common',
      weight INTEGER DEFAULT 100,
      prompt_text TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 马品级表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS horse_grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id TEXT NOT NULL,
      grade_key TEXT NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      description TEXT,
      image TEXT,
      probability REAL NOT NULL,
      prompt_text TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 用户抽奖记录表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_draw_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      scene_id TEXT NOT NULL,
      draw_type TEXT NOT NULL,
      result_id INTEGER,
      result_value TEXT,
      points_cost INTEGER DEFAULT 0,
      is_free INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 视频奖励记录表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_reward_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      video_id TEXT,
      points_earned INTEGER NOT NULL,
      watch_duration INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 品级方案主表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS grade_schemes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheme_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      description TEXT,
      category TEXT DEFAULT 'general',
      is_system INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== 品级定义表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS grade_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheme_id INTEGER NOT NULL,
      grade_key TEXT NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      description TEXT,
      weight INTEGER DEFAULT 100,
      probability REAL,
      prompt_text TEXT,
      style_config TEXT,
      color TEXT DEFAULT '#409eff',
      bg_color TEXT,
      text_color TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scheme_id) REFERENCES grade_schemes(id) ON DELETE CASCADE,
      UNIQUE(scheme_id, grade_key)
    )
  `);

  // ==================== 步骤-品级方案映射表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS step_scheme_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id TEXT NOT NULL,
      step_key TEXT NOT NULL,
      scheme_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scheme_id) REFERENCES grade_schemes(id) ON DELETE CASCADE,
      UNIQUE(scene_id, step_key)
    )
  `);

  // ==================== 操作日志表 ====================
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

  // ==================== 用户行为追踪表 ====================
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_behaviors (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      session_id TEXT,
      behavior_type TEXT NOT NULL,
      behavior_name TEXT NOT NULL,
      page_path TEXT,
      page_query TEXT,
      element_id TEXT,
      element_type TEXT,
      element_text TEXT,
      extra_data TEXT,
      device_brand TEXT,
      device_model TEXT,
      system_info TEXT,
      network_type TEXT,
      duration INTEGER,
      client_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建索引
  createIndexes();
  
  console.log('[Database] 表结构创建完成');
}

// 创建索引
function createIndexes() {
  const indexes = [
    // 用户表索引
    'CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid)',
    'CREATE INDEX IF NOT EXISTS idx_users_unionid ON users(unionid)',
    'CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)',
    'CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)',
    // 积分记录索引
    'CREATE INDEX IF NOT EXISTS idx_points_records_user ON points_records(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_points_records_type ON points_records(type)',
    'CREATE INDEX IF NOT EXISTS idx_points_records_created_at ON points_records(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_points_records_user_type ON points_records(user_id, type)',
    // 照片历史索引
    'CREATE INDEX IF NOT EXISTS idx_photo_history_user ON photo_history(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_photo_history_status ON photo_history(status)',
    'CREATE INDEX IF NOT EXISTS idx_photo_history_task ON photo_history(task_id)',
    'CREATE INDEX IF NOT EXISTS idx_photo_history_created_at ON photo_history(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_photo_history_user_status ON photo_history(user_id, status)',
    // 订单索引
    'CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at)',
    // 邀请索引
    'CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites(inviter_id)',
    'CREATE INDEX IF NOT EXISTS idx_invites_invitee ON invites(invitee_id)',
    'CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(status)',
    'CREATE INDEX IF NOT EXISTS idx_invites_created_at ON invites(created_at)',
    // 用户绑定索引
    'CREATE INDEX IF NOT EXISTS idx_user_bindings_user ON user_bindings(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_bindings_app_openid ON user_bindings(app_id, openid)',
    // 虚拟支付索引
    'CREATE INDEX IF NOT EXISTS idx_virtual_pay_orders_user ON virtual_pay_orders(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_virtual_pay_orders_order ON virtual_pay_orders(order_id)',
    // 场景相关索引
    'CREATE INDEX IF NOT EXISTS idx_scenes_status ON scenes(status)',
    'CREATE INDEX IF NOT EXISTS idx_scenes_scene_key ON scenes(scene_key)',
    'CREATE INDEX IF NOT EXISTS idx_scene_steps_scene ON scene_steps(scene_id)',
    'CREATE INDEX IF NOT EXISTS idx_step_options_step ON step_options(step_id)',
    'CREATE INDEX IF NOT EXISTS idx_prompt_templates_scene ON prompt_templates(scene_id)',
    // 反馈索引
    'CREATE INDEX IF NOT EXISTS idx_feedbacks_user ON feedbacks(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status)',
    'CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON feedbacks(created_at)',
    // 操作日志索引
    'CREATE INDEX IF NOT EXISTS idx_operation_logs_admin ON operation_logs(admin_id)',
    'CREATE INDEX IF NOT EXISTS idx_operation_logs_action ON operation_logs(action)',
    'CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at)',
    // 用户行为追踪索引
    'CREATE INDEX IF NOT EXISTS idx_behaviors_user_id ON user_behaviors(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_behaviors_user_time ON user_behaviors(user_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_behaviors_type ON user_behaviors(behavior_type)',
    'CREATE INDEX IF NOT EXISTS idx_behaviors_session ON user_behaviors(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_behaviors_created_at ON user_behaviors(created_at)',
    // 随机词组池索引
    'CREATE INDEX IF NOT EXISTS idx_phrase_pool_scene ON random_phrase_pool(scene_id)',
    'CREATE INDEX IF NOT EXISTS idx_phrase_pool_rarity ON random_phrase_pool(rarity)',
    // 马品级索引
    'CREATE INDEX IF NOT EXISTS idx_horse_grades_scene ON horse_grades(scene_id)',
    // 用户抽奖记录索引
    'CREATE INDEX IF NOT EXISTS idx_draw_records_user ON user_draw_records(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_draw_records_scene ON user_draw_records(scene_id)',
    'CREATE INDEX IF NOT EXISTS idx_draw_records_type ON user_draw_records(draw_type)',
    'CREATE INDEX IF NOT EXISTS idx_draw_records_created_at ON user_draw_records(created_at)',
    // 视频奖励记录索引
    'CREATE INDEX IF NOT EXISTS idx_video_reward_user ON video_reward_records(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_video_reward_created_at ON video_reward_records(created_at)',
    // 品级方案索引
    'CREATE INDEX IF NOT EXISTS idx_grade_schemes_key ON grade_schemes(scheme_key)',
    'CREATE INDEX IF NOT EXISTS idx_grade_schemes_category ON grade_schemes(category)',
    'CREATE INDEX IF NOT EXISTS idx_grade_definitions_scheme ON grade_definitions(scheme_id)',
    'CREATE INDEX IF NOT EXISTS idx_grade_definitions_key ON grade_definitions(grade_key)',
    'CREATE INDEX IF NOT EXISTS idx_step_scheme_mappings_scene_step ON step_scheme_mappings(scene_id, step_key)'
  ];
  
  indexes.forEach(sql => {
    try {
      db.exec(sql);
    } catch (e) {
      // 索引可能已存在
    }
  });
}

// 初始化默认数据
async function initDefaultData() {
  // 初始化默认管理员
  const admin = db.prepare("SELECT * FROM admins WHERE username = 'admin'").get();
  if (!admin) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    db.prepare('INSERT INTO admins (id, username, password, role) VALUES (?, ?, ?, ?)').run(
      uuidv4(), 'admin', hashedPassword, 'superadmin'
    );
    console.log('[Database] 已创建默认管理员账号');
  }

  // 初始化默认奖励配置
  const rewardCount = db.prepare("SELECT COUNT(*) as count FROM point_rewards").get().count;
  if (rewardCount === 0) {
    const rewards = [
      ['new_user', '新用户注册', 50, '新用户注册赠送', 1, 1],
      ['daily_login', '每日登录', 2, '每日首次登录奖励', 1, 1],
      ['invite_friend', '邀请好友', 20, '成功邀请好友注册', -1, 1],
      ['share_photo', '分享照片', 10, '分享生成的照片', 3, 1],
      ['watch_video', '看视频得醒币', 20, '观看视频获得醒币', -1, 1]
    ];
    const stmt = db.prepare('INSERT INTO point_rewards (type, name, points, description, max_times, is_active) VALUES (?, ?, ?, ?, ?, ?)');
    rewards.forEach(r => stmt.run(...r));
    console.log('[Database] 已初始化默认奖励配置');
  }

  // 初始化默认系统配置
  const configCount = db.prepare("SELECT COUNT(*) as count FROM system_config").get().count;
  if (configCount === 0) {
    const configs = [
      ['review_mode', 'false', 'boolean', '审核模式开关', 1],
      ['maintenance_mode', 'false', 'boolean', '维护模式开关', 1],
      ['announcement_enabled', 'false', 'boolean', '公告开关', 1],
      ['announcement_text', '', 'string', '公告内容', 1],
      ['config_version', '1.0.0', 'string', '配置版本号', 1],
      ['default_scene_price', '50', 'number', '默认场景价格', 1],
      ['new_user_points', '50', 'number', '新用户赠送醒币', 0],
      ['invite_reward', '20', 'number', '邀请奖励醒币', 0],
      ['points_per_photo', '50', 'number', '每张照片消耗', 0]
    ];
    const stmt = db.prepare('INSERT INTO system_config (config_key, config_value, config_type, description, is_public) VALUES (?, ?, ?, ?, ?)');
    configs.forEach(c => stmt.run(...c));
    console.log('[Database] 已初始化默认系统配置');
  }

  // 初始化默认照片规格
  const specCount = db.prepare("SELECT COUNT(*) as count FROM photo_specs").get().count;
  if (specCount === 0) {
    const specs = [
      ['1inch', '一寸', '1 Inch', 295, 413, 1.4, 0, 1],
      ['2inch', '二寸', '2 Inch', 413, 579, 1.4, 1, 1],
      ['small1inch', '小一寸', 'Small 1 Inch', 260, 378, 1.45, 2, 1],
      ['big1inch', '大一寸', 'Big 1 Inch', 390, 567, 1.45, 3, 1]
    ];
    const stmt = db.prepare('INSERT INTO photo_specs (spec_key, name, name_en, width, height, ratio, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    specs.forEach(s => stmt.run(...s));
    console.log('[Database] 已初始化默认照片规格');
  }

  // 初始化默认充值套餐
  const packageCount = db.prepare("SELECT COUNT(*) as count FROM recharge_packages").get().count;
  if (packageCount === 0) {
    const packages = [
      ['10醒币', 10, 100, 0, 1, 1],
      ['50醒币', 50, 500, 5, 1, 2],
      ['100醒币', 100, 1000, 15, 1, 3],
      ['500醒币', 500, 5000, 100, 1, 4]
    ];
    const stmt = db.prepare('INSERT INTO recharge_packages (name, points, price, bonus_points, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    packages.forEach(p => stmt.run(...p));
    console.log('[Database] 已初始化默认充值套餐');
  }
}

// ==================== 数据库操作函数 ====================

function getDb() {
  if (!db) throw new Error('数据库未初始化');
  return db;
}

function dbRun(database, sql, params = []) {
  const stmt = database.prepare(sql);
  return params.length ? stmt.run(...params) : stmt.run();
}

function dbGet(sql, params = []) {
  if (!db) throw new Error('数据库未初始化');
  return db.prepare(sql).get(...params) || null;
}

function dbAll(sql, params = []) {
  if (!db) throw new Error('数据库未初始化');
  return db.prepare(sql).all(...params);
}

function saveDatabase() {
  // better-sqlite3 自动持久化，保留接口兼容性
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

// 事务支持
function transaction(fn) {
  return db.transaction(fn)();
}

module.exports = {
  initDatabase,
  getDb,
  dbRun,
  dbGet,
  dbAll,
  saveDatabase,
  transaction,
  close
};
