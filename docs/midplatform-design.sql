-- ============================================
-- 醒美闪图 中台化改造 - 数据库设计
-- ============================================

-- ============================================
-- 一、场景引擎管理
-- ============================================

-- 1.1 场景主表
CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,                    -- 场景ID: idphoto, professional, portrait
  name TEXT NOT NULL,                     -- 场景名称
  name_en TEXT,                           -- 英文名称
  name_tw TEXT,                           -- 繁体名称
  description TEXT,                       -- 场景描述
  description_en TEXT,
  description_tw TEXT,
  icon TEXT,                              -- 图标URL
  cover_image TEXT,                       -- 封面图URL
  sort_order INTEGER DEFAULT 0,           -- 排序权重
  status TEXT DEFAULT 'active',           -- active/inactive/coming_soon
  is_review_safe INTEGER DEFAULT 1,       -- 审核安全模式下是否显示 (1=显示)
  points_cost INTEGER DEFAULT 50,         -- 基础消耗醒币数
  page_path TEXT,                         -- 小程序页面路径 (兼容旧模式)
  use_dynamic_render INTEGER DEFAULT 0,   -- 是否使用动态渲染 (1=动态)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 1.2 场景步骤定义表 (动态UI流程)
CREATE TABLE IF NOT EXISTS scene_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id TEXT NOT NULL,                 -- 关联场景
  step_order INTEGER NOT NULL,            -- 步骤顺序 1,2,3...
  step_key TEXT NOT NULL,                 -- 步骤标识: upload, gender, spec, background, style
  title TEXT NOT NULL,                    -- 步骤标题
  title_en TEXT,
  title_tw TEXT,
  subtitle TEXT,                          -- 步骤副标题
  component_type TEXT NOT NULL,           -- 组件类型: image_upload, radio, tags, slider, color_picker
  is_required INTEGER DEFAULT 1,          -- 是否必填
  is_visible INTEGER DEFAULT 1,           -- 是否显示
  config JSON,                            -- 组件配置JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scene_id) REFERENCES scenes(id)
);

-- 1.3 步骤选项表 (单选/多选/标签的选项)
CREATE TABLE IF NOT EXISTS step_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  step_id INTEGER NOT NULL,               -- 关联步骤
  option_key TEXT NOT NULL,               -- 选项标识: male, female, white, blue
  label TEXT NOT NULL,                    -- 显示文本
  label_en TEXT,
  label_tw TEXT,
  icon TEXT,                              -- 图标URL
  image TEXT,                             -- 选项图片URL (用于图片选择器)
  prompt_text TEXT,                       -- 对应的Prompt片段
  extra_points INTEGER DEFAULT 0,         -- 额外消耗醒币
  sort_order INTEGER DEFAULT 0,
  is_default INTEGER DEFAULT 0,           -- 是否默认选中
  is_visible INTEGER DEFAULT 1,
  metadata JSON,                          -- 扩展数据
  FOREIGN KEY (step_id) REFERENCES scene_steps(id)
);

-- ============================================
-- 二、Prompt模板引擎
-- ============================================

-- 2.1 Prompt模板主表
CREATE TABLE IF NOT EXISTS prompt_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id TEXT NOT NULL,                 -- 关联场景
  name TEXT NOT NULL,                     -- 模板名称
  template TEXT NOT NULL,                 -- Prompt模板，支持变量 {{gender}}, {{background}}, {{style}}
  negative_prompt TEXT,                   -- 负面提示词
  version INTEGER DEFAULT 1,              -- 版本号
  is_active INTEGER DEFAULT 1,            -- 是否启用
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scene_id) REFERENCES scenes(id)
);

-- 2.2 Prompt变量映射表
CREATE TABLE IF NOT EXISTS prompt_variables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,           -- 关联模板
  variable_name TEXT NOT NULL,            -- 变量名: background, beauty_level
  option_key TEXT NOT NULL,               -- 选项值: white, blue, natural
  prompt_value TEXT NOT NULL,             -- 对应Prompt文本: "纯白色背景"
  FOREIGN KEY (template_id) REFERENCES prompt_templates(id)
);

-- ============================================
-- 三、素材库管理
-- ============================================

-- 3.1 素材分类表
CREATE TABLE IF NOT EXISTS asset_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id TEXT,                          -- 关联场景 (NULL=通用)
  category_key TEXT NOT NULL,             -- 分类标识: dress, hair, expression, background
  name TEXT NOT NULL,
  name_en TEXT,
  name_tw TEXT,
  sort_order INTEGER DEFAULT 0
);

