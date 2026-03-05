/**
 * 简化配置管理脚本 - 硬编码关键配置
 * 用于垂直化改造：删除复杂的系统配置表，使用硬编码配置
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../core-api/data/flashphoto.db');
const db = new Database(dbPath);

console.log('开始简化配置管理...');

// 保留的关键配置项
const essentialConfigs = {
  'review_mode': { value: 'false', type: 'boolean', desc: '审核模式开关' },
  'maintenance_mode': { value: 'false', type: 'boolean', desc: '维护模式' },
  'min_app_version': { value: '1.0.0', type: 'string', desc: '最低支持版本' },
  'announcement': { value: '', type: 'string', desc: '全局公告' },
  'announcement_visible': { value: 'false', type: 'boolean', desc: '公告是否显示' },
  'default_points_cost': { value: '50', type: 'number', desc: '默认消耗醒币' },
  'config_version': { value: '1', type: 'number', desc: '配置版本号' }
};

try {
  // 删除所有非必要的配置项
  const allConfigs = db.prepare('SELECT config_key FROM system_config').all();
  let deletedCount = 0;

  for (const config of allConfigs) {
    if (!essentialConfigs[config.config_key]) {
      db.prepare('DELETE FROM system_config WHERE config_key = ?').run(config.config_key);
      console.log(`✓ 删除配置: ${config.config_key}`);
      deletedCount++;
    }
  }

  // 确保关键配置存在
  for (const [key, config] of Object.entries(essentialConfigs)) {
    db.prepare(`
      INSERT OR REPLACE INTO system_config (config_key, config_value, config_type, description, is_public)
      VALUES (?, ?, ?, ?, 1)
    `).run(key, config.value, config.type, config.desc);
  }

  console.log(`✓ 保留关键配置: ${Object.keys(essentialConfigs).length} 项`);
  console.log(`✓ 删除非必要配置: ${deletedCount} 项`);

} catch (error) {
  console.error(`✗ 简化配置失败: ${error.message}`);
}

db.close();

console.log('\n简化完成！');
console.log('\n关键配置项:');
Object.entries(essentialConfigs).forEach(([key, config]) => {
  console.log(`  - ${key}: ${config.desc}`);
});
