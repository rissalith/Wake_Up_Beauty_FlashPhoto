-- ============================================
-- 国际化翻译迁移脚本
-- 为场景步骤和选项添加英文翻译
-- ============================================

-- ==================== 场景表英文翻译 ====================
-- 证件照场景
UPDATE scenes SET
  name_en = 'ID Photo',
  description_en = 'Professional ID photos for documents, passports, and more'
WHERE scene_key = 'idphoto' OR id = 'idphoto' OR id = 1;

-- 职业照场景
UPDATE scenes SET
  name_en = 'Professional Photo',
  description_en = 'Professional headshots for business and career'
WHERE scene_key = 'professional' OR id = 'professional' OR id = 2;

-- ==================== 步骤标题英文翻译 ====================
-- 通用步骤
UPDATE scene_steps SET title_en = 'Upload Photo' WHERE step_key = 'upload';
UPDATE scene_steps SET title_en = 'Select Gender' WHERE step_key = 'gender';
UPDATE scene_steps SET title_en = 'Select Outfit' WHERE step_key = 'clothing' OR step_key = 'dress';
UPDATE scene_steps SET title_en = 'Select Hairstyle' WHERE step_key = 'hairstyle' OR step_key = 'hair';
UPDATE scene_steps SET title_en = 'Select Expression' WHERE step_key = 'expression';
UPDATE scene_steps SET title_en = 'Select Size' WHERE step_key = 'spec' OR step_key = 'size';
UPDATE scene_steps SET title_en = 'Select Background' WHERE step_key = 'background' OR step_key = 'bg_color';

-- ==================== 选项标签英文翻译 ====================

-- 性别选项
UPDATE step_options SET label_en = 'Male' WHERE option_key = 'male';
UPDATE step_options SET label_en = 'Female' WHERE option_key = 'female';

-- 服装选项
UPDATE step_options SET label_en = 'White Shirt' WHERE option_key = 'white_shirt' OR label = '白衬衫';
UPDATE step_options SET label_en = 'Blue Shirt' WHERE option_key = 'blue_shirt' OR label = '蓝衬衫';
UPDATE step_options SET label_en = 'Dark Shirt' WHERE option_key = 'dark_shirt' OR label = '深衬衫';
UPDATE step_options SET label_en = 'Black Shirt' WHERE option_key = 'black_shirt' OR label = '黑衬衫';
UPDATE step_options SET label_en = 'Blue Suit' WHERE option_key = 'blue_suit' OR label = '蓝西装';
UPDATE step_options SET label_en = 'Dark Suit' WHERE option_key = 'dark_suit' OR label = '深西装';
UPDATE step_options SET label_en = 'Black Suit' WHERE option_key = 'black_suit' OR label = '黑西装';
UPDATE step_options SET label_en = 'Suit with Tie' WHERE option_key = 'suit_tie' OR label = '西装领带';
UPDATE step_options SET label_en = 'Formal Suit' WHERE option_key = 'formal_suit' OR label = '正装';

-- 发型选项
UPDATE step_options SET label_en = 'Buzz Cut' WHERE option_key = 'buzz_cut' OR label = '寸头';
UPDATE step_options SET label_en = 'Side Part' WHERE option_key = 'side_part' OR label = '侧分';
UPDATE step_options SET label_en = 'Short Hair' WHERE option_key = 'short_hair' OR label = '短发';
UPDATE step_options SET label_en = 'Medium Hair' WHERE option_key = 'medium_hair' OR label = '中发';
UPDATE step_options SET label_en = 'Long Hair' WHERE option_key = 'long_hair' OR label = '长发';
UPDATE step_options SET label_en = 'Ponytail' WHERE option_key = 'ponytail' OR label = '马尾';
UPDATE step_options SET label_en = 'Bun' WHERE option_key = 'bun' OR label = '丸子头';
UPDATE step_options SET label_en = 'Short Curly' WHERE option_key = 'short_curly' OR label = '短卷发';

-- 表情选项
UPDATE step_options SET label_en = 'Neutral' WHERE option_key = 'neutral' OR label = '不露齿';
UPDATE step_options SET label_en = 'Slight Smile' WHERE option_key = 'slight_smile' OR label = '轻微笑';
UPDATE step_options SET label_en = 'Big Smile' WHERE option_key = 'big_smile' OR label = '大微笑';
UPDATE step_options SET label_en = 'Smile with Teeth' WHERE option_key = 'smile_teeth' OR label = '露齿笑';

-- 规格选项
UPDATE step_options SET label_en = '1 inch' WHERE option_key = '1inch' OR label = '一寸';
UPDATE step_options SET label_en = '2 inch' WHERE option_key = '2inch' OR label = '二寸';
UPDATE step_options SET label_en = 'Small 1 inch' WHERE option_key = 'small_1inch' OR label = '小一寸';
UPDATE step_options SET label_en = 'Large 1 inch' WHERE option_key = 'large_1inch' OR label = '大一寸';

-- 背景颜色选项
UPDATE step_options SET label_en = 'White' WHERE option_key = 'white' AND (label = '白色' OR label = '白底');
UPDATE step_options SET label_en = 'Blue' WHERE option_key = 'blue' AND (label = '蓝色' OR label = '蓝底');
UPDATE step_options SET label_en = 'Red' WHERE option_key = 'red' AND (label = '红色' OR label = '红底');
UPDATE step_options SET label_en = 'Gray' WHERE option_key = 'gray' AND (label = '灰色' OR label = '灰底');
UPDATE step_options SET label_en = 'Gradient' WHERE option_key = 'gradient' OR label = '渐变';

-- ==================== 完成 ====================
-- 运行此脚本后，API 将根据语言参数返回对应的翻译