-- 3.2 素材资源表
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  asset_key TEXT NOT NULL,                -- 素材标识
  name TEXT NOT NULL,                     -- 素材名称
  name_en TEXT,
  name_tw TEXT,
  file_url TEXT NOT NULL,                 -- 文件URL
  thumbnail_url TEXT,                     -- 缩略图URL
  prompt_text TEXT,                       -- 关联Prompt文本
  gender TEXT,                            -- male/female/all
  tags TEXT,                              -- 标签，逗号分隔
  sort_order INTEGER DEFAULT 0,
  is_visible INTEGER DEFAULT 1,
  metadata JSON,                          -- 扩展元数据
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES asset_categories(id)
);

-- ============================================
-- 四、运营与财务控制
-- ============================================

-- 4.1 定价策略表
CREATE TABLE IF NOT EXISTS pricing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id TEXT,                          -- 关联场景 (NULL=全局)
  rule_name TEXT NOT NULL,                -- 规则名称
  rule_type TEXT NOT NULL,                -- base/discount/vip/promotion
  base_points INTEGER,                    -- 基础消耗
  discount_percent INTEGER,               -- 折扣百分比
  vip_level INTEGER,                      -- VIP等级要求
  start_time DATETIME,                    -- 生效开始时间
  end_time DATETIME,                      -- 生效结束时间
  is_active INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,             -- 优先级，高优先
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4.2 充值套餐表 (已有，增强)
CREATE TABLE IF NOT EXISTS recharge_packages_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                     -- 套餐名称
  amount REAL NOT NULL,                   -- 金额(元)
  points INTEGER NOT NULL,                -- 基础醒币
  bonus_points INTEGER DEFAULT 0,         -- 赠送醒币
  badge TEXT,                             -- 角标: 热销/超值/限时
  is_recommended INTEGER DEFAULT 0,       -- 是否推荐
  sort_order INTEGER DEFAULT 0,
  is_visible INTEGER DEFAULT 1,
  start_time DATETIME,                    -- 活动开始
  end_time DATETIME,                      -- 活动结束
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4.3 系统配置表 (全局开关)
CREATE TABLE IF NOT EXISTS system_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_key TEXT UNIQUE NOT NULL,        -- 配置键
  config_value TEXT NOT NULL,             -- 配置值
  config_type TEXT DEFAULT 'string',      -- string/number/boolean/json
  description TEXT,                       -- 配置说明
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 插入关键全局配置
INSERT OR REPLACE INTO system_config (config_key, config_value, config_type, description) VALUES
('review_mode', 'false', 'boolean', '审核模式开关：true时只显示安全场景'),
('maintenance_mode', 'false', 'boolean', '维护模式：true时显示维护页面'),
('min_app_version', '1.0.0', 'string', '最低支持的小程序版本'),
('announcement', '', 'string', '全局公告内容'),
('announcement_visible', 'false', 'boolean', '公告是否显示'),
('default_points_cost', '50', 'number', '默认场景消耗醒币'),
('config_version', '1', 'number', '配置版本号，用于客户端缓存刷新');

-- ============================================
-- 五、规格配置表
-- ============================================

CREATE TABLE IF NOT EXISTS photo_specs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id TEXT NOT NULL,                 -- 关联场景
  spec_key TEXT NOT NULL,                 -- 规格标识: 1inch, 2inch
  name TEXT NOT NULL,                     -- 规格名称: 一寸
  name_en TEXT,
  name_tw TEXT,
  width INTEGER NOT NULL,                 -- 宽度(px)
  height INTEGER NOT NULL,                -- 高度(px)
  physical_width REAL,                    -- 物理宽度(mm)
  physical_height REAL,                   -- 物理高度(mm)
  ratio REAL,                             -- 宽高比
  sort_order INTEGER DEFAULT 0,
  is_visible INTEGER DEFAULT 1,
  FOREIGN KEY (scene_id) REFERENCES scenes(id)
);

-- ============================================
-- 六、职业配置表 (针对职业照场景)
-- ============================================

-- 6.1 行业分类
CREATE TABLE IF NOT EXISTS profession_industries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  industry_key TEXT NOT NULL,             -- 行业标识: tech, finance
  name TEXT NOT NULL,
  name_en TEXT,
  name_tw TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_visible INTEGER DEFAULT 1
);

