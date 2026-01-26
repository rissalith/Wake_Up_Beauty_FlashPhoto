/**
 * 国际化翻译迁移脚本
 * 为场景步骤和选项添加英文翻译
 *
 * 使用方法：
 * 1. 在服务器上运行: node migrations/run-i18n-migration.js
 * 2. 或者在 Docker 容器中运行: docker exec -it flashphoto-core-api node migrations/run-i18n-migration.js
 */

const path = require('path');
const fs = require('fs');

// 尝试加载数据库模块
let db;
try {
  const { getDb } = require('../config/database');
  db = getDb();
} catch (error) {
  console.error('无法加载数据库模块，请确保在 core-api 目录下运行此脚本');
  console.error('错误:', error.message);
  process.exit(1);
}

// 翻译数据
const translations = {
  // 场景翻译
  scenes: [
    { key: 'idphoto', name_en: 'ID Photo', description_en: 'Professional ID photos for documents, passports, and more' },
    { key: 'professional', name_en: 'Professional Photo', description_en: 'Professional headshots for business and career' }
  ],

  // 步骤标题翻译
  steps: [
    { step_key: 'upload', title_en: 'Upload Photo' },
    { step_key: 'gender', title_en: 'Select Gender' },
    { step_key: 'clothing', title_en: 'Select Outfit' },
    { step_key: 'dress', title_en: 'Select Outfit' },
    { step_key: 'hairstyle', title_en: 'Select Hairstyle' },
    { step_key: 'hair', title_en: 'Select Hairstyle' },
    { step_key: 'expression', title_en: 'Select Expression' },
    { step_key: 'spec', title_en: 'Select Size' },
    { step_key: 'size', title_en: 'Select Size' },
    { step_key: 'background', title_en: 'Select Background' },
    { step_key: 'bg_color', title_en: 'Select Background' }
  ],

  // 选项翻译 (按 option_key 或 label 匹配)
  options: [
    // 性别
    { match: { option_key: 'male' }, label_en: 'Male' },
    { match: { option_key: 'female' }, label_en: 'Female' },

    // 服装
    { match: { label: '白衬衫' }, label_en: 'White Shirt' },
    { match: { label: '蓝衬衫' }, label_en: 'Blue Shirt' },
    { match: { label: '深衬衫' }, label_en: 'Dark Shirt' },
    { match: { label: '黑衬衫' }, label_en: 'Black Shirt' },
    { match: { label: '深灰衬衫' }, label_en: 'Dark Gray Shirt' },
    { match: { label: '蓝西装' }, label_en: 'Blue Suit' },
    { match: { label: '深西装' }, label_en: 'Dark Suit' },
    { match: { label: '黑西装' }, label_en: 'Black Suit' },
    { match: { label: '西装领带' }, label_en: 'Suit with Tie' },
    { match: { label: '正装' }, label_en: 'Formal Suit' },

    // 发型
    { match: { label: '寸头' }, label_en: 'Buzz Cut' },
    { match: { label: '侧分' }, label_en: 'Side Part' },
    { match: { label: '短刘分' }, label_en: 'Short Bangs' },
    { match: { label: '短碎发' }, label_en: 'Short Textured' },
    { match: { label: '短发' }, label_en: 'Short Hair' },
    { match: { label: '中发' }, label_en: 'Medium Hair' },
    { match: { label: '长发' }, label_en: 'Long Hair' },
    { match: { label: '马尾' }, label_en: 'Ponytail' },
    { match: { label: '丸子头' }, label_en: 'Bun' },
    { match: { label: '短卷发' }, label_en: 'Short Curly' },

    // 表情
    { match: { label: '不露齿' }, label_en: 'Neutral' },
    { match: { label: '轻微笑' }, label_en: 'Slight Smile' },
    { match: { label: '大微笑' }, label_en: 'Big Smile' },
    { match: { label: '露齿笑' }, label_en: 'Smile with Teeth' },
    { match: { label: '大嘴巴笑' }, label_en: 'Wide Smile' },

    // 规格
    { match: { label: '一寸' }, label_en: '1 inch' },
    { match: { label: '二寸' }, label_en: '2 inch' },
    { match: { label: '小一寸' }, label_en: 'Small 1 inch' },
    { match: { label: '大一寸' }, label_en: 'Large 1 inch' },

    // 背景颜色
    { match: { label: '白色' }, label_en: 'White' },
    { match: { label: '白底' }, label_en: 'White' },
    { match: { label: '蓝色' }, label_en: 'Blue' },
    { match: { label: '蓝底' }, label_en: 'Blue' },
    { match: { label: '红色' }, label_en: 'Red' },
    { match: { label: '红底' }, label_en: 'Red' },
    { match: { label: '灰色' }, label_en: 'Gray' },
    { match: { label: '灰底' }, label_en: 'Gray' },
    { match: { label: '渐变' }, label_en: 'Gradient' }
  ]
};

