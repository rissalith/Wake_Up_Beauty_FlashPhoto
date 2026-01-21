/**
 * 中台化改造 - 数据库初始化脚本
 * 运行: node scripts/init-midplatform.js
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/www/wwwroot/pop-pub.com/miniprogram-server/data/flashphoto_prod.db';

async function initMidplatform() {
  console.log('=== 醒美闪图 中台化改造 - 数据库初始化 ===\n');
  console.log('数据库路径:', DB_PATH);

  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(DB_PATH)) {
    console.log('加载现有数据库...');
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    console.log('创建新数据库...');
    db = new SQL.Database();
  }

  // ============================================
  // 一、场景引擎管理
  // ============================================
  console.log('\n[1/8] 创建场景主表 scenes...');
  db.run(`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_en TEXT,
      name_tw TEXT,
      description TEXT,
      description_en TEXT,
      description_tw TEXT,
      icon TEXT,
      cover_image TEXT,
      sort_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      is_review_safe INTEGER DEFAULT 1,
      points_cost INTEGER DEFAULT 50,
      page_path TEXT,
      use_dynamic_render INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('[2/8] 创建场景步骤表 scene_steps...');
  db.run(`
    CREATE TABLE IF NOT EXISTS scene_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      step_key TEXT NOT NULL,
      title TEXT NOT NULL,
      title_en TEXT,
      title_tw TEXT,
      subtitle TEXT,
      component_type TEXT NOT NULL,
      is_required INTEGER DEFAULT 1,
      is_visible INTEGER DEFAULT 1,
      config TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scene_id) REFERENCES scenes(id)
    )
  `);

  console.log('[3/8] 创建步骤选项表 step_options...');
  db.run(`
    CREATE TABLE IF NOT EXISTS step_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_id INTEGER NOT NULL,
      option_key TEXT NOT NULL,
      label TEXT NOT NULL,
      label_en TEXT,
      label_tw TEXT,
      icon TEXT,
      image TEXT,
      color TEXT,
      prompt_text TEXT,
      extra_points INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      is_visible INTEGER DEFAULT 1,
      gender TEXT,
      metadata TEXT,
      FOREIGN KEY (step_id) REFERENCES scene_steps(id)
    )
  `);

  // ============================================
  // 二、Prompt模板引擎
  // ============================================
  console.log('[4/8] 创建Prompt模板表 prompt_templates...');
  db.run(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id TEXT NOT NULL,
      name TEXT NOT NULL,
      template TEXT NOT NULL,
      negative_prompt TEXT,
      version INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scene_id) REFERENCES scenes(id)
    )
  `);

  // ============================================
  // 三、素材库管理
  // ============================================
  console.log('[5/8] 创建素材分类表 asset_categories...');
  db.run(`
    CREATE TABLE IF NOT EXISTS asset_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id TEXT,
      category_key TEXT NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      name_tw TEXT,
      sort_order INTEGER DEFAULT 0
    )
  `);

  console.log('[6/8] 创建素材资源表 assets...');
  db.run(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      asset_key TEXT NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      name_tw TEXT,
      file_url TEXT NOT NULL,
      thumbnail_url TEXT,
      prompt_text TEXT,
      gender TEXT,
      tags TEXT,
      sort_order INTEGER DEFAULT 0,
      is_visible INTEGER DEFAULT 1,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES asset_categories(id)
    )
  `);

  // ============================================
  // 四、系统配置表
  // ============================================
  console.log('[7/8] 创建系统配置表 system_config...');
  db.run(`
    CREATE TABLE IF NOT EXISTS system_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT NOT NULL,
      config_type TEXT DEFAULT 'string',
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // 五、规格配置表
  // ============================================
  console.log('[8/8] 创建规格配置表 photo_specs...');
  db.run(`
    CREATE TABLE IF NOT EXISTS photo_specs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id TEXT NOT NULL,
      spec_key TEXT NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      name_tw TEXT,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      physical_width REAL,
      physical_height REAL,
      ratio REAL,
      sort_order INTEGER DEFAULT 0,
      is_visible INTEGER DEFAULT 1,
      FOREIGN KEY (scene_id) REFERENCES scenes(id)
    )
  `);

  // ============================================
  // 六、创建索引
  // ============================================
  console.log('\n创建索引...');
  db.run('CREATE INDEX IF NOT EXISTS idx_scenes_status ON scenes(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_scenes_review_safe ON scenes(is_review_safe)');
  db.run('CREATE INDEX IF NOT EXISTS idx_scene_steps_scene ON scene_steps(scene_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_step_options_step ON step_options(step_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category_id)');

  // ============================================
  // 七、插入初始数据 - 系统配置
  // ============================================
  console.log('\n插入系统配置...');
  const systemConfigs = [
    ['review_mode', 'false', 'boolean', '审核模式开关：true时只显示安全场景'],
    ['maintenance_mode', 'false', 'boolean', '维护模式：true时显示维护页面'],
    ['min_app_version', '1.0.0', 'string', '最低支持的小程序版本'],
    ['announcement', '', 'string', '全局公告内容'],
    ['announcement_visible', 'false', 'boolean', '公告是否显示'],
    ['default_points_cost', '50', 'number', '默认场景消耗醒币'],
    ['config_version', '1', 'number', '配置版本号，用于客户端缓存刷新']
  ];

  for (const [key, value, type, desc] of systemConfigs) {
    db.run(`INSERT OR REPLACE INTO system_config (config_key, config_value, config_type, description) VALUES (?, ?, ?, ?)`,
      [key, value, type, desc]);
  }

  // ============================================
  // 八、插入初始数据 - 场景配置
  // ============================================
  console.log('插入场景配置...');
  const scenes = [
    ['idphoto', '证件照', 'ID Photo', '證件照', 'AI智能证件照，一键生成标准证件照', 'AI ID photo generation', 'AI智能證件照', 'idphoto', 1, 'active', 1, 50, '/pages/flashphoto/flashphoto', 1],
    ['professional', '职业照', 'Professional', '職業照', '职场形象照，展现专业风采', 'Professional headshot', '職場形象照', 'professional', 2, 'active', 1, 100, '/pages/professional-photo/professional-photo', 0],
    ['portrait', '写真照', 'Portrait', '寫真照', '艺术写真，记录美好瞬间', 'Art portrait photography', '藝術寫真', 'portrait', 3, 'coming_soon', 0, 150, null, 1],
    ['family', '全家福', 'Family', '全家福', '温馨全家福，记录幸福时刻', 'Family portrait', '溫馨全家福', 'family', 4, 'coming_soon', 0, 200, null, 1],
    ['pet', '宠物写真', 'Pet Photo', '寵物寫真', '萌宠写真，记录可爱瞬间', 'Pet photography', '萌寵寫真', 'pet', 5, 'coming_soon', 1, 100, null, 1],
    ['wedding', '婚纱照', 'Wedding', '婚紗照', '浪漫婚纱，定格永恒', 'Wedding photography', '浪漫婚紗', 'wedding', 6, 'coming_soon', 0, 300, null, 1]
  ];

  for (const s of scenes) {
    db.run(`INSERT OR REPLACE INTO scenes (id, name, name_en, name_tw, description, description_en, description_tw, icon, sort_order, status, is_review_safe, points_cost, page_path, use_dynamic_render)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, s);
  }

  // ============================================
  // 九、插入初始数据 - 证件照步骤配置
  // ============================================
  console.log('插入证件照步骤配置...');
  const idphotoSteps = [
    ['idphoto', 1, 'upload', '上传照片', 'Upload Photo', '上傳照片', '请上传1-3张正面清晰照片', 'image_upload', 1, 1, '{"maxCount":3,"tips":"请上传正面清晰照片，五官完整可见"}'],
    ['idphoto', 2, 'gender', '选择性别', 'Gender', '選擇性別', null, 'radio', 1, 1, '{"layout":"horizontal"}'],
    ['idphoto', 3, 'spec', '选择规格', 'Size', '選擇規格', null, 'tags', 1, 1, '{"layout":"grid","columns":2}'],
    ['idphoto', 4, 'background', '选择背景', 'Background', '選擇背景', null, 'color_picker', 1, 1, '{"showPreview":true}'],
    ['idphoto', 5, 'beauty', '美颜级别', 'Beauty', '美顏級別', null, 'radio', 0, 1, '{"layout":"horizontal"}'],
    ['idphoto', 6, 'dress', '选择穿着', 'Outfit', '選擇穿著', null, 'image_tags', 0, 1, '{"dependsOn":"gender","columns":3}'],
    ['idphoto', 7, 'hair', '选择发型', 'Hairstyle', '選擇髮型', null, 'image_tags', 0, 1, '{"dependsOn":"gender","columns":4}'],
    ['idphoto', 8, 'expression', '选择表情', 'Expression', '選擇表情', null, 'image_tags', 0, 1, '{"dependsOn":"gender","columns":3}']
  ];

  for (const step of idphotoSteps) {
    db.run(`INSERT OR IGNORE INTO scene_steps (scene_id, step_order, step_key, title, title_en, title_tw, subtitle, component_type, is_required, is_visible, config)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, step);
  }

  // 获取步骤ID用于插入选项
  const getStepId = (sceneId, stepKey) => {
    const result = db.exec(`SELECT id FROM scene_steps WHERE scene_id = '${sceneId}' AND step_key = '${stepKey}'`);
    return result[0]?.values[0]?.[0];
  };

  // ============================================
  // 十、插入初始数据 - 步骤选项
  // ============================================
  console.log('插入步骤选项...');

  // 性别选项
  const genderStepId = getStepId('idphoto', 'gender');
  if (genderStepId) {
    db.run(`INSERT OR IGNORE INTO step_options (step_id, option_key, label, label_en, label_tw, icon, prompt_text, sort_order, is_default) VALUES (?, 'male', '男', 'Male', '男', 'male', '男性', 1, 1)`, [genderStepId]);
    db.run(`INSERT OR IGNORE INTO step_options (step_id, option_key, label, label_en, label_tw, icon, prompt_text, sort_order, is_default) VALUES (?, 'female', '女', 'Female', '女', 'female', '女性', 2, 0)`, [genderStepId]);
  }

  // 规格选项
  const specStepId = getStepId('idphoto', 'spec');
  if (specStepId) {
    const specs = [
      ['1inch', '一寸', 'One Inch', '一寸', '一寸（25×35mm）', 1, 1],
      ['2inch', '二寸', 'Two Inch', '二寸', '二寸（35×49mm）', 2, 0],
      ['small1inch', '小一寸', 'Small One', '小一寸', '小一寸（22×32mm）', 3, 0],
      ['big1inch', '大一寸', 'Big One', '大一寸', '大一寸（33×48mm）', 4, 0]
    ];
    for (const [key, label, en, tw, prompt, order, def] of specs) {
      db.run(`INSERT OR IGNORE INTO step_options (step_id, option_key, label, label_en, label_tw, prompt_text, sort_order, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [specStepId, key, label, en, tw, prompt, order, def]);
    }
  }

  // 背景颜色选项
  const bgStepId = getStepId('idphoto', 'background');
  if (bgStepId) {
    const backgrounds = [
      ['white', '白色', 'White', '白色', '#FFFFFF', '纯白色背景', 1, 1],
      ['blue', '蓝色', 'Blue', '藍色', '#0066CC', '标准蓝色背景', 2, 0],
      ['darkblue', '深蓝', 'Dark Blue', '深藍', '#003366', '深蓝色背景', 3, 0],
      ['red', '红色', 'Red', '紅色', '#CC0000', '红色背景', 4, 0],
      ['gray', '灰色', 'Gray', '灰色', '#888888', '高级灰色背景', 5, 0],
      ['gradient', '渐变蓝', 'Gradient', '漸變藍', 'linear-gradient(180deg, #4A90D9 0%, #1E5AA8 100%)', '渐变蓝色背景，从上到下由浅蓝渐变至深蓝', 6, 0]
    ];
    for (const [key, label, en, tw, color, prompt, order, def] of backgrounds) {
      db.run(`INSERT OR IGNORE INTO step_options (step_id, option_key, label, label_en, label_tw, color, prompt_text, sort_order, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [bgStepId, key, label, en, tw, color, prompt, order, def]);
    }
  }

  // 美颜选项
  const beautyStepId = getStepId('idphoto', 'beauty');
  if (beautyStepId) {
    const beautyLevels = [
      ['none', '原图', 'Original', '原圖', '保持原貌，不做任何美化处理', 1, 1],
      ['natural', '自然', 'Natural', '自然', '自然美化：轻微磨皮、祛痘、均匀肤色，保持自然真实感', 2, 0],
      ['enhanced', '精致', 'Enhanced', '精緻', '精致修图：适度瘦脸、大眼、提亮肤色，打造精致妆感', 3, 0]
    ];
    for (const [key, label, en, tw, prompt, order, def] of beautyLevels) {
      db.run(`INSERT OR IGNORE INTO step_options (step_id, option_key, label, label_en, label_tw, prompt_text, sort_order, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [beautyStepId, key, label, en, tw, prompt, order, def]);
    }
  }

  // ============================================
  // 十一、插入Prompt模板
  // ============================================
  console.log('插入Prompt模板...');
  const promptTemplate = `基于参考图生成专业{{spec}}证件照。【核心要求】必须严格保持参考图中人物的面部特征一致性，包括五官轮廓、脸型、眼睛形状、鼻子、嘴巴、肤色等，确保生成结果与本人高度相似。纵向竖版构图（高度大于宽度，宽高比约3:4），{{background}}，{{dress}}，{{hair}}，{{expression}}，{{beauty}}。正面免冠，光线均匀，人物居中，采用标准证件照构图：头顶到画面顶端留有约8%-10%空间，头部（从下巴到头顶）占画面高度约55%-60%，肩部需完整露出至胸口上方位置。【重要】必须保持人物主体完整，肩膀两侧不能被画面边缘裁切。`;

  db.run(`INSERT OR REPLACE INTO prompt_templates (scene_id, name, template, negative_prompt, version, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
    ['idphoto', '标准证件照模板', promptTemplate, '模糊, 变形, 多人, 裁切不完整, 侧脸, 闭眼, 歪头, 手臂, 手', 1, 1]);

  // ============================================
  // 十二、插入规格配置
  // ============================================
  console.log('插入规格配置...');
  const photoSpecs = [
    ['idphoto', '1inch', '一寸', 'One Inch', '一寸', 295, 413, 25, 35, 1.4, 1, 1],
    ['idphoto', '2inch', '二寸', 'Two Inch', '二寸', 413, 579, 35, 49, 1.4, 2, 1],
    ['idphoto', 'small1inch', '小一寸', 'Small One Inch', '小一寸', 260, 378, 22, 32, 1.45, 3, 1],
    ['idphoto', 'big1inch', '大一寸', 'Big One Inch', '大一寸', 390, 567, 33, 48, 1.45, 4, 1]
  ];
  for (const spec of photoSpecs) {
    db.run(`INSERT OR IGNORE INTO photo_specs (scene_id, spec_key, name, name_en, name_tw, width, height, physical_width, physical_height, ratio, sort_order, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, spec);
  }

  // ============================================
  // 保存数据库
  // ============================================
  console.log('\n保存数据库...');
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));

  // 验证
  console.log('\n=== 验证数据 ===');
  const sceneCount = db.exec('SELECT COUNT(*) FROM scenes')[0].values[0][0];
  const stepCount = db.exec('SELECT COUNT(*) FROM scene_steps')[0].values[0][0];
  const optionCount = db.exec('SELECT COUNT(*) FROM step_options')[0].values[0][0];
  const configCount = db.exec('SELECT COUNT(*) FROM system_config')[0].values[0][0];

  console.log(`场景数量: ${sceneCount}`);
  console.log(`步骤数量: ${stepCount}`);
  console.log(`选项数量: ${optionCount}`);
  console.log(`系统配置: ${configCount}`);

  db.close();
  console.log('\n✅ 中台化数据库初始化完成！');
}

initMidplatform().catch(err => {
  console.error('初始化失败:', err);
  process.exit(1);
});
