-- 创建 scenes 表
CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_key VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  description TEXT,
  description_en TEXT,
  icon VARCHAR(255),
  cover_image VARCHAR(255),
  price INTEGER DEFAULT 0,
  is_free BOOLEAN DEFAULT 0,
  status VARCHAR(20) DEFAULT 'offline',
  is_review_safe BOOLEAN DEFAULT 0,
  page_path VARCHAR(255),
  use_dynamic_render BOOLEAN DEFAULT 0,
  coming_soon_text VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  points_cost INTEGER DEFAULT 0,
  category VARCHAR(50),
  tags TEXT,
  is_active INTEGER DEFAULT 1
);

-- 清空现有数据
DELETE FROM scenes;

-- 插入6个场景
INSERT INTO scenes (scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
('idphoto', '证件照', '标准证件照片', '', 'active', 50, 1, datetime('now'), datetime('now'));

INSERT INTO scenes (scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
('professional', '职业照', '商务职业形象照', '', 'active', 50, 2, datetime('now'), datetime('now'));

INSERT INTO scenes (scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
('portrait', '写真照', '个人艺术写真', '', 'coming_soon', 50, 3, datetime('now'), datetime('now'));

INSERT INTO scenes (scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
('family', '全家福', '温馨家庭合照', '', 'coming_soon', 50, 4, datetime('now'), datetime('now'));

INSERT INTO scenes (scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
('pet', '宠物写真', '萌宠艺术照片', '', 'coming_soon', 50, 5, datetime('now'), datetime('now'));

INSERT INTO scenes (scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
('wedding', '婚纱照', '浪漫婚纱摄影', '', 'coming_soon', 50, 6, datetime('now'), datetime('now'));
