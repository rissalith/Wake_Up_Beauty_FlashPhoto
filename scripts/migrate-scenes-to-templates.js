/**
 * 场景数据迁移脚本
 * 将现有的 scenes 表数据迁移为 user_templates 表中的官方模板
 *
 * 运行方式：
 * 1. 本地运行: node scripts/migrate-scenes-to-templates.js
 * 2. 服务器运行: docker exec -it flashphoto-core-api node /app/scripts/migrate-scenes-to-templates.js
 *
 * 参数：
 * --force: 强制重新迁移（删除现有官方模板后重新迁移）
 * --validate: 仅验证数据，不执行迁移
 * --incremental: 增量迁移（只迁移新增或修改的场景）
 */

const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 解析命令行参数
const args = process.argv.slice(2);
const FORCE_MODE = args.includes('--force');
const VALIDATE_ONLY = args.includes('--validate');
const INCREMENTAL_MODE = args.includes('--incremental');

// 数据库路径
const DB_PATH = process.env.SHARED_DB_PATH || path.join(__dirname, '../core-api/data/flashphoto.db');

console.log('========================================');
console.log('  场景数据迁移到模板系统');
console.log('========================================');
console.log('数据库路径:', DB_PATH);
console.log('运行模式:', FORCE_MODE ? '强制迁移' : INCREMENTAL_MODE ? '增量迁移' : VALIDATE_ONLY ? '仅验证' : '标准迁移');

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

/**
 * 确保 source_scene_id 字段存在
 */
function ensureSourceSceneIdColumn() {
  try {
    // 检查字段是否存在
    const tableInfo = db.prepare("PRAGMA table_info(user_templates)").all();
    const hasColumn = tableInfo.some(col => col.name === 'source_scene_id');

    if (!hasColumn) {
      console.log('\n[准备] 添加 source_scene_id 字段...');
      db.exec('ALTER TABLE user_templates ADD COLUMN source_scene_id TEXT');
      db.exec('CREATE INDEX IF NOT EXISTS idx_user_templates_source_scene ON user_templates(source_scene_id)');
      console.log('  - 字段添加成功');
    }
  } catch (error) {
    // 字段可能已存在
    console.log('  - source_scene_id 字段已存在');
  }
}

/**
 * 验证迁移数据完整性
 */
function validateMigration() {
  console.log('\n========================================');
  console.log('  数据验证');
  console.log('========================================');

  const scenes = db.prepare('SELECT * FROM scenes').all();
  const officialTemplates = db.prepare('SELECT * FROM user_templates WHERE is_official = 1').all();

  console.log(`\n源数据统计:`);
  console.log(`  - 场景总数: ${scenes.length}`);

  let activeScenes = 0;
  let offlineScenes = 0;
  scenes.forEach(s => {
    if (s.status === 'active') activeScenes++;
    else offlineScenes++;
  });
  console.log(`  - 已上架场景: ${activeScenes}`);
  console.log(`  - 未上架场景: ${offlineScenes}`);

  console.log(`\n目标数据统计:`);
  console.log(`  - 官方模板总数: ${officialTemplates.length}`);

  let activeTemplates = 0;
  let offlineTemplates = 0;
  officialTemplates.forEach(t => {
    if (t.status === 'active') activeTemplates++;
    else offlineTemplates++;
  });
  console.log(`  - 已上架模板: ${activeTemplates}`);
  console.log(`  - 未上架模板: ${offlineTemplates}`);

  // 检查每个场景的迁移状态
  console.log(`\n场景迁移状态:`);
  let migratedCount = 0;
  let notMigratedCount = 0;
  const notMigrated = [];

  for (const scene of scenes) {
    const sceneKey = scene.scene_key || scene.id;
    const template = db.prepare(
      'SELECT * FROM user_templates WHERE source_scene_id = ? OR id = ?'
    ).get(sceneKey, `official_${sceneKey}`);

    if (template) {
      migratedCount++;

      // 验证步骤数量
      const sceneSteps = db.prepare('SELECT COUNT(*) as count FROM scene_steps WHERE scene_id = ?').get(sceneKey);
      const templateSteps = db.prepare('SELECT COUNT(*) as count FROM template_steps WHERE template_id = ?').get(template.id);

      if (sceneSteps.count !== templateSteps.count) {
        console.log(`  - [警告] ${scene.name}: 步骤数量不匹配 (场景: ${sceneSteps.count}, 模板: ${templateSteps.count})`);
      }

      // 验证 Prompt 模板
      const scenePrompts = db.prepare('SELECT COUNT(*) as count FROM prompt_templates WHERE scene_id = ?').get(sceneKey);
      const templatePrompts = db.prepare('SELECT COUNT(*) as count FROM template_prompts WHERE template_id = ?').get(template.id);

      if (scenePrompts.count !== templatePrompts.count) {
        console.log(`  - [警告] ${scene.name}: Prompt数量不匹配 (场景: ${scenePrompts.count}, 模板: ${templatePrompts.count})`);
      }
    } else {
      notMigratedCount++;
      notMigrated.push(scene.name);
    }
  }

  console.log(`\n迁移完成度: ${migratedCount}/${scenes.length} (${Math.round(migratedCount/scenes.length*100)}%)`);

  if (notMigrated.length > 0) {
    console.log(`\n未迁移的场景:`);
    notMigrated.forEach(name => console.log(`  - ${name}`));
  }

  return {
    total: scenes.length,
    migrated: migratedCount,
    notMigrated: notMigratedCount
  };
}

/**
 * 检查场景是否需要更新
 */
