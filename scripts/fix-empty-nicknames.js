#!/usr/bin/env node
/**
 * 修复空昵称脚本
 *
 * 功能：
 * 为数据库中 nickname 为 NULL 或空字符串的用户生成默认昵称（醒宝_XXX格式）
 *
 * 使用方法：
 *   cd core-api && node ../scripts/fix-empty-nicknames.js [--dry-run]
 *   或
 *   node scripts/fix-empty-nicknames.js [--dry-run]
 *
 * 参数：
 *   --dry-run    只分析不执行修改
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

// 尝试加载 better-sqlite3
let Database;
const possiblePaths = [
  path.join(PROJECT_ROOT, 'node_modules'),
  path.join(PROJECT_ROOT, 'core-api/node_modules'),
  path.join(PROJECT_ROOT, 'server/node_modules'),
  path.join(PROJECT_ROOT, 'admin-server/server/node_modules'),
];

for (const modulePath of possiblePaths) {
  try {
    Database = require(path.join(modulePath, 'better-sqlite3'));
    console.log(`✓ 从 ${modulePath} 加载 better-sqlite3`);
    break;
  } catch (e) {
    // 继续尝试下一个路径
  }
}

if (!Database) {
  console.error('✗ 无法加载 better-sqlite3 模块');
  console.error('请先在 core-api 目录下运行 npm install');
  process.exit(1);
}

// 生成默认昵称（与后端逻辑一致）
function generateDefaultNickname() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomId = '';
  for (let i = 0; i < 11; i++) {
    randomId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `醒宝_${randomId}`;
}

// 查找数据库文件
function findDatabase() {
  const possibleDbPaths = [
    path.join(PROJECT_ROOT, 'core-api/data/flashphoto.db'),
    path.join(PROJECT_ROOT, 'data/flashphoto.db'),
    path.join(PROJECT_ROOT, 'admin-server/server/database/flashphoto.db'),
  ];

  for (const dbPath of possibleDbPaths) {
    if (fs.existsSync(dbPath)) {
      return dbPath;
    }
  }
  return null;
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('========================================');
  console.log('  修复空昵称脚本');
  console.log('========================================');
  console.log(`模式: ${dryRun ? '预览模式（不会修改数据）' : '执行模式'}`);
  console.log('');

  // 查找数据库
  const dbPath = findDatabase();
  if (!dbPath) {
    console.error('✗ 未找到数据库文件');
    console.error('请确保数据库文件存在于以下位置之一：');
    console.error('  - core-api/data/flashphoto.db');
    console.error('  - data/flashphoto.db');
    process.exit(1);
  }

  console.log(`数据库路径: ${dbPath}`);
  console.log('');

  // 打开数据库
  const db = new Database(dbPath);

  try {
    // 查询空昵称的用户
    const emptyNicknameUsers = db.prepare(`
      SELECT id, openid, nickname, created_at
      FROM users
      WHERE nickname IS NULL OR nickname = ''
    `).all();

    console.log(`找到 ${emptyNicknameUsers.length} 个空昵称用户`);
    console.log('');

    if (emptyNicknameUsers.length === 0) {
      console.log('✓ 没有需要修复的用户');
      return;
    }

    // 显示将要修复的用户
    console.log('将要修复的用户列表：');
    console.log('----------------------------------------');

    const updates = emptyNicknameUsers.map(user => ({
      id: user.id,
      openid: user.openid,
      oldNickname: user.nickname || '(NULL)',
      newNickname: generateDefaultNickname(),
      createdAt: user.created_at
    }));

    updates.forEach((update, index) => {
      console.log(`${index + 1}. ID: ${update.id.substring(0, 8)}...`);
      console.log(`   旧昵称: ${update.oldNickname}`);
      console.log(`   新昵称: ${update.newNickname}`);
      console.log(`   注册时间: ${update.createdAt}`);
      console.log('');
    });

    if (dryRun) {
      console.log('----------------------------------------');
      console.log('预览模式，未执行任何修改');
      console.log('如需执行修改，请去掉 --dry-run 参数');
      return;
    }

    // 执行更新
    console.log('开始执行更新...');
    console.log('');

    const updateStmt = db.prepare(`
      UPDATE users SET nickname = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);

    let successCount = 0;
    let failCount = 0;

    for (const update of updates) {
      try {
        updateStmt.run(update.newNickname, update.id);
        successCount++;
        console.log(`✓ 已更新用户 ${update.id.substring(0, 8)}... -> ${update.newNickname}`);
      } catch (error) {
        failCount++;
        console.error(`✗ 更新用户 ${update.id.substring(0, 8)}... 失败: ${error.message}`);
      }
    }

    console.log('');
    console.log('========================================');
    console.log(`更新完成！成功: ${successCount}, 失败: ${failCount}`);
    console.log('========================================');

  } finally {
    db.close();
  }
}

// 运行
main();
