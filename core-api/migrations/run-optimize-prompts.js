#!/usr/bin/env node

/**
 * 迁移脚本：优化职业照和证件照提示词
 * 改进头身比例、构图和面部特征保持的描述
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../data/flashphoto.db');

// 确保数据库目录存在
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log(`[迁移] 连接数据库: ${dbPath}`);
const db = new Database(dbPath);

try {
  // 读取迁移 SQL 文件
  const sqlFile = path.join(__dirname, 'optimize-portrait-prompts.sql');
  const sql = fs.readFileSync(sqlFile, 'utf-8');

  console.log('[迁移] 执行 SQL 迁移...');
  db.exec(sql);

  // 验证更新
  const idPhotoResult = db.prepare(
    "SELECT name, quality_score FROM knowledge_base WHERE category = 'scene_template' AND name = '证件照场景模板'"
  ).get();

  const professionalResult = db.prepare(
    "SELECT name, quality_score FROM knowledge_base WHERE category = 'scene_template' AND name = '职业照场景模板'"
  ).get();

  console.log('\n[迁移] 更新结果:');
  console.log('✓ 证件照:', idPhotoResult ? `${idPhotoResult.name} (质量评分: ${idPhotoResult.quality_score})` : '未找到');
  console.log('✓ 职业照:', professionalResult ? `${professionalResult.name} (质量评分: ${professionalResult.quality_score})` : '未找到');

  console.log('\n[迁移] 优化内容:');
  console.log('✓ 证件照: 头身比例 55%-60%, 头顶空间 8%-10%');
  console.log('✓ 职业照: 头身比例 40%-45%, 头顶空间 5%-8%');
  console.log('✓ 两者都增强了面部特征保持和肩膀完整性要求');
  console.log('✓ 改进了负面提示词，避免头部过小/过大和肩膀被裁切');

  console.log('\n[迁移] ✅ 完成！');
  process.exit(0);
} catch (error) {
  console.error('[迁移] ❌ 错误:', error.message);
  process.exit(1);
} finally {
  db.close();
}