function runMigration() {
  console.log('开始执行国际化翻译迁移...\n');

  let updatedScenes = 0;
  let updatedSteps = 0;
  let updatedOptions = 0;

  // 1. 更新场景翻译
  console.log('1. 更新场景翻译...');
  for (const scene of translations.scenes) {
    try {
      const result = db.prepare(`
        UPDATE scenes SET name_en = ?, description_en = ?
        WHERE scene_key = ? OR id = ?
      `).run(scene.name_en, scene.description_en, scene.key, scene.key);

      if (result.changes > 0) {
        console.log(`   ✓ 场景 "${scene.key}" 已更新`);
        updatedScenes += result.changes;
      }
    } catch (error) {
      console.error(`   ✗ 场景 "${scene.key}" 更新失败:`, error.message);
    }
  }

  // 2. 更新步骤标题翻译
  console.log('\n2. 更新步骤标题翻译...');
  for (const step of translations.steps) {
    try {
      const result = db.prepare(`
        UPDATE scene_steps SET title_en = ?
        WHERE step_key = ? AND (title_en IS NULL OR title_en = '')
      `).run(step.title_en, step.step_key);

      if (result.changes > 0) {
        console.log(`   ✓ 步骤 "${step.step_key}" 已更新 (${result.changes} 条)`);
        updatedSteps += result.changes;
      }
    } catch (error) {
      console.error(`   ✗ 步骤 "${step.step_key}" 更新失败:`, error.message);
    }
  }

  // 3. 更新选项翻译
  console.log('\n3. 更新选项翻译...');
  for (const opt of translations.options) {
    try {
      let sql, params;

      if (opt.match.option_key) {
        sql = `UPDATE step_options SET label_en = ? WHERE option_key = ? AND (label_en IS NULL OR label_en = '')`;
        params = [opt.label_en, opt.match.option_key];
      } else if (opt.match.label) {
        sql = `UPDATE step_options SET label_en = ? WHERE label = ? AND (label_en IS NULL OR label_en = '')`;
        params = [opt.label_en, opt.match.label];
      }

      if (sql) {
        const result = db.prepare(sql).run(...params);
        if (result.changes > 0) {
          const matchKey = opt.match.option_key || opt.match.label;
          console.log(`   ✓ 选项 "${matchKey}" -> "${opt.label_en}" (${result.changes} 条)`);
          updatedOptions += result.changes;
        }
      }
    } catch (error) {
      console.error(`   ✗ 选项更新失败:`, error.message);
    }
  }

  // 输出统计
  console.log('\n========================================');
  console.log('迁移完成！');
  console.log(`  - 更新场景: ${updatedScenes} 条`);
  console.log(`  - 更新步骤: ${updatedSteps} 条`);
  console.log(`  - 更新选项: ${updatedOptions} 条`);
  console.log('========================================\n');

  // 验证结果
  console.log('验证结果...');
  const stepsWithoutEn = db.prepare(`
    SELECT COUNT(*) as count FROM scene_steps WHERE title_en IS NULL OR title_en = ''
  `).get();
  const optionsWithoutEn = db.prepare(`
    SELECT COUNT(*) as count FROM step_options WHERE label_en IS NULL OR label_en = ''
  `).get();

  console.log(`  - 仍缺少英文翻译的步骤: ${stepsWithoutEn.count} 条`);
  console.log(`  - 仍缺少英文翻译的选项: ${optionsWithoutEn.count} 条`);

  if (stepsWithoutEn.count > 0 || optionsWithoutEn.count > 0) {
    console.log('\n提示: 部分数据仍缺少英文翻译，请在后台管理系统中手动添加。');
  }
}

// 执行迁移
runMigration();
