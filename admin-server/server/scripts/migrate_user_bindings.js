/**
 * 数据库迁移脚本：创建 user_bindings 表
 * 用于支持多小程序场景下的用户标识管理
 * 
 * 运行方式：node scripts/migrate_user_bindings.js
 */

require('dotenv').config();
const { initDatabase, run, getAll, getOne, saveDatabase } = require('../config/database');

async function migrate() {
  console.log('开始数据库迁移...');
  
  await initDatabase();
  
  // 1. 创建 user_bindings 表
  console.log('创建 user_bindings 表...');
  run(`
    CREATE TABLE IF NOT EXISTS user_bindings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id VARCHAR(100) NOT NULL,
      app_type VARCHAR(20) NOT NULL DEFAULT 'miniapp',
      app_id VARCHAR(100) NOT NULL,
      openid VARCHAR(100) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(app_id, openid)
    )
  `);
  
  // 2. 为 user_id 创建索引
  try {
    run('CREATE INDEX IF NOT EXISTS idx_user_bindings_user_id ON user_bindings(user_id)');
  } catch (e) {
    console.log('索引已存在或创建失败:', e.message);
  }
  
  // 3. 迁移现有用户的 openid 到 bindings 表
  console.log('迁移现有用户数据...');
  const appId = process.env.WX_APPID || 'wxf67c9b6c7b94a9bb';
  
  // 检查是否使用共享数据库
  const isSharedDb = !!process.env.SHARED_DB_PATH;
  
  let users;
  if (isSharedDb) {
    users = getAll('SELECT id, openid FROM users WHERE openid IS NOT NULL');
  } else {
    users = getAll('SELECT user_id, openid FROM users WHERE openid IS NOT NULL');
  }
  
  let migratedCount = 0;
  for (const user of users) {
    const userId = isSharedDb ? user.id : user.user_id;
    const openid = user.openid;
    
    if (!userId || !openid) continue;
    
    // 检查是否已存在
    const existing = getOne(
      'SELECT id FROM user_bindings WHERE app_id = ? AND openid = ?',
      [appId, openid]
    );
    
    if (!existing) {
      try {
        run(
          'INSERT INTO user_bindings (user_id, app_type, app_id, openid) VALUES (?, ?, ?, ?)',
          [userId, 'miniapp', appId, openid]
        );
        migratedCount++;
      } catch (e) {
        console.log(`迁移用户 ${userId} 失败:`, e.message);
      }
    }
  }
  
  console.log(`迁移完成，共迁移 ${migratedCount} 条记录`);
  
  // 4. 验证迁移结果
  const bindingsCount = getOne('SELECT COUNT(*) as count FROM user_bindings');
  console.log(`user_bindings 表当前共有 ${bindingsCount?.count || 0} 条记录`);
  
  saveDatabase();
  console.log('数据库迁移完成！');
}

migrate().catch(console.error);
