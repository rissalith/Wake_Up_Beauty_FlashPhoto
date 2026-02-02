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
      negative_prompt TEXT,
      variables TEXT,
      segments TEXT,
      model_config TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 为已存在的表添加新字段（如果不存在）
  try {
    db.exec(`ALTER TABLE prompt_templates ADD COLUMN segments TEXT`);
  } catch (e) {
    // 字段已存在，忽略错误
  }
  try {
    db.exec(`ALTER TABLE prompt_templates ADD COLUMN model_config TEXT`);
  } catch (e) {
    // 字段已存在，忽略错误
  }

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

  // 素材元数据表
  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      name TEXT,
      source TEXT DEFAULT 'upload',
      prompt TEXT,
      folder TEXT,
      file_size INTEGER,
      width INTEGER,
      height INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    )
  `);

  // ==================== 创作者中心相关表 ====================

  // 创作者表（所有用户自动成为创作者）
  db.exec(`
    CREATE TABLE IF NOT EXISTS creators (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      creator_name TEXT NOT NULL,
      creator_avatar TEXT,
      bio TEXT,
      level INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      total_templates INTEGER DEFAULT 0,
      total_uses INTEGER DEFAULT 0,
      total_likes INTEGER DEFAULT 0,
      total_earnings INTEGER DEFAULT 0,
      balance INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 模板分类表
  db.exec(`
    CREATE TABLE IF NOT EXISTS template_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_en TEXT,
      icon TEXT,
      cover_image TEXT,
      sort_order INTEGER DEFAULT 0,
      is_visible INTEGER DEFAULT 1,
      template_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 用户模板表
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_templates (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      description TEXT,
      description_en TEXT,
      cover_image TEXT NOT NULL,
      reference_image TEXT NOT NULL,
      category_id INTEGER,
      tags TEXT,
      gender TEXT DEFAULT 'all',
      points_cost INTEGER DEFAULT 50,
      status TEXT DEFAULT 'draft',
      reject_reason TEXT,
      is_featured INTEGER DEFAULT 0,
      is_official INTEGER DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      use_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      favorite_count INTEGER DEFAULT 0,
      share_count INTEGER DEFAULT 0,
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES creators(id),
      FOREIGN KEY (category_id) REFERENCES template_categories(id)
    )
  `);

  // 模板步骤配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS template_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      step_key TEXT NOT NULL,
      title TEXT NOT NULL,
      title_en TEXT,
      subtitle TEXT,
      component_type TEXT NOT NULL,
      is_required INTEGER DEFAULT 1,
      is_visible INTEGER DEFAULT 1,
      config TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES user_templates(id) ON DELETE CASCADE
    )
  `);

  // 模板步骤选项表
  db.exec(`
    CREATE TABLE IF NOT EXISTS template_step_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_id INTEGER NOT NULL,
      option_key TEXT NOT NULL,
      label TEXT NOT NULL,
      label_en TEXT,
      icon TEXT,
      image TEXT,
      prompt_text TEXT,
      extra_points INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      is_visible INTEGER DEFAULT 1,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (step_id) REFERENCES template_steps(id) ON DELETE CASCADE
    )
  `);

  // 模板 Prompt 配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS template_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id TEXT NOT NULL,
      name TEXT,
      template TEXT NOT NULL,
      negative_prompt TEXT,
      reference_weight REAL DEFAULT 0.8,
      face_swap_mode TEXT DEFAULT 'replace',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES user_templates(id) ON DELETE CASCADE
    )
  `);

  // 模板收藏表
  db.exec(`
    CREATE TABLE IF NOT EXISTS template_favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, template_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (template_id) REFERENCES user_templates(id) ON DELETE CASCADE
    )
  `);

  // 模板点赞表
  db.exec(`
    CREATE TABLE IF NOT EXISTS template_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, template_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (template_id) REFERENCES user_templates(id) ON DELETE CASCADE
    )
  `);

  // 模板使用记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS template_usage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      points_cost INTEGER NOT NULL,
      creator_earning INTEGER DEFAULT 0,
      result_image TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (template_id) REFERENCES user_templates(id),
      FOREIGN KEY (creator_id) REFERENCES creators(id)
    )
  `);

  // 创作者收益记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_earnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id TEXT NOT NULL,
      template_id TEXT,
      usage_record_id INTEGER,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES creators(id),
      FOREIGN KEY (template_id) REFERENCES user_templates(id),
      FOREIGN KEY (usage_record_id) REFERENCES template_usage_records(id)
    )
  `);

  // 模板审核记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS template_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id TEXT NOT NULL,
      reviewer_id TEXT,
      action TEXT NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES user_templates(id)
    )
  `);

  // 创作者等级配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_en TEXT,
      min_templates INTEGER DEFAULT 0,
      min_uses INTEGER DEFAULT 0,
      min_likes INTEGER DEFAULT 0,
      revenue_share INTEGER DEFAULT 10,
      max_templates INTEGER DEFAULT 10,
      badge_icon TEXT,
      privileges TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 为 users 表添加创作者相关字段
  try {
    db.exec('ALTER TABLE users ADD COLUMN is_creator INTEGER DEFAULT 0');
  } catch (e) { /* 字段可能已存在 */ }
  try {
    db.exec('ALTER TABLE users ADD COLUMN creator_id TEXT');
  } catch (e) { /* 字段可能已存在 */ }

  // 为 photo_history 表添加模板相关字段
  try {
    db.exec('ALTER TABLE photo_history ADD COLUMN template_id TEXT');
  } catch (e) { /* 字段可能已存在 */ }
  try {
    db.exec('ALTER TABLE photo_history ADD COLUMN reference_image TEXT');
  } catch (e) { /* 字段可能已存在 */ }
  try {
    db.exec('ALTER TABLE photo_history ADD COLUMN generation_mode TEXT DEFAULT "prompt"');
  } catch (e) { /* 字段可能已存在 */ }

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
    'CREATE INDEX IF NOT EXISTS idx_step_scheme_mappings_scene_step ON step_scheme_mappings(scene_id, step_key)',
    // 创作者中心索引
    'CREATE INDEX IF NOT EXISTS idx_creators_user ON creators(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_creators_status ON creators(status)',
    'CREATE INDEX IF NOT EXISTS idx_creators_level ON creators(level)',
    'CREATE INDEX IF NOT EXISTS idx_user_templates_creator ON user_templates(creator_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_templates_status ON user_templates(status)',
    'CREATE INDEX IF NOT EXISTS idx_user_templates_category ON user_templates(category_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_templates_featured ON user_templates(is_featured)',
    'CREATE INDEX IF NOT EXISTS idx_user_templates_official ON user_templates(is_official)',
    'CREATE INDEX IF NOT EXISTS idx_user_templates_use_count ON user_templates(use_count DESC)',
    'CREATE INDEX IF NOT EXISTS idx_user_templates_like_count ON user_templates(like_count DESC)',
    'CREATE INDEX IF NOT EXISTS idx_user_templates_published ON user_templates(published_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_template_steps_template ON template_steps(template_id)',
    'CREATE INDEX IF NOT EXISTS idx_template_step_options_step ON template_step_options(step_id)',
    'CREATE INDEX IF NOT EXISTS idx_template_prompts_template ON template_prompts(template_id)',
    'CREATE INDEX IF NOT EXISTS idx_template_favorites_user ON template_favorites(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_template_favorites_template ON template_favorites(template_id)',
    'CREATE INDEX IF NOT EXISTS idx_template_likes_user ON template_likes(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_template_likes_template ON template_likes(template_id)',
    'CREATE INDEX IF NOT EXISTS idx_template_usage_user ON template_usage_records(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_template_usage_template ON template_usage_records(template_id)',
    'CREATE INDEX IF NOT EXISTS idx_template_usage_creator ON template_usage_records(creator_id)',
    'CREATE INDEX IF NOT EXISTS idx_template_usage_created ON template_usage_records(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_creator_earnings_creator ON creator_earnings(creator_id)',
    'CREATE INDEX IF NOT EXISTS idx_creator_earnings_template ON creator_earnings(template_id)',
    'CREATE INDEX IF NOT EXISTS idx_template_reviews_template ON template_reviews(template_id)',
    'CREATE INDEX IF NOT EXISTS idx_template_categories_visible ON template_categories(is_visible)'
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

  // 初始化创作者等级配置
  const levelCount = db.prepare("SELECT COUNT(*) as count FROM creator_levels").get().count;
  if (levelCount === 0) {
    const levels = [
      [1, '新手创作者', 'Novice Creator', 0, 0, 0, 10, 5, null, null],
      [2, '进阶创作者', 'Advanced Creator', 3, 100, 50, 15, 10, null, null],
      [3, '专业创作者', 'Professional Creator', 10, 500, 200, 20, 20, null, null],
      [4, '大师创作者', 'Master Creator', 30, 2000, 1000, 25, 50, null, null],
      [5, '传奇创作者', 'Legendary Creator', 100, 10000, 5000, 30, -1, null, null]
    ];
    const stmt = db.prepare('INSERT INTO creator_levels (level, name, name_en, min_templates, min_uses, min_likes, revenue_share, max_templates, badge_icon, privileges) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    levels.forEach(l => stmt.run(...l));
    console.log('[Database] 已初始化创作者等级配置');
  }

  // 初始化模板分类
  const categoryCount = db.prepare("SELECT COUNT(*) as count FROM template_categories").get().count;
  if (categoryCount === 0) {
    const categories = [
      ['推荐', 'Featured', null, null, 0, 1],
      ['春节', 'Spring Festival', null, null, 1, 1],
      ['写真', 'Portrait', null, null, 2, 1],
      ['证件照', 'ID Photo', null, null, 3, 1],
      ['萌宠', 'Cute Pets', null, null, 4, 1],
      ['艺术', 'Art', null, null, 5, 1],
      ['趣味', 'Fun', null, null, 6, 1],
      ['节日', 'Festival', null, null, 7, 1]
    ];
    const stmt = db.prepare('INSERT INTO template_categories (name, name_en, icon, cover_image, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?)');
    categories.forEach(c => stmt.run(...c));
    console.log('[Database] 已初始化模板分类');
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
