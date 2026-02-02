/**
 * 场景数据迁移脚本
 * 将现有的 scenes 表数据迁移为 user_templates 表中的官方模板
 *
 * 运行方式：
 * 1. 本地运行: node scripts/migrate-scenes-to-templates.js
 * 2. 服务器运行: docker exec -it flashphoto-core-api node /app/scripts/migrate-scenes-to-templates.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 数据库路径
const DB_PATH = process.env.SHARED_DB_PATH || path.join(__dirname, '../core-api/data/flashphoto.db');

console.log('========================================');
console.log('  场景数据迁移到模板系统');
console.log('========================================');
console.log('数据库路径:', DB_PATH);

// 打开数据库
const db = new Database(DB_PATH);

// 场景到分类的映射
const SCENE_TO_CATEGORY = {
  'horse_year_avatar': 2,  // 春节
  'idphoto': 4,            // 证件照
  'professional': 3,       // 写真
  'portrait': 3,           // 写真
  'family': 3,             // 写真
  'pet': 5,                // 萌宠
  'wedding': 3             // 写真
};

// 官方创作者 ID
const OFFICIAL_CREATOR_ID = 'official_creator';

function migrate() {
  try {
    // 1. 检查是否已有官方创作者
    let officialCreator = db.prepare('SELECT * FROM creators WHERE id = ?').get(OFFICIAL_CREATOR_ID);

    if (!officialCreator) {
      console.log('\n[1/4] 创建官方创作者...');

      // 先检查是否有系统用户
      let systemUser = db.prepare("SELECT * FROM users WHERE id = 'system' OR openid = 'system'").get();

      if (!systemUser) {
        // 创建系统用户
        db.prepare(`
          INSERT INTO users (id, openid, nickname, avatar_url, points, status, created_at)
          VALUES ('system', 'system', '醒美官方', 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com/logo/logo.png', 0, 'active', datetime('now'))
        `).run();
        console.log('  - 创建系统用户: system');
      }

      // 创建官方创作者
      db.prepare(`
        INSERT INTO creators (id, user_id, creator_name, creator_avatar, bio, level, status, created_at)
        VALUES (?, 'system', '醒美官方', 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com/logo/logo.png', '醒美闪图官方出品', 5, 'active', datetime('now'))
      `).run(OFFICIAL_CREATOR_ID);
      console.log('  - 创建官方创作者:', OFFICIAL_CREATOR_ID);
    } else {
      console.log('\n[1/4] 官方创作者已存在');
    }

    // 2. 获取所有场景
    console.log('\n[2/4] 读取现有场景数据...');
    const scenes = db.prepare('SELECT * FROM scenes').all();
    console.log(`  - 找到 ${scenes.length} 个场景`);

    // 3. 迁移每个场景
    console.log('\n[3/4] 开始迁移场景到模板...');

    let migratedCount = 0;
    let skippedCount = 0;

    for (const scene of scenes) {
      const sceneKey = scene.scene_key || scene.id;

      // 检查是否已迁移
      const existingTemplate = db.prepare('SELECT * FROM user_templates WHERE id = ?').get(`official_${sceneKey}`);

      if (existingTemplate) {
        console.log(`  - 跳过 [${scene.name}]: 已存在`);
        skippedCount++;
        continue;
      }

      const templateId = `official_${sceneKey}`;
      const categoryId = SCENE_TO_CATEGORY[sceneKey] || 1; // 默认推荐分类

      // 确定模板状态
      let templateStatus = 'active';
      if (scene.status === 'coming_soon' || scene.status === 'inactive') {
        templateStatus = 'offline';
      }

      // 插入模板
      db.prepare(`
        INSERT INTO user_templates (
          id, creator_id, name, name_en, description, description_en,
          cover_image, reference_image, category_id, tags, gender,
          points_cost, status, is_featured, is_official,
          view_count, use_count, like_count, favorite_count,
          published_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        templateId,
        OFFICIAL_CREATOR_ID,
        scene.name || '',
        scene.name_en || '',
        scene.description || '',
        scene.description_en || '',
        scene.icon || '',           // 使用 icon 作为封面图
        scene.icon || '',           // 使用 icon 作为参考图（官方模板暂时用同一张）
        categoryId,
        scene.name || '',           // 使用名称作为标签
        'all',
        scene.points_cost || 50,
        templateStatus,
        scene.is_highlighted ? 1 : 0,
        1,                          // is_official = 1
        0, 0, 0, 0                  // 初始统计数据
      );

      console.log(`  - 迁移 [${scene.name}] -> ${templateId} (分类: ${categoryId}, 状态: ${templateStatus})`);

      // 4. 迁移场景步骤
      const steps = db.prepare('SELECT * FROM scene_steps WHERE scene_id = ? ORDER BY step_order').all(sceneKey);

      for (const step of steps) {
        const newStepResult = db.prepare(`
          INSERT INTO template_steps (
            template_id, step_order, step_key, title, title_en,
            component_type, is_required, is_visible, config
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          templateId,
          step.step_order || 0,
          step.step_key || '',
          step.title || step.step_name || '',
          step.title_en || step.step_name_en || '',
          step.component_type || 'select',
          step.is_required ? 1 : 0,
          step.is_visible !== 0 ? 1 : 0,
          step.config || ''
        );

        const newStepId = newStepResult.lastInsertRowid;

        // 迁移步骤选项
        const options = db.prepare('SELECT * FROM step_options WHERE step_id = ? ORDER BY sort_order').all(step.id);

        for (const opt of options) {
          db.prepare(`
            INSERT INTO template_step_options (
              step_id, option_key, label, label_en, icon, image,
              prompt_text, sort_order, is_default, is_visible
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newStepId,
            opt.option_key || '',
            opt.label || opt.name || '',
            opt.label_en || opt.name_en || '',
            opt.icon || '',
            opt.image || '',
            opt.prompt_text || '',
            opt.sort_order || 0,
            opt.is_default ? 1 : 0,
            opt.is_visible !== 0 ? 1 : 0
          );
        }

        console.log(`    - 步骤 [${step.title || step.step_name}]: ${options.length} 个选项`);
      }

      // 5. 迁移 Prompt 模板
      const prompts = db.prepare('SELECT * FROM prompt_templates WHERE scene_id = ?').all(sceneKey);

      for (const prompt of prompts) {
        db.prepare(`
          INSERT INTO template_prompts (
            template_id, name, template, negative_prompt,
            reference_weight, face_swap_mode, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          templateId,
          prompt.name || '',
          prompt.template || prompt.template_content || '',
          prompt.negative_prompt || '',
          0.8,
          'replace',
          1
        );
        console.log(`    - Prompt 模板: ${prompt.name || '默认'}`);
      }

      migratedCount++;
    }

    // 6. 更新分类的模板计数
    console.log('\n[4/4] 更新分类模板计数...');
    db.prepare(`
      UPDATE template_categories SET template_count = (
        SELECT COUNT(*) FROM user_templates
        WHERE category_id = template_categories.id AND status = 'active'
      )
    `).run();

    // 打印结果
    console.log('\n========================================');
    console.log('  迁移完成!');
    console.log('========================================');
    console.log(`迁移成功: ${migratedCount} 个场景`);
    console.log(`跳过: ${skippedCount} 个场景（已存在）`);

    // 验证
    const templateCount = db.prepare('SELECT COUNT(*) as count FROM user_templates WHERE is_official = 1').get();
    const activeCount = db.prepare("SELECT COUNT(*) as count FROM user_templates WHERE is_official = 1 AND status = 'active'").get();

    console.log(`\n官方模板总数: ${templateCount.count}`);
    console.log(`已上架模板: ${activeCount.count}`);

  } catch (error) {
    console.error('\n迁移失败:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 执行迁移
migrate();
