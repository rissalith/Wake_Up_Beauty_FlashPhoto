const Database = require('better-sqlite3');
const db = new Database('/app/data/flashphoto.db');
db.pragma('journal_mode = WAL');

// 清空现有数据
db.exec('DELETE FROM scene_steps');
db.exec('DELETE FROM step_options');
db.exec('DELETE FROM prompt_templates');

// 证件照场景(id=1)步骤
db.exec("INSERT INTO scene_steps (scene_id, step_key, step_name, step_type, step_order, is_required, is_visible, component_type) VALUES (1, 'upload', '上传照片', 'upload', 1, 1, 1, 'upload')");
db.exec("INSERT INTO scene_steps (scene_id, step_key, step_name, step_type, step_order, is_required, is_visible, component_type) VALUES (1, 'size', '选择尺寸', 'select', 2, 1, 1, 'select')");
db.exec("INSERT INTO scene_steps (scene_id, step_key, step_name, step_type, step_order, is_required, is_visible, component_type) VALUES (1, 'background', '背景颜色', 'select', 3, 1, 1, 'color')");

// 获取步骤ID
const sizeStep = db.prepare("SELECT id FROM scene_steps WHERE scene_id=1 AND step_key='size'").get();
const bgStep = db.prepare("SELECT id FROM scene_steps WHERE scene_id=1 AND step_key='background'").get();

console.log('Size step ID:', sizeStep.id);
console.log('Background step ID:', bgStep.id);

// 尺寸选项
db.exec(`INSERT INTO step_options (step_id, option_key, name, label, sort_order, is_visible, is_default) VALUES (${sizeStep.id}, '1inch', '一寸', '25x35mm', 1, 1, 1)`);
db.exec(`INSERT INTO step_options (step_id, option_key, name, label, sort_order, is_visible, is_default) VALUES (${sizeStep.id}, '2inch', '二寸', '35x49mm', 2, 1, 0)`);
db.exec(`INSERT INTO step_options (step_id, option_key, name, label, sort_order, is_visible, is_default) VALUES (${sizeStep.id}, 'small2inch', '小二寸', '33x48mm', 3, 1, 0)`);

// 背景色选项
db.exec(`INSERT INTO step_options (step_id, option_key, name, color, sort_order, is_visible, is_default) VALUES (${bgStep.id}, 'white', '白色', '#FFFFFF', 1, 1, 1)`);
db.exec(`INSERT INTO step_options (step_id, option_key, name, color, sort_order, is_visible, is_default) VALUES (${bgStep.id}, 'blue', '蓝色', '#438EDB', 2, 1, 0)`);
db.exec(`INSERT INTO step_options (step_id, option_key, name, color, sort_order, is_visible, is_default) VALUES (${bgStep.id}, 'red', '红色', '#D03D33', 3, 1, 0)`);

// 职业照场景(id=2)步骤
db.exec("INSERT INTO scene_steps (scene_id, step_key, step_name, step_type, step_order, is_required, is_visible, component_type) VALUES (2, 'upload', '上传照片', 'upload', 1, 1, 1, 'upload')");
db.exec("INSERT INTO scene_steps (scene_id, step_key, step_name, step_type, step_order, is_required, is_visible, component_type) VALUES (2, 'style', '选择风格', 'select', 2, 1, 1, 'select')");

const styleStep = db.prepare("SELECT id FROM scene_steps WHERE scene_id=2 AND step_key='style'").get();
console.log('Style step ID:', styleStep.id);

db.exec(`INSERT INTO step_options (step_id, option_key, name, label, sort_order, is_visible, is_default) VALUES (${styleStep.id}, 'business', '商务风', '正式商务', 1, 1, 1)`);
db.exec(`INSERT INTO step_options (step_id, option_key, name, label, sort_order, is_visible, is_default) VALUES (${styleStep.id}, 'casual', '休闲风', '轻松自然', 2, 1, 0)`);

// prompt_templates
db.exec("INSERT INTO prompt_templates (scene_id, name, template_content) VALUES (1, '证件照模板', 'ID photo template')");
db.exec("INSERT INTO prompt_templates (scene_id, name, template_content) VALUES (2, '职业照模板', 'Professional photo template')");

console.log('Steps:', db.prepare('SELECT COUNT(*) as c FROM scene_steps').get().c);
console.log('Options:', db.prepare('SELECT COUNT(*) as c FROM step_options').get().c);
console.log('Templates:', db.prepare('SELECT COUNT(*) as c FROM prompt_templates').get().c);
db.close();
console.log('Done!');
