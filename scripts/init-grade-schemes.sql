-- 品级方案初始化脚本
-- 用于初始化预制的品级方案数据

-- 1. 创建成语稀有度方案
INSERT OR REPLACE INTO grade_schemes (id, scheme_key, name, name_en, description, category, is_system, is_active, sort_order, created_at, updated_at)
VALUES (1, 'phrase_rarity', '成语稀有度', 'Phrase Rarity', '用于成语/祝福语的稀有度分级', 'phrase', 1, 1, 1, datetime('now'), datetime('now'));

-- 2. 创建马品级方案
INSERT OR REPLACE INTO grade_schemes (id, scheme_key, name, name_en, description, category, is_system, is_active, sort_order, created_at, updated_at)
VALUES (2, 'horse_grade', '马品级', 'Horse Grade', '用于新春坐骑的品级分级', 'horse', 1, 1, 2, datetime('now'), datetime('now'));

-- 3. 创建成语稀有度品级定义
INSERT OR REPLACE INTO grade_definitions (id, scheme_id, grade_key, name, name_en, description, weight, color, bg_color, sort_order, is_active, created_at)
VALUES
(1, 1, 'common', '普通', 'Common', '常见的祝福语', 500, '#9e9e9e', '#f5f5f5', 1, 1, datetime('now')),
(2, 1, 'rare', '稀有', 'Rare', '稀有的祝福语', 300, '#2196f3', '#e3f2fd', 2, 1, datetime('now')),
(3, 1, 'epic', '史诗', 'Epic', '史诗级祝福语', 150, '#9c27b0', '#f3e5f5', 3, 1, datetime('now')),
(4, 1, 'legendary', '传说', 'Legendary', '传说级祝福语', 50, '#ff9800', '#fff8e1', 4, 1, datetime('now'));

-- 4. 创建马品级定义
INSERT OR REPLACE INTO grade_definitions (id, scheme_id, grade_key, name, name_en, description, weight, prompt_text, color, bg_color, sort_order, is_active, created_at)
VALUES
(5, 2, 'common', '普通马', 'Common Horse', '可爱的小马驹', 500, 'a cute brown pony with soft fur, gentle and adorable appearance', '#9e9e9e', '#fafafa', 1, 1, datetime('now')),
(6, 2, 'silver', '银马', 'Silver Horse', '银白色的骏马', 300, 'a majestic silver-white horse with shimmering metallic coat, elegant and spirited', '#b0bec5', '#eceff1', 2, 1, datetime('now')),
(7, 2, 'gold', '金马', 'Golden Horse', '金光闪闪的神驹', 150, 'a magnificent golden horse radiating golden light, with flowing mane, noble and luxurious', '#ffd700', '#fffde7', 3, 1, datetime('now')),
(8, 2, 'divine', '神马', 'Divine Horse', '神圣的天马', 50, 'a legendary divine celestial horse glowing with sacred light, standing on auspicious clouds, with flame-like flowing mane surrounded by golden halos', '#ff6b6b', '#ffebee', 4, 1, datetime('now'));

-- 5. 创建步骤-品级方案映射
INSERT OR REPLACE INTO step_scheme_mappings (id, scene_id, step_key, scheme_id, created_at)
VALUES
(1, 'horse_year_avatar', 'phrase', 1, datetime('now')),
(2, 'horse_year_avatar', 'horse', 2, datetime('now'));

-- 6. 更新步骤图标
UPDATE scene_steps SET icon = 'camera' WHERE step_key = 'upload' AND scene_id IN (SELECT id FROM scenes WHERE scene_key = 'horse_year_avatar');
UPDATE scene_steps SET icon = 'user' WHERE step_key = 'gender' AND scene_id IN (SELECT id FROM scenes WHERE scene_key = 'horse_year_avatar');
UPDATE scene_steps SET icon = 'dice' WHERE step_key = 'phrase' AND scene_id IN (SELECT id FROM scenes WHERE scene_key = 'horse_year_avatar');
UPDATE scene_steps SET icon = 'horse' WHERE step_key = 'horse' AND scene_id IN (SELECT id FROM scenes WHERE scene_key = 'horse_year_avatar');
