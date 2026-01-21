const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function addTables() {
  const SQL = await initSqlJs();
  const dbPath = process.env.SHARED_DB_PATH || path.join(__dirname, '../data/flashphoto_prod.db');

  console.log('数据库路径:', dbPath);

  if (!fs.existsSync(dbPath)) {
    console.log('数据库文件不存在');
    return;
  }

  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  // 创建 point_rewards 表（醒币奖励配置）
  db.run(`
    CREATE TABLE IF NOT EXISTS point_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT UNIQUE NOT NULL,
      points INTEGER DEFAULT 0,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('创建 point_rewards 表成功');

  // 插入默认奖励配置
  const rewards = [
    ['new_user', 50, '新用户注册奖励', 1],
    ['share_image', 5, '分享图片奖励', 1],
    ['invite_friend', 20, '邀请好友奖励', 1]
  ];

  for (const r of rewards) {
    try {
      db.run('INSERT OR IGNORE INTO point_rewards (type, points, description, is_active) VALUES (?, ?, ?, ?)', r);
    } catch(e) {
      console.log('插入奖励配置跳过:', r[0]);
    }
  }
  console.log('插入默认奖励配置成功');

  // 创建 recharge_packages 表（充值套餐）
  db.run(`
    CREATE TABLE IF NOT EXISTS recharge_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount INTEGER NOT NULL,
      points INTEGER NOT NULL,
      bonus_points INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('创建 recharge_packages 表成功');

  // 插入默认充值套餐
  const packages = [
    [6, 60, 0, 1, 1],
    [12, 120, 10, 1, 2],
    [30, 300, 30, 1, 3],
    [68, 680, 80, 1, 4],
    [128, 1280, 200, 1, 5],
    [298, 2980, 500, 1, 6]
  ];

  for (const p of packages) {
    try {
      db.run('INSERT OR IGNORE INTO recharge_packages (amount, points, bonus_points, is_active, sort_order) VALUES (?, ?, ?, ?, ?)', p);
    } catch(e) {
      console.log('插入充值套餐跳过:', p[0]);
    }
  }
  console.log('插入默认充值套餐成功');

  // 保存数据库
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  console.log('数据库保存成功');

  // 验证
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('\n当前数据库表:');
  if (tables.length > 0) {
    tables[0].values.forEach(row => console.log(' -', row[0]));
  }
}

addTables().catch(console.error);
