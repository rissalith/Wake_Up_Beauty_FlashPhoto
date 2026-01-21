-- 清空并重新插入场景，确保 ID 为 1-6
DELETE FROM scenes;

-- 使用明确的 ID 插入
INSERT INTO scenes (id, scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
(1, 'idphoto', '证件照', '标准证件照片', '', 'active', 50, 1, datetime('now'), datetime('now'));

INSERT INTO scenes (id, scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
(2, 'professional', '职业照', '商务职业形象照', '', 'active', 50, 2, datetime('now'), datetime('now'));

INSERT INTO scenes (id, scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
(3, 'portrait', '写真照', '个人艺术写真', '', 'coming_soon', 50, 3, datetime('now'), datetime('now'));

INSERT INTO scenes (id, scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
(4, 'family', '全家福', '温馨家庭合照', '', 'coming_soon', 50, 4, datetime('now'), datetime('now'));

INSERT INTO scenes (id, scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
(5, 'pet', '宠物写真', '萌宠艺术照片', '', 'coming_soon', 50, 5, datetime('now'), datetime('now'));

INSERT INTO scenes (id, scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
(6, 'wedding', '婚纱照', '浪漫婚纱摄影', '', 'coming_soon', 50, 6, datetime('now'), datetime('now'));
