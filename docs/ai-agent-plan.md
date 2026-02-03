# AI Agent 场景配置生成系统 - 实施计划

## 一、系统概述

### 1.1 目标
将现有的单次 API 调用模式升级为完整的 AI Agent 系统，实现：
- 基于知识库的智能检索
- 多轮推理与规划
- 自动生成参考图
- 流程配置自动化
- 质量自检与迭代优化

### 1.2 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Agent 场景配置系统                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   知识库层    │    │   Agent 层   │    │   工具层     │       │
│  │              │    │              │    │              │       │
│  │ - 场景模板库 │◄──►│ - 规划Agent  │◄──►│ - 图片生成   │       │
│  │ - Prompt库   │    │ - 配置Agent  │    │ - 配置验证   │       │
│  │ - 风格素材库 │    │ - 审核Agent  │    │ - 数据库操作 │       │
│  │ - 最佳实践库 │    │ - 优化Agent  │    │ - COS上传    │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│          │                   │                   │               │
│          └───────────────────┼───────────────────┘               │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │   编排控制器       │                        │
│                    │  (Orchestrator)   │                        │
│                    └───────────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 二、知识库设计

### 2.1 知识库结构

```
knowledge_base/
├── scene_templates/          # 场景模板知识
│   ├── idphoto.json         # 证件照模板
│   ├── professional.json    # 职业照模板
│   ├── portrait.json        # 写真照模板
│   └── festival.json        # 节日主题模板
│
├── prompt_patterns/          # Prompt 模式库
│   ├── face_preservation.md # 人脸保持技巧
│   ├── style_transfer.md    # 风格迁移技巧
│   ├── background_gen.md    # 背景生成技巧
│   └── quality_enhance.md   # 质量增强技巧
│
├── style_references/         # 风格参考库
│   ├── formal/              # 正式风格
│   ├── casual/              # 休闲风格
│   ├── artistic/            # 艺术风格
│   └── festival/            # 节日风格
│
└── best_practices/           # 最佳实践
    ├── step_design.md       # 步骤设计规范
    ├── option_design.md     # 选项设计规范
    └── prompt_writing.md    # Prompt 编写规范
```

### 2.2 知识库数据表设计

```sql
-- 知识库主表
CREATE TABLE IF NOT EXISTS knowledge_base (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,           -- 分类: scene_template, prompt_pattern, style_reference, best_practice
  name TEXT NOT NULL,               -- 知识条目名称
  content TEXT NOT NULL,            -- 知识内容 (JSON 或 Markdown)
  embedding TEXT,                   -- 向量嵌入 (用于语义检索)
  tags TEXT,                        -- 标签，逗号分隔
  usage_count INTEGER DEFAULT 0,    -- 使用次数
  quality_score REAL DEFAULT 0,     -- 质量评分
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 知识关联表 (知识之间的关系)
CREATE TABLE IF NOT EXISTS knowledge_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  relation_type TEXT NOT NULL,      -- related, extends, conflicts, requires
  weight REAL DEFAULT 1.0,
  FOREIGN KEY (source_id) REFERENCES knowledge_base(id),
  FOREIGN KEY (target_id) REFERENCES knowledge_base(id)
);

-- 生成历史表 (用于学习和优化)
CREATE TABLE IF NOT EXISTS generation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input_description TEXT NOT NULL,  -- 用户输入描述
  generated_config TEXT NOT NULL,   -- 生成的配置
  knowledge_used TEXT,              -- 使用的知识条目 IDs
  user_feedback INTEGER,            -- 用户反馈 1-5
  final_config TEXT,                -- 最终采用的配置
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2.3 知识检索策略

1. **关键词匹配**: 基于标签和名称的精确匹配
2. **语义检索**: 使用 Embedding 进行相似度搜索
3. **上下文关联**: 根据已选知识推荐相关知识
4. **热度排序**: 优先返回高使用率、高评分的知识

## 三、Agent 设计

### 3.1 Agent 类型

#### 3.1.1 规划 Agent (Planner Agent)
**职责**: 理解用户意图，制定生成计划

```javascript
// 输入
{
  "user_description": "我想做一个春节拜年的场景，用户可以选择不同的祝福语和背景"
}

