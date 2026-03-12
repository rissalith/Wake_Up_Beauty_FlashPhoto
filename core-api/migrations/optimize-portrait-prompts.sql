-- ============================================
-- 优化职业照和证件照提示词 - 改进头身比例
-- ============================================

-- 更新证件照提示词
UPDATE knowledge_base
SET content = '{
  "scene": {
    "name": "证件照",
    "name_en": "ID Photo",
    "description": "AI智能证件照，一键生成标准证件照",
    "points_cost": 50
  },
  "steps": [
    {
      "step_key": "upload",
      "title": "上传照片",
      "title_en": "Upload Photo",
      "component_type": "image_upload",
      "is_required": true,
      "config": {"maxCount": 3, "tips": "请上传正面清晰照片"}
    },
    {
      "step_key": "gender",
      "title": "选择性别",
      "title_en": "Select Gender",
      "component_type": "gender_select",
      "is_required": true,
      "options": [
        {"label": "男", "label_en": "Male", "value": "male", "prompt_text": "male person"},
        {"label": "女", "label_en": "Female", "value": "female", "prompt_text": "female person"}
      ]
    },
    {
      "step_key": "spec",
      "title": "选择规格",
      "title_en": "Select Size",
      "component_type": "tags",
      "is_required": true,
      "options": [
        {"label": "一寸", "value": "1inch", "prompt_text": "1 inch standard size"},
        {"label": "二寸", "value": "2inch", "prompt_text": "2 inch standard size"},
        {"label": "小二寸", "value": "small2inch", "prompt_text": "small 2 inch size"}
      ]
    },
    {
      "step_key": "background",
      "title": "选择背景",
      "title_en": "Select Background",
      "component_type": "tags",
      "is_required": true,
      "options": [
        {"label": "白色", "value": "white", "prompt_text": "pure white background"},
        {"label": "蓝色", "value": "blue", "prompt_text": "standard blue background"},
        {"label": "红色", "value": "red", "prompt_text": "red background"}
      ]
    }
  ],
  "prompt_template": {
    "template": "基于参考图生成专业{{spec}}证件照。【核心要求】必须严格保持参考图中人物的面部特征一致性，包括五官轮廓、脸型、眼睛形状、鼻子、嘴巴、肤色等，确保生成结果与本人高度相似。纵向竖版构图（高度大于宽度，宽高比约3:4），{{background}}。正面免冠，光线均匀，人物居中，采用标准证件照构图：头顶到画面顶端留有约8%-10%空间，头部（从下巴到头顶）占画面高度约55%-60%，肩部需完整露出至胸口上方位置。【重要】必须保持人物主体完整，肩膀两侧不能被画面边缘裁切。{{gender}}。",
    "negative_prompt": "模糊, 变形, 多人, 裁切不完整, 侧脸, 闭眼, 水印, 头部过小, 头部过大, 肩膀被裁切"
  }
}',
    tags = '证件照,ID,正式,标准,头身比例',
    quality_score = 0.96,
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'scene_template' AND name = '证件照场景模板';

-- 更新职业照提示词
UPDATE knowledge_base
SET content = '{
  "scene": {
    "name": "职业照",
    "name_en": "Professional Photo",
    "description": "职场形象照，展现专业风采",
    "points_cost": 100
  },
  "steps": [
    {
      "step_key": "upload",
      "title": "上传照片",
      "title_en": "Upload Photo",
      "component_type": "image_upload",
      "is_required": true
    },
    {
      "step_key": "gender",
      "title": "选择性别",
      "title_en": "Select Gender",
      "component_type": "gender_select",
      "is_required": true,
      "options": [
        {"label": "男", "value": "male", "prompt_text": "professional businessman"},
        {"label": "女", "value": "female", "prompt_text": "professional businesswoman"}
      ]
    },
    {
      "step_key": "style",
      "title": "选择风格",
      "title_en": "Select Style",
      "component_type": "tags",
      "is_required": true,
      "options": [
        {"label": "商务正装", "value": "formal", "prompt_text": "wearing formal business suit, tie"},
        {"label": "商务休闲", "value": "casual", "prompt_text": "wearing smart casual business attire"},
        {"label": "创意时尚", "value": "creative", "prompt_text": "wearing modern creative professional outfit"}
      ]
    },
    {
      "step_key": "background",
      "title": "选择背景",
      "title_en": "Select Background",
      "component_type": "tags",
      "is_required": true,
      "options": [
        {"label": "办公室", "value": "office", "prompt_text": "modern office background with glass windows"},
        {"label": "纯色背景", "value": "solid", "prompt_text": "clean solid gray gradient background"},
        {"label": "城市天际线", "value": "skyline", "prompt_text": "city skyline background through window"}
      ]
    }
  ],
  "prompt_template": {
    "template": "基于参考图生成专业职业照。【核心要求】必须严格保持参考图中人物的面部特征一致性，包括五官轮廓、脸型、眼睛形状、鼻子、嘴巴、肤色等，确保生成结果与本人高度相似。半身竖版构图（高度大于宽度，宽高比约3:4），{{background}}，{{style}}。正面或微侧面，自信表情，光线均匀，人物居中，采用标准职业照构图：头顶到画面顶端留有约5%-8%空间，头部（从下巴到头顶）占画面高度约40%-45%，肩膀需完整露出至胸口上方位置。【重要】必须保持人物主体完整，肩膀两侧不能被画面边缘裁切。{{gender}}。",
    "negative_prompt": "模糊, 变形, 多人, 裁切不完整, 侧脸过度, 闭眼, 水印, 头部过小, 头部过大, 肩膀被裁切"
  }
}',
    tags = '职业照,商务,正装,LinkedIn,头身比例',
    quality_score = 0.95,
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'scene_template' AND name = '职业照场景模板';