-- 6.2 职业列表
CREATE TABLE IF NOT EXISTS professions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  industry_id INTEGER NOT NULL,
  profession_key TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  name_tw TEXT,
  prompt_text TEXT,                       -- 职业相关Prompt
  sort_order INTEGER DEFAULT 0,
  is_visible INTEGER DEFAULT 1,
  FOREIGN KEY (industry_id) REFERENCES profession_industries(id)
);

-- ============================================
-- 七、索引优化
-- ============================================

CREATE INDEX IF NOT EXISTS idx_scenes_status ON scenes(status);
CREATE INDEX IF NOT EXISTS idx_scenes_review_safe ON scenes(is_review_safe);
CREATE INDEX IF NOT EXISTS idx_scene_steps_scene ON scene_steps(scene_id);
CREATE INDEX IF NOT EXISTS idx_step_options_step ON step_options(step_id);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category_id);
CREATE INDEX IF NOT EXISTS idx_pricing_scene ON pricing_rules(scene_id);

-- ============================================
-- 八、初始数据 - 证件照场景
-- ============================================

-- 插入证件照场景
INSERT OR REPLACE INTO scenes (id, name, name_en, name_tw, description, icon, status, is_review_safe, points_cost, page_path, use_dynamic_render) VALUES
('idphoto', '证件照', 'ID Photo', '證件照', 'AI智能证件照，一键生成标准证件照', '/images/id-photo.png', 'active', 1, 50, '/pages/flashphoto/flashphoto', 1),
('professional', '职业照', 'Professional Photo', '職業照', '职场形象照，展现专业风采', '/images/professional.png', 'active', 1, 100, '/pages/professional-photo/professional-photo', 1),
('portrait', '写真照', 'Portrait', '寫真照', '艺术写真，记录美好瞬间', '/images/portrait.png', 'coming_soon', 0, 150, NULL, 1),
('family', '全家福', 'Family Photo', '全家福', '温馨全家福，记录幸福时刻', '/images/family.png', 'coming_soon', 0, 200, NULL, 1),
('pet', '宠物写真', 'Pet Photo', '寵物寫真', '萌宠写真，记录可爱瞬间', '/images/pet.png', 'coming_soon', 0, 100, NULL, 1),
('wedding', '婚纱照', 'Wedding Photo', '婚紗照', '浪漫婚纱，定格永恒', '/images/wedding.png', 'coming_soon', 0, 300, NULL, 1);

-- 证件照步骤配置
INSERT OR REPLACE INTO scene_steps (scene_id, step_order, step_key, title, title_en, component_type, is_required, config) VALUES
('idphoto', 1, 'upload', '上传照片', 'Upload Photo', 'image_upload', 1, '{"maxCount": 3, "tips": "请上传正面清晰照片"}'),
('idphoto', 2, 'gender', '选择性别', 'Select Gender', 'radio', 1, '{"layout": "horizontal"}'),
('idphoto', 3, 'spec', '选择规格', 'Select Size', 'tags', 1, '{"layout": "grid", "columns": 2}'),
('idphoto', 4, 'background', '选择背景', 'Select Background', 'color_picker', 1, '{"showPreview": true}'),
('idphoto', 5, 'dress', '选择穿着', 'Select Outfit', 'image_tags', 0, '{"dependsOn": "gender"}'),
('idphoto', 6, 'hair', '选择发型', 'Select Hairstyle', 'image_tags', 0, '{"dependsOn": "gender"}'),
('idphoto', 7, 'expression', '选择表情', 'Select Expression', 'image_tags', 0, '{"dependsOn": "gender"}'),
('idphoto', 8, 'beauty', '美颜级别', 'Beauty Level', 'radio', 0, '{"layout": "horizontal"}');

-- 证件照Prompt模板
INSERT OR REPLACE INTO prompt_templates (scene_id, name, template, negative_prompt, is_active) VALUES
('idphoto', '标准证件照模板',
'基于参考图生成专业{{spec}}证件照。【核心要求】必须严格保持参考图中人物的面部特征一致性，包括五官轮廓、脸型、眼睛形状、鼻子、嘴巴、肤色等，确保生成结果与本人高度相似。纵向竖版构图（高度大于宽度，宽高比约3:4），{{background}}，{{dress}}，{{hair}}，{{expression}}，{{beauty}}。正面免冠，光线均匀，人物居中，采用标准证件照构图：头顶到画面顶端留有约8%-10%空间，头部（从下巴到头顶）占画面高度约55%-60%，肩部需完整露出至胸口上方位置。【重要】必须保持人物主体完整，肩膀两侧不能被画面边缘裁切。',
'模糊, 变形, 多人, 裁切不完整, 侧脸, 闭眼',
1);
