const SQL = require('sql.js');
const fs = require('fs');
const path = require('path');

async function initTables() {
  const s = await SQL();
  const dbPath = path.join(__dirname, 'data', 'flashphoto_test.db');
  const db = new s.Database(fs.readFileSync(dbPath));
  
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
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    is_review_safe INTEGER DEFAULT 1,
    points_cost INTEGER DEFAULT 50,
    page_path TEXT,
    use_dynamic_render INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // 创建 scene_steps 表
  db.run(`CREATE TABLE IF NOT EXISTS scene_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    step_key TEXT NOT NULL,
    title TEXT NOT NULL,
    title_en TEXT,
    title_tw TEXT,
    subtitle TEXT,
    component_type TEXT NOT NULL,
    is_required INTEGER DEFAULT 1,
    is_visible INTEGER DEFAULT 1,
    config TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scene_id) REFERENCES scenes(id)
  )`);
  
  // 创建 step_options 表
  db.run(`CREATE TABLE IF NOT EXISTS step_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step_id INTEGER NOT NULL,
    option_key TEXT NOT NULL,
    label TEXT NOT NULL,
    label_en TEXT,
    label_tw TEXT,
    icon TEXT,
    image TEXT,
    prompt_text TEXT,
    extra_points INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    is_visible INTEGER DEFAULT 1,
    metadata TEXT,
    FOREIGN KEY (step_id) REFERENCES scene_steps(id)
  )`);
  
  // 创建 prompt_templates 表
  db.run(`CREATE TABLE IF NOT EXISTS prompt_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id TEXT NOT NULL,
    name TEXT NOT NULL,
    template TEXT NOT NULL,
    negative_prompt TEXT,
    version INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scene_id) REFERENCES scenes(id)
  )`);
  
  // 创建 system_config 表
  db.run(`CREATE TABLE IF NOT EXISTS system_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    config_type TEXT DEFAULT 'string',
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // 插入初始场景数据
  db.run(`INSERT OR REPLACE INTO scenes (id, name, name_en, name_tw, description, icon, status, is_review_safe, points_cost) VALUES
    ('idphoto', '证件照', 'ID Photo', '證件照', 'AI智能证件照，一键生成标准证件照', 'https://pop-pub.com/api/icons/misc-photo.svg', 'active', 1, 50),
    ('professional', '职业照', 'Professional Photo', '職業照', '职场形象照，展现专业风采', 'https://pop-pub.com/api/icons/person-businessman.svg', 'active', 1, 100)`);
  
  // 插入系统配置
  db.run(`INSERT OR REPLACE INTO system_config (config_key, config_value, config_type, description) VALUES
    ('review_mode', 'false', 'boolean', '审核模式开关'),
    ('maintenance_mode', 'false', 'boolean', '维护模式'),
    ('announcement_enabled', 'false', 'boolean', '公告是否显示'),
    ('announcement_text', '', 'string', '公告内容'),
    ('config_version', '1', 'number', '配置版本号')`);
  
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log('✓ 表创建成功');
  console.log('✓ 初始数据导入成功');
  
  // 验证
  const scenes = db.exec('SELECT id, name, status FROM scenes');
  console.log('场景数据:', scenes[0]?.values || []);
}

initTables().catch(console.error);