/**
 * 添加"其他"分类到模板分类表
 * 运行方式: node scripts/add-other-category.js
 */
const Database = require('better-sqlite3');
const path = require('path');

// 数据库路径
const dbPath = process.env.SHARED_DB_PATH || path.join(__dirname, '../core-api/data/flashphoto.db');

console.log('数据库路径:', dbPath);

try {
  const db = new Database(dbPath);

  // 检查是否已存在"其他"分类
  const existing = db.prepare("SELECT id FROM template_categories WHERE name = '其他'").get();

  if (existing) {
    console.log('✓ "其他"分类已存在，无需添加');
  } else {
    // 添加"其他"分类
    db.prepare(`
      INSERT INTO template_categories (name, name_en, icon, cover_image, sort_order, is_visible)
      VALUES ('其他', 'Other', NULL, NULL, 99, 1)
    `).run();
    console.log('✓ 已添加"其他"分类');
  }

  // 显示所有分类
  const categories = db.prepare('SELECT id, name, name_en, sort_order FROM template_categories ORDER BY sort_order').all();
  console.log('\n当前分类列表:');
  categories.forEach(c => {
    console.log(`  ${c.id}. ${c.name} (${c.name_en}) - sort: ${c.sort_order}`);
  });

  db.close();
  console.log('\n完成!');
} catch (error) {
  console.error('错误:', error.message);
  process.exit(1);
}
