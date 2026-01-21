/**
 * 初始化配置相关表
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function initTables() {
  const SQL = await initSqlJs();
  const dbPath = process.env.NODE_ENV === 'production' 
    ? '/app/data/flashphoto_prod.db' 
    : '/app/data/flashphoto_test.db';
  
  console.log('Using database:', dbPath);
  
  let db;
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  // 创建 system_config 表
  db.run(`CREATE TABLE IF NOT EXISTS system_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,
    config_value TEXT,
    config_type TEXT DEFAULT 'string',
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 创建 scenes 表
  db.run(`CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT,
    name_tw TEXT,
    description TEXT,
    description_en TEXT,
    description_tw TEXT,
    icon TEXT,
    cover_image TEXT,
    status TEXT DEFAULT 'active',
    is_review_safe INTEGER DEFAULT 1,
    points_cost INTEGER DEFAULT 50,
    page_path TEXT,
    use_dynamic_render INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 创建 scene_steps 表
  db.run(`CREATE TABLE IF NOT EXISTS scene_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id TEXT NOT NULL,
    step_order INTEGER DEFAULT 0,
    step_key TEXT,
    title TEXT,
    title_en TEXT,
    title_tw TEXT,
    subtitle TEXT,
    component_type TEXT,
    is_required INTEGER DEFAULT 1,
    is_visible INTEGER DEFAULT 1,
    config TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 创建 step_options 表
  db.run(`CREATE TABLE IF NOT EXISTS step_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step_id INTEGER NOT NULL,
    option_key TEXT,
    label TEXT,
    label_en TEXT,
    label_tw TEXT,
    icon TEXT,
    image TEXT,
    color TEXT,
    prompt_text TEXT,
    extra_points INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    is_visible INTEGER DEFAULT 1,
    gender TEXT,
    metadata TEXT
  )`);

  // 创建 prompt_templates 表
  db.run(`CREATE TABLE IF NOT EXISTS prompt_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id TEXT NOT NULL,
    name TEXT,
    template TEXT,
    negative_prompt TEXT,
    version INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 创建 photo_specs 表
  db.run(`CREATE TABLE IF NOT EXISTS photo_specs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id TEXT NOT NULL,
    spec_key TEXT,
    name TEXT,
    name_en TEXT,
    name_tw TEXT,
    width INTEGER,
    height INTEGER,
    physical_width TEXT,
    physical_height TEXT,
    ratio TEXT,
    sort_order INTEGER DEFAULT 0,
    is_visible INTEGER DEFAULT 1
  )`);

  // 插入默认系统配置
  const defaultConfigs = [
    ['config_version', '1', 'number', '配置版本号'],
    ['review_mode', 'false', 'boolean', '审核模式'],
    ['announcement', '', 'string', '公告内容'],
    ['new_user_points', '100', 'number', '新用户赠送积分'],
    ['invite_reward', '50', 'number', '邀请奖励积分']
  ];

  for (const [key, value, type, desc] of defaultConfigs) {
    const exists = db.exec(`SELECT 1 FROM system_config WHERE config_key = '${key}'`);
    if (exists.length === 0) {
      db.run(`INSERT INTO system_config (config_key, config_value, config_type, description) VALUES (?, ?, ?, ?)`, [key, value, type, desc]);
      console.log('Inserted config:', key);
    }
  }

  // 插入默认场景
  const defaultScenes = [
    ['idphoto', '证件照', 'ID Photo', '證件照', '专业证件照制作', 'Professional ID photo', '專業證件照製作', '📷', 'active', 1, 50, '/pages/idphoto/index', 0, 1],
    ['portrait', '写真照', 'Portrait', '寫真照', '艺术写真照片', 'Artistic portrait', '藝術寫真照片', '🎨', 'active', 1, 80, '/pages/portrait/index', 1, 2]
  ];

  for (const scene of defaultScenes) {
    const exists = db.exec(`SELECT 1 FROM scenes WHERE id = '${scene[0]}'`);
    if (exists.length === 0) {
      db.run(`INSERT INTO scenes (id, name, name_en, name_tw, description, description_en, description_tw, icon, status, is_review_safe, points_cost, page_path, use_dynamic_render, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, scene);
      console.log('Inserted scene:', scene[0]);
    }
  }

  // 保存数据库
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  console.log('Database saved to:', dbPath);

  // 验证
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables:', tables[0]?.values.map(v => v[0]).join(', '));
  
  const scenes = db.exec("SELECT id, name FROM scenes");
  console.log('Scenes:', scenes[0]?.values || 'none');
  
  const configs = db.exec("SELECT config_key, config_value FROM system_config");
  console.log('Configs:', configs[0]?.values || 'none');

  db.close();
}

initTables().catch(console.error);