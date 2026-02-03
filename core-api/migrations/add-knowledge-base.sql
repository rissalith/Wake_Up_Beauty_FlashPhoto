-- ============================================
-- AI Agent 知识库 - 数据库设计
-- ============================================

-- 1. 知识库主表
CREATE TABLE IF NOT EXISTS knowledge_base (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,           -- 分类: scene_template, prompt_pattern, style_reference, best_practice
  name TEXT NOT NULL,               -- 知识条目名称
  name_en TEXT,                     -- 英文名称
  content TEXT NOT NULL,            -- 知识内容 (JSON 或 Markdown)
  tags TEXT,                        -- 标签，逗号分隔
  usage_count INTEGER DEFAULT 0,    -- 使用次数
  quality_score REAL DEFAULT 0.8,   -- 质量评分 0-1
  is_active INTEGER DEFAULT 1,      -- 是否启用
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 知识关联表 (知识之间的关系)
CREATE TABLE IF NOT EXISTS knowledge_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  relation_type TEXT NOT NULL,      -- related, extends, conflicts, requires
  weight REAL DEFAULT 1.0,
  FOREIGN KEY (source_id) REFERENCES knowledge_base(id),
  FOREIGN KEY (target_id) REFERENCES knowledge_base(id)
);

-- 3. Agent 生成任务表
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,              -- 任务ID: task_xxx
  user_description TEXT NOT NULL,   -- 用户输入描述
  status TEXT DEFAULT 'pending',    -- pending, processing, completed, failed
  current_step TEXT,                -- 当前步骤
  progress INTEGER DEFAULT 0,       -- 进度 0-100
  config_result TEXT,               -- 生成的配置 JSON
  images_result TEXT,               -- 生成的图片 JSON
  review_score INTEGER,             -- 审核得分
  iterations INTEGER DEFAULT 0,     -- 迭代次数
  error_message TEXT,               -- 错误信息
  knowledge_used TEXT,              -- 使用的知识条目 IDs
  execution_log TEXT,               -- 执行日志 JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- 4. 生成历史表 (用于学习和优化)
CREATE TABLE IF NOT EXISTS generation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,                     -- 关联任务
  input_description TEXT NOT NULL,  -- 用户输入描述
  generated_config TEXT NOT NULL,   -- 生成的配置
  knowledge_used TEXT,              -- 使用的知识条目 IDs
  user_feedback INTEGER,            -- 用户反馈 1-5
  final_config TEXT,                -- 最终采用的配置 (用户修改后)
  is_adopted INTEGER DEFAULT 0,     -- 是否被采用
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES agent_tasks(id)
);

-- 5. 索引优化
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON knowledge_base(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_active ON knowledge_base(is_active);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_generation_history_task ON generation_history(task_id);

-- ============================================
-- 初始知识数据 - 场景模板
-- ============================================

-- 证件照场景模板
INSERT OR REPLACE INTO knowledge_base (category, name, name_en, content, tags, quality_score) VALUES
('scene_template', '证件照场景模板', 'ID Photo Template', '{
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
    "template": "Generate a professional {{spec}} ID photo. Subject: {{gender}}. Background: {{background}}. Requirements: front-facing, formal attire, neutral expression, even lighting, centered composition, head occupying 55-60% of frame height.",
    "negative_prompt": "blurry, distorted, multiple people, cropped, side view, closed eyes, watermark"
  }
}', '证件照,ID,正式,标准', 0.95);

-- 职业照场景模板
INSERT OR REPLACE INTO knowledge_base (category, name, name_en, content, tags, quality_score) VALUES
('scene_template', '职业照场景模板', 'Professional Photo Template', '{
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
    "template": "Generate a professional corporate portrait. Subject: {{gender}}, {{style}}. Background: {{background}}. Style: confident pose, professional lighting, sharp focus, high-end corporate photography.",
    "negative_prompt": "casual, unprofessional, blurry, distorted, low quality"
  }
}', '职业照,商务,正装,LinkedIn', 0.92);

