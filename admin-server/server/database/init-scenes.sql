-- 初始化场景数据
INSERT OR REPLACE INTO scenes (scene_key, name, name_en, name_tw, description, icon, status, is_review_safe, price, page_path, use_dynamic_render, sort_order) VALUES
('idphoto', '证件照', 'ID Photo', '證件照', 'AI智能证件照，一键生成标准证件照', '/images/id-photo.png', 'active', 1, 50, '/pages/flashphoto/flashphoto', 1, 1),
('professional', '职业照', 'Professional Photo', '職業照', '职场形象照，展现专业风采', '/images/professional.png', 'active', 1, 100, '/pages/professional-photo/professional-photo', 1, 2),
('portrait', '写真照', 'Portrait', '寫真照', '艺术写真，记录美好瞬间', '/images/portrait.png', 'coming_soon', 0, 150, NULL, 1, 3),
('family', '全家福', 'Family Photo', '全家福', '温馨全家福，记录幸福时刻', '/images/family.png', 'coming_soon', 0, 200, NULL, 1, 4),
('pet', '宠物写真', 'Pet Photo', '寵物寫真', '萌宠写真，记录可爱瞬间', '/images/pet.png', 'coming_soon', 0, 100, NULL, 1, 5),
('wedding', '婚纱照', 'Wedding Photo', '婚紗照', '浪漫婚纱，定格永恒', '/images/wedding.png', 'coming_soon', 0, 300, NULL, 1, 6);
