-- 清空现有场景数据
DELETE FROM scenes;

-- 插入6个新场景：证件照、职业照、写真照、全家福、宠物写真、婚纱照
INSERT INTO scenes (scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
('idphoto', '证件照', '标准证件照片', 'https://flashphoto-1257018577.cos.ap-guangzhou.myqcloud.com/assets/icons/idphoto.png', 'active', 50, 1, datetime('now'), datetime('now'));

INSERT INTO scenes (scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
('professional', '职业照', '商务职业形象照', 'https://flashphoto-1257018577.cos.ap-guangzhou.myqcloud.com/assets/icons/professional.png', 'active', 50, 2, datetime('now'), datetime('now'));

INSERT INTO scenes (scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
('portrait', '写真照', '个人艺术写真', 'https://flashphoto-1257018577.cos.ap-guangzhou.myqcloud.com/assets/icons/portrait.png', 'coming_soon', 50, 3, datetime('now'), datetime('now'));

INSERT INTO scenes (scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
('family', '全家福', '温馨家庭合照', 'https://flashphoto-1257018577.cos.ap-guangzhou.myqcloud.com/assets/icons/family.png', 'coming_soon', 50, 4, datetime('now'), datetime('now'));

INSERT INTO scenes (scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
('pet', '宠物写真', '萌宠艺术照片', 'https://flashphoto-1257018577.cos.ap-guangzhou.myqcloud.com/assets/icons/pet.png', 'coming_soon', 50, 5, datetime('now'), datetime('now'));

INSERT INTO scenes (scene_key, name, description, icon, status, price, sort_order, created_at, updated_at) VALUES
('wedding', '婚纱照', '浪漫婚纱摄影', 'https://flashphoto-1257018577.cos.ap-guangzhou.myqcloud.com/assets/icons/wedding.png', 'coming_soon', 50, 6, datetime('now'), datetime('now'));
