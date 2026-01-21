/**
 * 数据库辅助模块 - 使用 better-sqlite3 (原生 SQLite)
 * 支持多进程并发访问，无需重启即可看到最新数据
 *
 * 统一数据库配置：所有服务共享同一个数据库文件
 * 优先使用 SHARED_DB_PATH 环境变量
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db = null;

// 初始化数据库连接
function initDb() {
  if (db) return db;

  // 统一使用 SHARED_DB_PATH，兼容旧配置
  const dbPath = process.env.SHARED_DB_PATH ||
    process.env.DB_PATH ||
    (process.env.NODE_ENV === 'production'
      ? '/app/data/flashphoto.db'
      : path.join(__dirname, '../../core-api/data/flashphoto.db'));

  console.log(`[Database] 使用数据库路径: ${dbPath}`);
  console.log(`[Database] 使用 better-sqlite3 (原生 SQLite)`);

  // 确保目录存在
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // 打开数据库
  db = new Database(dbPath);

  // 启用 WAL 模式提升并发性能
  db.pragma('journal_mode = WAL');

  return db;
}

// 立即初始化
initDb();

function getAll(sql, params = []) {
  if (!db) return [];
  try {
    return db.prepare(sql).all(...params);
  } catch (e) {
    console.error('getAll error:', e.message);
    return [];
  }
}

function getOne(sql, params = []) {
  if (!db) return null;
  try {
    return db.prepare(sql).get(...params) || null;
  } catch (e) {
    console.error('getOne error:', e.message);
    return null;
  }
}

function run(sql, params = []) {
  if (!db) return { changes: 0 };
  try {
    const result = db.prepare(sql).run(...params);
    return { changes: result.changes };
  } catch (e) {
    console.error('run error:', e.message);
    return { changes: 0 };
  }
}

module.exports = { getAll, getOne, run, initDb };