-- 节日主题场景模板
INSERT OR REPLACE INTO knowledge_base (category, name, name_en, content, tags, quality_score) VALUES
('scene_template', '节日主题场景模板', 'Festival Theme Template', '{
  "scene": {
    "name": "节日祝福",
    "name_en": "Festival Greeting",
    "description": "节日主题照片，传递美好祝福",
    "points_cost": 80
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
        {"label": "男", "value": "male", "prompt_text": "male person"},
        {"label": "女", "value": "female", "prompt_text": "female person"}
      ]
    },
    {
      "step_key": "festival",
      "title": "选择节日",
      "title_en": "Select Festival",
      "component_type": "tags",
      "is_required": true,
      "options": [
        {"label": "春节", "value": "spring", "prompt_text": "Chinese New Year, red lanterns, golden decorations, festive atmosphere"},
        {"label": "中秋", "value": "midautumn", "prompt_text": "Mid-Autumn Festival, full moon, mooncakes, traditional Chinese elements"},
        {"label": "圣诞", "value": "christmas", "prompt_text": "Christmas, snow, Christmas tree, warm lights, festive decorations"}
      ]
    },
    {
      "step_key": "blessing",
      "title": "选择祝福语",
      "title_en": "Select Blessing",
      "component_type": "tags",
      "is_required": false,
      "options": [
        {"label": "新年快乐", "value": "happy_new_year", "prompt_text": "with text Happy New Year"},
        {"label": "恭喜发财", "value": "prosperity", "prompt_text": "with text Prosperity and Wealth"},
        {"label": "阖家幸福", "value": "family_happiness", "prompt_text": "with text Family Happiness"}
      ]
    }
  ],
  "prompt_template": {
    "template": "Generate a festive portrait photo. Subject: {{gender}}. Theme: {{festival}}. {{blessing}}. Style: warm, joyful, celebratory atmosphere, high quality.",
    "negative_prompt": "sad, dark, gloomy, low quality, blurry"
  }
}', '节日,春节,中秋,圣诞,祝福', 0.88);

-- ============================================
-- 初始知识数据 - Prompt 模式
-- ============================================