function needsUpdate(scene, template) {
  if (!template) return true;

  // 比较关键字段
  if (scene.name !== template.name) return true;
  if (scene.description !== template.description) return true;
  if (scene.points_cost !== template.points_cost) return true;
  if (scene.icon !== template.cover_image) return true;

  // 比较状态
  const expectedStatus = (scene.status === 'coming_soon' || scene.status === 'inactive') ? 'offline' : 'active';
  if (expectedStatus !== template.status) return true;

  return false;
}

/**
 * 删除模板及其关联数据
 */
function deleteTemplate(templateId) {
  // 删除步骤选项
  const steps = db.prepare('SELECT id FROM template_steps WHERE template_id = ?').all(templateId);
  for (const step of steps) {
    db.prepare('DELETE FROM template_step_options WHERE step_id = ?').run(step.id);
  }

  // 删除步骤
  db.prepare('DELETE FROM template_steps WHERE template_id = ?').run(templateId);

  // 删除 Prompt
  db.prepare('DELETE FROM template_prompts WHERE template_id = ?').run(templateId);

  // 删除模板
  db.prepare('DELETE FROM user_templates WHERE id = ?').run(templateId);
}

/**
 * 主迁移函数
 */
function migrate() {
  try {
    // 确保 source_scene_id 字段存在
    ensureSourceSceneIdColumn();

    // 如果是仅验证模式
    if (VALIDATE_ONLY) {
      validateMigration();
      return;
    }

    // 1. 检查是否已有官方创作者
    let officialCreator = db.prepare('SELECT * FROM creators WHERE id = ?').get(OFFICIAL_CREATOR_ID);

    if (!officialCreator) {
      console.log('\n[1/5] 创建官方创作者...');

      // 先检查是否有系统用户
      let systemUser = db.prepare("SELECT * FROM users WHERE id = 'system' OR openid = 'system'").get();

      if (!systemUser) {
        // 创建系统用户
        db.prepare(`
          INSERT INTO users (id, openid, nickname, avatar_url, points, status, created_at)
          VALUES ('system', 'system', '醒美官方', 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com/logo/logo-main.jpg', 0, 'active', datetime('now'))
        `).run();
        console.log('  - 创建系统用户: system');
      }

      // 创建官方创作者
      db.prepare(`
        INSERT INTO creators (id, user_id, creator_name, creator_avatar, bio, level, status, created_at)
        VALUES (?, 'system', '醒美官方', 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com/logo/logo-main.jpg', '醒美闪图官方出品', 5, 'active', datetime('now'))
      `).run(OFFICIAL_CREATOR_ID);
      console.log('  - 创建官方创作者:', OFFICIAL_CREATOR_ID);
    } else {
      console.log('\n[1/5] 官方创作者已存在');
    }

    // 2. 强制模式：删除所有官方模板
    if (FORCE_MODE) {
      console.log('\n[2/5] 强制模式：删除现有官方模板...');
      const existingTemplates = db.prepare('SELECT id FROM user_templates WHERE is_official = 1').all();
      for (const t of existingTemplates) {
        deleteTemplate(t.id);
      }
      console.log(`  - 已删除 ${existingTemplates.length} 个官方模板`);
    } else {
      console.log('\n[2/5] 跳过删除步骤（非强制模式）');
    }

    // 3. 获取所有场景
    console.log('\n[3/5] 读取现有场景数据...');
    const scenes = db.prepare('SELECT * FROM scenes').all();
    console.log(`  - 找到 ${scenes.length} 个场景`);

    // 4. 迁移每个场景
    console.log('\n[4/5] 开始迁移场景到模板...');

    let migratedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const scene of scenes) {
      const sceneKey = scene.scene_key || scene.id;
      const templateId = `official_${sceneKey}`;

      // 检查是否已迁移
      const existingTemplate = db.prepare(
        'SELECT * FROM user_templates WHERE source_scene_id = ? OR id = ?'
      ).get(sceneKey, templateId);

      // 增量模式：检查是否需要更新
      if (existingTemplate && INCREMENTAL_MODE) {
        if (needsUpdate(scene, existingTemplate)) {
          console.log(`  - 更新 [${scene.name}]: 检测到变更`);
          deleteTemplate(existingTemplate.id);
          updatedCount++;
        } else {
          console.log(`  - 跳过 [${scene.name}]: 无变更`);
          skippedCount++;
          continue;
        }
      } else if (existingTemplate && !FORCE_MODE) {
        console.log(`  - 跳过 [${scene.name}]: 已存在`);
        skippedCount++;
        continue;
      }

      const categoryId = SCENE_TO_CATEGORY[sceneKey] || 1; // 默认推荐分类

      // 确定模板状态
      let templateStatus = 'active';
      if (scene.status === 'coming_soon' || scene.status === 'inactive') {
        templateStatus = 'offline';
      }

      // 插入模板（包含 source_scene_id）
      db.prepare(`
        INSERT INTO user_templates (
          id, creator_id, name, name_en, description, description_en,
          cover_image, reference_image, category_id, tags, gender,
          points_cost, status, is_featured, is_official, source_scene_id,
          view_count, use_count, like_count, favorite_count,
          published_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
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
        sceneKey,                   // source_scene_id
        0, 0, 0, 0                  // 初始统计数据
      );

      console.log(`  - 迁移 [${scene.name}] -> ${templateId} (分类: ${categoryId}, 状态: ${templateStatus})`);

      // 迁移场景步骤
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

      // 迁移 Prompt 模板
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

    // 5. 更新分类的模板计数
    console.log('\n[5/5] 更新分类模板计数...');
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
    console.log(`新迁移: ${migratedCount} 个场景`);
    if (INCREMENTAL_MODE) {
      console.log(`更新: ${updatedCount} 个场景`);
    }
    console.log(`跳过: ${skippedCount} 个场景`);

    // 执行验证
    validateMigration();

  } catch (error) {
    console.error('\n迁移失败:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 执行迁移
migrate();
