/**
 * 数据库迁移脚本：删除繁体中文相关字段
 *
 * 此脚本用于删除数据库中不再使用的繁体中文字段：
 * - scenes 表: name_tw, description_tw
 * - scene_steps 表: step_name_tw, title_tw
 * - step_options 表: name_tw, label_tw
 *
 * 使用方法：
 * 1. 先备份数据库
 * 2. 运行: node scripts/remove-tw-fields.js
 */

const path = require('path');
const fs = require('fs');

// 数据库路径配置
const DB_PATHS = [
  path.join(__dirname, '../core-api/data/flashphoto.db'),
  path.join(__dirname, '../admin-server/server/database/flashphoto.db'),
  path.join(__dirname, '../admin-server/server/database/xingmei.db')
];

// 查找可用的数据库文件
function findDatabase() {
  for (const dbPath of DB_PATHS) {
    if (fs.existsSync(dbPath)) {
      return dbPath;
    }
  }
  return null;
}

// 主函数
async function main() {
  const dbPath = findDatabase();

  if (!dbPath) {
    console.error('错误: 未找到数据库文件');
    console.log('尝试的路径:');
    DB_PATHS.forEach(p => console.log('  -', p));
    process.exit(1);
  }

  console.log('找到数据库:', dbPath);
  console.log('');

  // 加载 better-sqlite3
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    console.error('错误: 无法加载 better-sqlite3 模块');
    console.log('请先安装: npm install better-sqlite3');
    process.exit(1);
  }

  // 备份数据库
  const backupPath = dbPath.replace('.db', `_backup_${Date.now()}.db`);
  console.log('备份数据库到:', backupPath);
  fs.copyFileSync(dbPath, backupPath);
  console.log('备份完成');
  console.log('');

  // 打开数据库
  const db = new Database(dbPath);

  try {
    // SQLite 不支持直接删除列，需要重建表
    // 这里我们使用 SQLite 的方式来删除列

    console.log('开始删除繁体字段...');
    console.log('');

    // 1. 处理 scenes 表
    console.log('处理 scenes 表...');
    const scenesColumns = db.pragma('table_info(scenes)');
    const hasScenesNameTw = scenesColumns.some(c => c.name === 'name_tw');
    const hasScenesDescTw = scenesColumns.some(c => c.name === 'description_tw');

    if (hasScenesNameTw || hasScenesDescTw) {
      // 获取除了 *_tw 之外的所有列
      const scenesKeepCols = scenesColumns
        .filter(c => !c.name.endsWith('_tw'))
        .map(c => c.name);

      db.exec(`
        CREATE TABLE scenes_new AS SELECT ${scenesKeepCols.join(', ')} FROM scenes;
        DROP TABLE scenes;
        ALTER TABLE scenes_new RENAME TO scenes;
      `);
      console.log('  - 已删除 name_tw, description_tw 字段');
    } else {
      console.log('  - 无需处理（字段不存在）');
    }

    // 2. 处理 scene_steps 表
    console.log('处理 scene_steps 表...');
    const stepsColumns = db.pragma('table_info(scene_steps)');
    const hasStepsNameTw = stepsColumns.some(c => c.name === 'step_name_tw');
    const hasStepsTitleTw = stepsColumns.some(c => c.name === 'title_tw');

    if (hasStepsNameTw || hasStepsTitleTw) {
      const stepsKeepCols = stepsColumns
        .filter(c => !c.name.endsWith('_tw'))
        .map(c => c.name);

      db.exec(`
        CREATE TABLE scene_steps_new AS SELECT ${stepsKeepCols.join(', ')} FROM scene_steps;
        DROP TABLE scene_steps;
        ALTER TABLE scene_steps_new RENAME TO scene_steps;
      `);
      console.log('  - 已删除 step_name_tw, title_tw 字段');
    } else {
      console.log('  - 无需处理（字段不存在）');
    }

    // 3. 处理 step_options 表
    console.log('处理 step_options 表...');
    const optionsColumns = db.pragma('table_info(step_options)');
    const hasOptionsNameTw = optionsColumns.some(c => c.name === 'name_tw');
    const hasOptionsLabelTw = optionsColumns.some(c => c.name === 'label_tw');

    if (hasOptionsNameTw || hasOptionsLabelTw) {
      const optionsKeepCols = optionsColumns
        .filter(c => !c.name.endsWith('_tw'))
        .map(c => c.name);

      db.exec(`
        CREATE TABLE step_options_new AS SELECT ${optionsKeepCols.join(', ')} FROM step_options;
        DROP TABLE step_options;
        ALTER TABLE step_options_new RENAME TO step_options;
      `);
      console.log('  - 已删除 name_tw, label_tw 字段');
    } else {
      console.log('  - 无需处理（字段不存在）');
    }

    // 执行 VACUUM 优化数据库
    console.log('');
    console.log('优化数据库...');
    db.exec('VACUUM');

    console.log('');
    console.log('迁移完成！');
    console.log('');
    console.log('如果出现问题，可以从备份恢复:');
    console.log(`  cp "${backupPath}" "${dbPath}"`);

  } catch (error) {
    console.error('迁移失败:', error.message);
    console.log('');
    console.log('正在从备份恢复...');
    fs.copyFileSync(backupPath, dbPath);
    console.log('已恢复到迁移前状态');
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch(console.error);