// 输出
{
  "scene_type": "festival",
  "theme": "spring_festival",
  "required_steps": ["upload", "gender", "blessing", "background", "decoration"],
  "style_keywords": ["红色", "喜庆", "金色", "传统"],
  "reference_scenes": ["idphoto", "professional"],
  "estimated_complexity": "medium"
}
```

#### 3.1.2 配置 Agent (Config Agent)
**职责**: 根据计划生成具体配置

```javascript
// 输入: 规划 Agent 的输出 + 检索到的知识

// 输出: 完整的场景配置 JSON
{
  "scene": { ... },
  "steps": [ ... ],
  "prompt_template": { ... }
}
```

#### 3.1.3 图片生成 Agent (Image Agent)
**职责**: 生成参考图和封面图

```javascript
// 输入
{
  "scene_config": { ... },
  "image_type": "cover",  // cover, reference, option_preview
  "style_keywords": ["红色", "喜庆"]
}

// 输出
{
  "image_url": "https://...",
  "image_base64": "..."
}
```

#### 3.1.4 审核 Agent (Review Agent)
**职责**: 检查配置质量，提出优化建议

```javascript
// 输入: 生成的配置

// 输出
{
  "passed": false,
  "score": 75,
  "issues": [
    { "type": "missing_option", "message": "背景选项过少，建议增加到4-6个" },
    { "type": "prompt_quality", "message": "Prompt 缺少人脸保持指令" }
  ],
  "suggestions": [
    "添加更多背景选项",
    "在 Prompt 中加入面部特征保持指令"
  ]
}
```

#### 3.1.5 优化 Agent (Optimizer Agent)
**职责**: 根据审核结果优化配置

```javascript
// 输入: 原配置 + 审核结果

// 输出: 优化后的配置
```

### 3.2 Agent 工作流

```
用户输入描述
      │
      ▼
┌─────────────┐
│ 规划 Agent  │ ──► 检索知识库
└─────────────┘
      │
      ▼ 生成计划
┌─────────────┐
│ 配置 Agent  │ ──► 检索模板/Prompt模式
└─────────────┘
      │
      ▼ 生成配置
┌─────────────┐
│ 图片 Agent  │ ──► 调用 AI 图片生成
└─────────────┘
      │
      ▼ 生成参考图
┌─────────────┐
│ 审核 Agent  │ ──► 质量检查
└─────────────┘
      │
      ├──► 通过 ──► 返回最终配置
      │
      ▼ 不通过
┌─────────────┐
│ 优化 Agent  │ ──► 迭代优化 (最多3轮)
└─────────────┘
      │
      └──► 返回配置 Agent
```

## 四、工具层设计

### 4.1 工具清单

| 工具名称 | 功能 | 输入 | 输出 |
|---------|------|------|------|
| `search_knowledge` | 检索知识库 | query, category, limit | 知识条目列表 |
| `generate_image` | 生成图片 | prompt, style | image_url |
| `validate_config` | 验证配置 | config | validation_result |
| `save_to_db` | 保存到数据库 | config | scene_id |
| `upload_to_cos` | 上传到 COS | image_data | url |
| `get_scene_template` | 获取场景模板 | scene_type | template |
| `get_prompt_pattern` | 获取 Prompt 模式 | pattern_type | pattern |

### 4.2 工具实现示例

```javascript
// tools/search_knowledge.js
async function searchKnowledge(query, category = null, limit = 5) {
  const db = getDatabase();

  let sql = `
    SELECT * FROM knowledge_base
    WHERE (name LIKE ? OR tags LIKE ? OR content LIKE ?)
  `;
  const params = [`%${query}%`, `%${query}%`, `%${query}%`];

  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }

  sql += ` ORDER BY quality_score DESC, usage_count DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params);
}

// tools/generate_image.js
async function generateImage(prompt, style = {}) {
  const enhancedPrompt = buildImagePrompt(prompt, style);

  const response = await axios.post(
    `${AI_API_BASE}/v1beta/models/${AI_IMAGE_MODEL}:generateContent`,
    {
      contents: [{ parts: [{ text: enhancedPrompt }] }],
      generationConfig: { responseModalities: ['image'] }
    },
    { headers: { 'Authorization': `Bearer ${AI_API_KEY}` } }
  );

  const imageData = extractImageFromResponse(response.data);
  const imageUrl = await uploadToCOS(imageData);

  return { imageUrl, imageData };
}
```

