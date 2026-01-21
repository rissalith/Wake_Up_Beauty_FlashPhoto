/**
 * 数据库辅助模块 - 为 config 路由提供数据库操作
 * 连接到主数据库实例
 */
const initSqlJs = require('sql.js');
const fs = require('fs');

let db = null;

// 初始化数据库连接
async function initDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  // 统一数据库路径 - 通过环境变量 SHARED_DB_PATH 配置
  // 宝塔部署时设置: SHARED_DB_PATH=/www/wwwroot/你的域名/data/flashphoto.db
  const dbPath = process.env.SHARED_DB_PATH || 
    (process.env.NODE_ENV === 'production' 
      ? '/app/data/flashphoto_prod.db' 
      : '/app/data/flashphoto_test.db');
  console.log(`[Database] 使用数据库路径: ${dbPath}`);
  
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  return db;
}

// 立即初始化
initDb().catch(console.error);

function getAll(sql, params = []) {
  if (!db) return [];
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (e) {
    console.error('getAll error:', e.message);
    return [];
  }
}

function getOne(sql, params = []) {
  if (!db) return null;
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const result = stmt.getAsObject();
      stmt.free();
      return result;
    }
    stmt.free();
    return null;
  } catch (e) {
    console.error('getOne error:', e.message);
    return null;
  }
}

function run(sql, params = []) {
  if (!db) return { changes: 0 };
  try {
    db.run(sql, params);
    // 保存到文件 - 使用与初始化相同的路径
    const savePath = process.env.SHARED_DB_PATH || 
      (process.env.NODE_ENV === 'production' 
        ? '/app/data/flashphoto_prod.db' 
        : '/app/data/flashphoto_test.db');
    fs.writeFileSync(savePath, Buffer.from(db.export()));
    return { changes: db.getRowsModified() };
  } catch (e) {
    console.error('run error:', e.message);
    return { changes: 0 };
  }
}

module.exports = { getAll, getOne, run, initDb };