INSERT OR REPLACE INTO knowledge_base (category, name, name_en, content, tags, quality_score) VALUES
('prompt_pattern', '人脸保持模式', 'Face Preservation Pattern', '## 人脸保持 Prompt 模式

### 核心指令
```
CRITICAL: Maintain exact facial features from the reference photo including:
- Face shape and proportions
- Eye shape, size, and spacing
- Nose structure and size
- Mouth shape and lip fullness
- Skin tone and texture
- Any distinctive features (moles, dimples, etc.)

The generated face must be immediately recognizable as the same person.
```

### 使用场景
- 证件照生成
- 职业照生成
- 任何需要保持用户面部特征的场景

### 最佳实践
1. 将人脸保持指令放在 Prompt 开头
2. 明确列出需要保持的面部特征
3. 使用 "exact", "identical", "same" 等强调词
4. 在 negative_prompt 中加入 "different face", "altered features"', '人脸,保持,一致性,面部特征', 0.95);

INSERT OR REPLACE INTO knowledge_base (category, name, name_en, content, tags, quality_score) VALUES
('prompt_pattern', '风格迁移模式', 'Style Transfer Pattern', '## 风格迁移 Prompt 模式

### 核心指令
```
Apply the artistic style from the reference image while preserving the subject identity:
- Match the color palette and tones
- Replicate the lighting style and direction
- Maintain the composition principles
- Transfer texture and rendering style
- Keep the mood and atmosphere
```

### 参数控制
- 风格权重: 0.6-0.8 (保持身份的同时迁移风格)
- 内容权重: 0.2-0.4 (保留原始内容结构)

### 使用场景
- 艺术写真
- 风格化头像
- 主题照片', '风格,迁移,艺术,转换', 0.90);

INSERT OR REPLACE INTO knowledge_base (category, name, name_en, content, tags, quality_score) VALUES
('prompt_pattern', '背景生成模式', 'Background Generation Pattern', '## 背景生成 Prompt 模式

### 纯色背景
```
Clean solid [color] background, studio lighting, no shadows on background, even illumination
```

### 渐变背景
```
Smooth gradient background from [color1] to [color2], professional studio setup, soft transition
```

### 场景背景
```
[Scene description] background, depth of field blur, subject in sharp focus, natural integration
```

### 最佳实践
1. 背景描述要具体明确
2. 指定光线方向和强度
3. 说明主体与背景的关系
4. 使用景深控制突出主体', '背景,纯色,渐变,场景', 0.88);

INSERT OR REPLACE INTO knowledge_base (category, name, name_en, content, tags, quality_score) VALUES
('prompt_pattern', '质量增强模式', 'Quality Enhancement Pattern', '## 质量增强 Prompt 模式

### 通用质量指令
```
High resolution, sharp focus, professional photography, 8K quality, detailed textures, natural skin, proper exposure, balanced colors
```

### 人像专用
```
Professional portrait photography, catchlight in eyes, natural skin texture, subtle makeup enhancement, flattering lighting, refined details
```

### Negative Prompt 模板
```
blurry, out of focus, low resolution, pixelated, noise, grain, overexposed, underexposed, distorted, deformed, watermark, text overlay, artifacts, compression artifacts
```

### 最佳实践
1. 始终包含分辨率要求
2. 指定清晰度和对焦
3. 描述期望的光线质量
4. 在 negative_prompt 中排除常见问题', '质量,高清,清晰,专业', 0.92);

-- ============================================
-- 初始知识数据 - 最佳实践
-- ============================================

INSERT OR REPLACE INTO knowledge_base (category, name, name_en, content, tags, quality_score) VALUES
('best_practice', '步骤设计规范', 'Step Design Guidelines', '## 步骤设计最佳实践

### 步骤数量
- 推荐: 3-6 个步骤
- 最少: 2 个 (上传 + 1个选择)
- 最多: 8 个 (避免用户疲劳)

### 步骤顺序
1. **第一步必须是图片上传** (image_upload)
2. **第二步推荐性别选择** (gender_select) - 影响后续选项
3. **核心选择步骤** - 背景、风格等
4. **可选增强步骤** - 美颜、滤镜等

### 步骤类型选择
| 类型 | 适用场景 | 选项数量 |
|------|---------|---------|
| gender_select | 性别选择 | 2 |
| tags | 文字选项 | 3-6 |
| image_tags | 需要视觉参考 | 4-8 |
| dice_roll | 随机惊喜 | 6-12 |

### 必填 vs 可选
- 核心步骤设为必填 (is_required: true)
- 增强功能设为可选 (is_required: false)
- 可选步骤提供默认值', '步骤,设计,规范,流程', 0.90);

INSERT OR REPLACE INTO knowledge_base (category, name, name_en, content, tags, quality_score) VALUES
('best_practice', '选项设计规范', 'Option Design Guidelines', '## 选项设计最佳实践

### 选项数量
- 推荐: 4-6 个选项
- 最少: 2 个
- 最多: 8 个 (超过考虑分组)

### 选项命名
- 使用简短、直观的中文标签
- 提供英文翻译 (label_en)
- 避免专业术语

### Prompt Text 编写
- 使用英文描述
- 具体、可执行的描述
- 避免模糊词汇

### 示例
```json
{
  "label": "商务正装",
  "label_en": "Formal Business",
  "value": "formal",
  "prompt_text": "wearing formal dark business suit with tie, professional appearance"
}
```

### 默认选项
- 每个步骤设置一个默认选项 (is_default: true)
- 默认选项应该是最常用的选择', '选项,设计,标签,prompt', 0.88);

INSERT OR REPLACE INTO knowledge_base (category, name, name_en, content, tags, quality_score) VALUES
('best_practice', 'Prompt模板编写规范', 'Prompt Template Guidelines', '## Prompt 模板编写最佳实践

### 模板结构
```
[主体描述] + [风格要求] + [技术参数] + [质量要求]
```

### 变量使用
- 使用 {{variable_name}} 格式
- 变量名与 step_key 对应
- 提供变量默认值

### 示例模板
```
Generate a professional {{spec}} photo of a {{gender}}.
Style: {{style}}.
Background: {{background}}.
Requirements: high quality, sharp focus, professional lighting, natural skin texture.
```

### Negative Prompt
必须包含:
- 质量问题: blurry, low quality, pixelated
- 变形问题: distorted, deformed, extra limbs
- 内容问题: watermark, text, multiple people

### 长度控制
- 主 Prompt: 100-300 词
- Negative Prompt: 30-80 词', 'Prompt,模板,编写,变量', 0.92);
