/**
 * 数据库清理脚本 - 删除创作者、模板、知识库相关的表
 * 用于垂直化改造：从通用多场景改为垂类专精
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../core-api/data/flashphoto.db');
const db = new Database(dbPath);

console.log('开始清理数据库...');

// 需要删除的表列表
const tablesToDrop = [
  // 创作者相关表
  'creators',
  'creator_earnings',
  'creator_withdrawals',
  'creator_templates',
  'creator_template_versions',
  'creator_reviews',

  // 用户模板相关表
  'user_templates',
  'user_template_versions',
  'template_likes',
  'template_comments',
  'template_shares',

  // 知识库相关表
  'knowledge_base',
  'knowledge_categories',
  'knowledge_articles',
  'knowledge_comments',

  // 品级方案相关表
  'grade_schemes',
  'grade_levels',
  'grade_rewards',

  // 其他不需要的表
  'ai_agents',
  'agent_tasks',
  'agent_results',
  'official_templates',
  'template_reviews',
  'market_items',
  'market_categories'
];

let droppedCount = 0;
let skippedCount = 0;

for (const table of tablesToDrop) {
  try {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
    console.log(`✓ 删除表: ${table}`);
    droppedCount++;
  } catch (error) {
    console.log(`✗ 跳过表: ${table} (${error.message})`);
    skippedCount++;
  }
}

// 删除相关的索引
const indicesToDrop = [
  'idx_creators_user',
  'idx_creator_templates_creator',
  'idx_user_templates_user',
  'idx_knowledge_category',
  'idx_grade_schemes_user',
  'idx_ai_agents_user',
  'idx_market_items_category'
];

for (const index of indicesToDrop) {
  try {
    db.exec(`DROP INDEX IF EXISTS ${index}`);
    console.log(`✓ 删除索引: ${index}`);
  } catch (error) {
    // 索引可能不存在，忽略错误
  }
}

// 清理 system_config 中的创作者相关配置
try {
  db.prepare(`
    DELETE FROM system_config
    WHERE config_key LIKE '%creator%'
       OR config_key LIKE '%template%'
       OR config_key LIKE '%knowledge%'
       OR config_key LIKE '%grade%'
  `).run();
  console.log('✓ 清理系统配置中的创作者相关项');
} catch (error) {
  console.log(`✗ 清理系统配置失败: ${error.message}`);
}

// 清理 users 表中的创作者相关字段（如果存在）
try {
  const userTableInfo = db.prepare("PRAGMA table_info(users)").all();
  const creatorFields = userTableInfo
    .filter(col => col.name.includes('creator') || col.name.includes('grade'))
    .map(col => col.name);

  if (creatorFields.length > 0) {
    console.log(`⚠ 注意: users 表中存在创作者相关字段: ${creatorFields.join(', ')}`);
    console.log('  这些字段需要手动处理（可能包含用户数据）');
  }
} catch (error) {
  // 表可能不存在
}

db.close();

console.log(`\n清理完成！`);
console.log(`- 删除表数: ${droppedCount}`);
console.log(`- 跳过表数: ${skippedCount}`);
console.log('\n⚠ 重要提示:');
console.log('1. 此脚本仅删除表结构，不影响核心业务数据');
console.log('2. 如需恢复，请从备份恢复数据库');
console.log('3. 建议在生产环境前在测试环境验证');
