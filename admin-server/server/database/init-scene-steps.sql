-- 创建 scene_steps 表
CREATE TABLE IF NOT EXISTS scene_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id INTEGER NOT NULL,
  step_key VARCHAR(50) NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  step_name_en VARCHAR(100),
  step_name_tw VARCHAR(100),
  step_type VARCHAR(50) DEFAULT 'select',
  step_order INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT 1,
  is_active BOOLEAN DEFAULT 1,
  config TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  icon VARCHAR(255),
  gender_based BOOLEAN DEFAULT 0,
  title VARCHAR(100),
  title_en VARCHAR(100),
  title_tw VARCHAR(100),
  component_type VARCHAR(50) DEFAULT 'select',
  is_visible BOOLEAN DEFAULT 1
);

-- 创建 step_options 表
CREATE TABLE IF NOT EXISTS step_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  step_id INTEGER NOT NULL,
  option_key VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  name_tw VARCHAR(100),
  option_value VARCHAR(255),
  image_url VARCHAR(255),
  prompt_text TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  label VARCHAR(100),
  label_en VARCHAR(100),
  label_tw VARCHAR(100),
  color VARCHAR(50),
  image VARCHAR(255),
  is_visible BOOLEAN DEFAULT 1,
  is_default BOOLEAN DEFAULT 0,
  gender VARCHAR(20),
  extra_points INTEGER DEFAULT 0,
  metadata TEXT
);

-- 创建 prompt_templates 表
CREATE TABLE IF NOT EXISTS prompt_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  template_content TEXT,
  variables TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 为证件照场景(id=1)添加基本步骤
-- 步骤1: 上传照片
INSERT INTO scene_steps (scene_id, step_key, step_name, step_type, step_order, is_required, is_visible, component_type)
VALUES (1, 'upload', '上传照片', 'upload', 1, 1, 1, 'upload');

-- 步骤2: 选择尺寸
INSERT INTO scene_steps (scene_id, step_key, step_name, step_type, step_order, is_required, is_visible, component_type)
VALUES (1, 'size', '选择尺寸', 'select', 2, 1, 1, 'select');

-- 为尺寸步骤添加选项
INSERT INTO step_options (step_id, option_key, name, label, sort_order, is_visible, is_default)
VALUES 
((SELECT id FROM scene_steps WHERE scene_id=1 AND step_key='size'), '1inch', '一寸', '25x35mm', 1, 1, 1),
((SELECT id FROM scene_steps WHERE scene_id=1 AND step_key='size'), '2inch', '二寸', '35x49mm', 2, 1, 0),
((SELECT id FROM scene_steps WHERE scene_id=1 AND step_key='size'), 'small2inch', '小二寸', '33x48mm', 3, 1, 0);

-- 步骤3: 选择背景色
INSERT INTO scene_steps (scene_id, step_key, step_name, step_type, step_order, is_required, is_visible, component_type)
VALUES (1, 'background', '背景颜色', 'select', 3, 1, 1, 'color');

-- 为背景色步骤添加选项
INSERT INTO step_options (step_id, option_key, name, color, sort_order, is_visible, is_default)
VALUES 
((SELECT id FROM scene_steps WHERE scene_id=1 AND step_key='background'), 'white', '白色', '#FFFFFF', 1, 1, 1),
((SELECT id FROM scene_steps WHERE scene_id=1 AND step_key='background'), 'blue', '蓝色', '#438EDB', 2, 1, 0),
((SELECT id FROM scene_steps WHERE scene_id=1 AND step_key='background'), 'red', '红色', '#D03D33', 3, 1, 0);

-- 为职业照场景(id=2)添加基本步骤
INSERT INTO scene_steps (scene_id, step_key, step_name, step_type, step_order, is_required, is_visible, component_type)
VALUES (2, 'upload', '上传照片', 'upload', 1, 1, 1, 'upload');

INSERT INTO scene_steps (scene_id, step_key, step_name, step_type, step_order, is_required, is_visible, component_type)
VALUES (2, 'style', '选择风格', 'select', 2, 1, 1, 'select');

INSERT INTO step_options (step_id, option_key, name, label, sort_order, is_visible, is_default)
VALUES 
((SELECT id FROM scene_steps WHERE scene_id=2 AND step_key='style'), 'business', '商务风', '正式商务', 1, 1, 1),
((SELECT id FROM scene_steps WHERE scene_id=2 AND step_key='style'), 'casual', '休闲风', '轻松自然', 2, 1, 0);
