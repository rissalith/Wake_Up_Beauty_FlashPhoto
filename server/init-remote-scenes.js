const SQL = require('sql.js');
const fs = require('fs');
const path = require('path');

async function init() {
  const s = await SQL();
  const dbPath = process.env.DB_PATH || './data/flashphoto_prod.db';
  console.log('DB Path:', dbPath);
  
  if (!fs.existsSync(dbPath)) {
    console.log('DB file not found');
    process.exit(1);
  }
  
  const db = new s.Database(fs.readFileSync(dbPath));
  
  // Check existing tables
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Existing tables:', tables[0]?.values?.map(v => v[0]) || []);
  
  // Create scenes table
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
  
  // Create system_config table
  db.run(`CREATE TABLE IF NOT EXISTS system_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    config_type TEXT DEFAULT 'string',
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Insert scenes
  db.run(`INSERT OR REPLACE INTO scenes (id, name, name_en, name_tw, description, icon, status, is_review_safe, points_cost) VALUES
    ('idphoto', '证件照', 'ID Photo', '證件照', 'AI智能证件照', 'https://pop-pub.com/api/icons/misc-photo.svg', 'active', 1, 50),
    ('professional', '职业照', 'Professional Photo', '職業照', '职场形象照', 'https://pop-pub.com/api/icons/person-businessman.svg', 'active', 1, 100)`);
  
  // Insert system config
  db.run(`INSERT OR REPLACE INTO system_config (config_key, config_value, config_type) VALUES
    ('review_mode', 'false', 'boolean'),
    ('maintenance_mode', 'false', 'boolean'),
    ('announcement_enabled', 'false', 'boolean'),
    ('announcement_text', '', 'string'),
    ('config_version', '1', 'number')`);
  
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  
  // Verify
  const scenes = db.exec('SELECT id, name, status FROM scenes');
  console.log('Scenes:', scenes[0]?.values || []);
  console.log('Done!');
}

init().catch(e => console.error('Error:', e.message));