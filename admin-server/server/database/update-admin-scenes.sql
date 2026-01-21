-- 更新 admin-api 的场景数据，使其与 miniprogram-api 一致
UPDATE scenes SET scene_key='idphoto', name='证件照', description='标准证件照片', status='active', sort_order=1 WHERE id=1;
UPDATE scenes SET scene_key='professional', name='职业照', description='商务职业形象照', status='active', sort_order=2 WHERE id=2;
UPDATE scenes SET scene_key='portrait', name='写真照', description='个人艺术写真', status='coming_soon', sort_order=3 WHERE id=3;
UPDATE scenes SET scene_key='family', name='全家福', description='温馨家庭合照', status='coming_soon', sort_order=4 WHERE id=4;
UPDATE scenes SET scene_key='pet', name='宠物写真', description='萌宠艺术照片', status='coming_soon', sort_order=5 WHERE id=5;
UPDATE scenes SET scene_key='wedding', name='婚纱照', description='浪漫婚纱摄影', status='coming_soon', sort_order=6 WHERE id=6;