## 五、编排控制器设计

### 5.1 Orchestrator 核心逻辑

```javascript
// lib/agent-orchestrator.js

class AgentOrchestrator {
  constructor() {
    this.plannerAgent = new PlannerAgent();
    this.configAgent = new ConfigAgent();
    this.imageAgent = new ImageAgent();
    this.reviewAgent = new ReviewAgent();
    this.optimizerAgent = new OptimizerAgent();
    this.maxIterations = 3;
  }

  async generateSceneConfig(userDescription) {
    const context = {
      userDescription,
      iteration: 0,
      history: []
    };

    // Step 1: 规划
    console.log('[Orchestrator] Step 1: 规划阶段');
    const plan = await this.plannerAgent.execute(context);
    context.plan = plan;
    context.history.push({ step: 'plan', result: plan });

    // Step 2: 检索知识
    console.log('[Orchestrator] Step 2: 知识检索');
    const knowledge = await this.retrieveKnowledge(plan);
    context.knowledge = knowledge;

    // Step 3: 生成配置
    console.log('[Orchestrator] Step 3: 配置生成');
    let config = await this.configAgent.execute(context);
    context.config = config;
    context.history.push({ step: 'config', result: config });

    // Step 4: 生成图片
    console.log('[Orchestrator] Step 4: 图片生成');
    const images = await this.imageAgent.execute(context);
    config = this.attachImages(config, images);
    context.config = config;

    // Step 5: 审核与优化循环
    while (context.iteration < this.maxIterations) {
      console.log(`[Orchestrator] Step 5: 审核 (迭代 ${context.iteration + 1})`);
      const review = await this.reviewAgent.execute(context);
      context.history.push({ step: 'review', result: review });

      if (review.passed) {
        console.log('[Orchestrator] 审核通过');
        break;
      }

      console.log('[Orchestrator] 审核未通过，进行优化');
      context.reviewResult = review;
      config = await this.optimizerAgent.execute(context);
      context.config = config;
      context.iteration++;
    }

    // Step 6: 保存历史记录
    await this.saveGenerationHistory(context);

    return {
      success: true,
      config: context.config,
      iterations: context.iteration,
      history: context.history
    };
  }

  async retrieveKnowledge(plan) {
    const knowledge = {
      templates: [],
      promptPatterns: [],
      styleReferences: [],
      bestPractices: []
    };

    // 检索相关场景模板
    knowledge.templates = await searchKnowledge(
      plan.scene_type,
      'scene_template',
      3
    );

    // 检索 Prompt 模式
    for (const keyword of plan.style_keywords) {
      const patterns = await searchKnowledge(
        keyword,
        'prompt_pattern',
        2
      );
      knowledge.promptPatterns.push(...patterns);
    }

    // 检索最佳实践
    knowledge.bestPractices = await searchKnowledge(
      'step_design',
      'best_practice',
      2
    );

    return knowledge;
  }
}
```

### 5.2 Agent 基类

```javascript
// lib/agents/base-agent.js

class BaseAgent {
  constructor(name, model = 'gemini-3-flash-preview') {
    this.name = name;
    this.model = model;
    this.systemPrompt = '';
  }

  async execute(context) {
    const prompt = this.buildPrompt(context);
    const response = await this.callLLM(prompt);
    return this.parseResponse(response);
  }

  buildPrompt(context) {
    throw new Error('Subclass must implement buildPrompt');
  }

  parseResponse(response) {
    throw new Error('Subclass must implement parseResponse');
  }

  async callLLM(prompt) {
    const response = await axios.post(
      `${AI_API_BASE}/v1beta/models/${this.model}:generateContent`,
      {
        contents: [{
          parts: [
            { text: this.systemPrompt },
            { text: prompt }
          ]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`
        },
        timeout: 60000
      }
    );

    return response.data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
  }
}
```

## 六、实施步骤

### Phase 1: 知识库建设 (第1周)

#### 任务清单
- [ ] 创建知识库数据表
- [ ] 整理现有场景配置作为模板
- [ ] 编写 Prompt 模式文档
- [ ] 收集风格参考素材
- [ ] 实现知识检索 API

#### 交付物
- `core-api/migrations/add-knowledge-base.sql`
- `core-api/lib/knowledge-base.js`
- `knowledge_base/` 目录及初始数据

### Phase 2: Agent 框架搭建 (第2周)

#### 任务清单
- [ ] 实现 BaseAgent 基类
- [ ] 实现 PlannerAgent
- [ ] 实现 ConfigAgent
- [ ] 实现 ReviewAgent
- [ ] 实现 OptimizerAgent
- [ ] 实现 Orchestrator

#### 交付物
- `core-api/lib/agents/` 目录
- `core-api/lib/agent-orchestrator.js`

### Phase 3: 工具层实现 (第3周)

#### 任务清单
- [ ] 实现 search_knowledge 工具
- [ ] 实现 validate_config 工具
- [ ] 实现 generate_image 工具 (复用现有)
- [ ] 实现 save_to_db 工具
- [ ] 集成 COS 上传

#### 交付物
- `core-api/lib/tools/` 目录

### Phase 4: 图片生成 Agent (第4周)

#### 任务清单
- [ ] 实现 ImageAgent
- [ ] 封面图生成逻辑
- [ ] 参考图生成逻辑
- [ ] 选项预览图生成 (可选)
- [ ] 图片质量检查

#### 交付物
- `core-api/lib/agents/image-agent.js`

### Phase 5: API 集成与测试 (第5周)

#### 任务清单
- [ ] 创建 Agent API 路由
- [ ] 前端管理界面集成
- [ ] 端到端测试
- [ ] 性能优化
- [ ] 错误处理完善

#### 交付物
- `core-api/routes/admin/ai-agent.js`
- 更新后的管理界面

### Phase 6: 知识库优化与学习 (持续)

#### 任务清单
- [ ] 收集用户反馈
- [ ] 更新知识库内容
- [ ] 优化检索算法
- [ ] 添加向量检索 (可选)

## 七、API 设计

### 7.1 Agent 生成 API

```
POST /api/admin/ai-agent/generate
```

**请求体**:
```json
{
  "description": "春节拜年场景，用户可以选择祝福语和背景",
  "options": {
    "auto_generate_images": true,
    "max_iterations": 3
  }
}
```

**响应**:
```json
{
  "code": 200,
  "data": {
    "task_id": "gen_123456",
    "status": "processing",
    "estimated_time": 60
  }
}
```

### 7.2 获取生成状态

```
GET /api/admin/ai-agent/status/:task_id
```

**响应**:
```json
{
  "code": 200,
  "data": {
    "task_id": "gen_123456",
    "status": "completed",
    "progress": 100,
    "current_step": "done",
    "result": {
      "config": { ... },
      "iterations": 2,
      "review_score": 92
    }
  }
}
```

### 7.3 知识库管理 API

```
GET /api/admin/knowledge?category=scene_template&query=证件照
POST /api/admin/knowledge
PUT /api/admin/knowledge/:id
DELETE /api/admin/knowledge/:id
```

## 八、技术选型

| 组件 | 技术方案 | 说明 |
|------|---------|------|
| LLM | Gemini 3 Flash Preview | 配置生成、规划、审核 |
| 图片生成 | Gemini 3 Pro Image | 参考图、封面图生成 |
| 向量检索 | SQLite + 简单相似度 | 初期方案，后续可升级 |
| 任务队列 | Redis | 异步任务处理 |
| 存储 | 腾讯云 COS | 图片存储 |

## 九、风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| LLM 生成不稳定 | 配置质量波动 | 多轮审核+人工兜底 |
| 图片生成耗时长 | 用户体验差 | 异步处理+进度展示 |
| 知识库冷启动 | 初期效果差 | 预置高质量模板 |
| API 调用成本 | 运营成本高 | 缓存+限流+按需生成 |

## 十、成功指标

| 指标 | 目标值 | 说明 |
|------|-------|------|
| 配置生成成功率 | > 90% | 能生成有效配置 |
| 一次通过率 | > 60% | 无需人工修改 |
| 平均生成时间 | < 2分钟 | 包含图片生成 |
| 用户满意度 | > 4.0/5 | 用户反馈评分 |

---

**文档版本**: 1.0.0
**创建日期**: 2026-02-03
**作者**: Claude AI Assistant
