/**
 * 知识库服务
 * 提供知识的存储、检索和管理功能
 */

const path = require('path');
const fs = require('fs');

// 数据库连接
let db = null;

/**
 * 初始化知识库
 * @param {Object} database - 数据库实例
 */
function initKnowledgeBase(database) {
  db = database;

  try {
    // 创建知识库表
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        name_en TEXT,
        content TEXT NOT NULL,
        tags TEXT,
        usage_count INTEGER DEFAULT 0,
        quality_score REAL DEFAULT 0.8,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL,
        target_id INTEGER NOT NULL,
        relation_type TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        FOREIGN KEY (source_id) REFERENCES knowledge_base(id),
        FOREIGN KEY (target_id) REFERENCES knowledge_base(id)
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id TEXT PRIMARY KEY,
        user_description TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        current_step TEXT,
        progress INTEGER DEFAULT 0,
        config_result TEXT,
        images_result TEXT,
        review_score INTEGER,
        iterations INTEGER DEFAULT 0,
        error_message TEXT,
        knowledge_used TEXT,
        execution_log TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS generation_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT,
        input_description TEXT NOT NULL,
        generated_config TEXT NOT NULL,
        knowledge_used TEXT,
        user_feedback INTEGER,
        final_config TEXT,
        is_adopted INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES agent_tasks(id)
      )
    `);

    // 创建索引
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_base(category)`); } catch(e) {}
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON knowledge_base(tags)`); } catch(e) {}
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_active ON knowledge_base(is_active)`); } catch(e) {}
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status)`); } catch(e) {}
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_generation_history_task ON generation_history(task_id)`); } catch(e) {}

    // 插入初始知识数据
    insertInitialKnowledge();

    console.log('[知识库] 初始化完成');
  } catch (error) {
    console.error('[知识库] 初始化失败:', error.message);
  }
}

/**
 * 插入初始知识数据
 */
function insertInitialKnowledge() {
  // 检查是否已有数据
  const count = db.prepare('SELECT COUNT(*) as count FROM knowledge_base').get();
  if (count.count > 0) {
    console.log('[知识库] 已有数据，跳过初始化');
    return;
  }

  const insertStmt = db.prepare(`
    INSERT INTO knowledge_base (category, name, name_en, content, tags, quality_score)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // 证件照场景模板
  insertStmt.run(
    'scene_template',
    '证件照场景模板',
    'ID Photo Template',
    JSON.stringify({
      scene: {
        name: "证件照",
        name_en: "ID Photo",
        description: "AI智能证件照，一键生成标准证件照",
        points_cost: 50
      },
      steps: [
        {
          step_key: "upload",
          title: "上传照片",
          title_en: "Upload Photo",
          component_type: "image_upload",
          is_required: true
        },
        {
          step_key: "gender",
          title: "选择性别",
          title_en: "Select Gender",
          component_type: "gender_select",
          is_required: true,
          options: [
            { label: "男", label_en: "Male", value: "male", prompt_text: "male person" },
            { label: "女", label_en: "Female", value: "female", prompt_text: "female person" }
          ]
        },
        {
          step_key: "background",
          title: "选择背景",
          title_en: "Select Background",
          component_type: "tags",
          is_required: true,
          options: [
            { label: "白色", value: "white", prompt_text: "pure white background" },
            { label: "蓝色", value: "blue", prompt_text: "standard blue background" },
            { label: "红色", value: "red", prompt_text: "red background" }
          ]
        }
      ],
      prompt_template: {
        template: "Generate a professional ID photo. Subject: {{gender}}. Background: {{background}}. Requirements: front-facing, formal attire, neutral expression, even lighting.",
        negative_prompt: "blurry, distorted, multiple people, cropped, side view"
      }
    }),
    '证件照,ID,正式,标准',
    0.95
  );

  // 节日主题场景模板
  insertStmt.run(
    'scene_template',
    '节日主题场景模板',
    'Festival Theme Template',
    JSON.stringify({
      scene: {
        name: "节日祝福",
        name_en: "Festival Greeting",
        description: "节日主题照片，传递美好祝福",
        points_cost: 80
      },
      steps: [
        {
          step_key: "upload",
          title: "上传照片",
          component_type: "image_upload",
          is_required: true
        },
        {
          step_key: "gender",
          title: "选择性别",
          component_type: "gender_select",
          is_required: true,
          options: [
            { label: "男", value: "male", prompt_text: "male person" },
            { label: "女", value: "female", prompt_text: "female person" }
          ]
        },
        {
          step_key: "festival",
          title: "选择节日",
          component_type: "tags",
          is_required: true,
          options: [
            { label: "春节", value: "spring", prompt_text: "Chinese New Year, red lanterns, golden decorations" },
            { label: "中秋", value: "midautumn", prompt_text: "Mid-Autumn Festival, full moon, mooncakes" },
            { label: "圣诞", value: "christmas", prompt_text: "Christmas, snow, Christmas tree, warm lights" }
          ]
        }
      ],
      prompt_template: {
        template: "Generate a festive portrait. Subject: {{gender}}. Theme: {{festival}}. Style: warm, joyful, celebratory.",
        negative_prompt: "sad, dark, gloomy, low quality"
      }
    }),
    '节日,春节,中秋,圣诞,祝福',
    0.88
  );

  // 人脸保持 Prompt 模式
  insertStmt.run(
    'prompt_pattern',
    '人脸保持模式',
    'Face Preservation Pattern',
    `## 人脸保持 Prompt 模式

### 核心指令
CRITICAL: Maintain exact facial features from the reference photo including face shape, eyes, nose, mouth, and skin tone.

### 使用场景
- 证件照生成
- 职业照生成
- 任何需要保持用户面部特征的场景

### 最佳实践
1. 将人脸保持指令放在 Prompt 开头
2. 明确列出需要保持的面部特征
3. 使用 "exact", "identical", "same" 等强调词`,
    '人脸,保持,一致性,面部特征',
    0.95
  );

  // 步骤设计规范
  insertStmt.run(
    'best_practice',
    '步骤设计规范',
    'Step Design Guidelines',
    `## 步骤设计最佳实践

### 步骤数量
- 推荐: 3-6 个步骤
- 最少: 2 个 (上传 + 1个选择)
- 最多: 8 个

### 步骤顺序
1. 第一步必须是图片上传 (image_upload)
2. 第二步推荐性别选择 (gender_select)
3. 核心选择步骤 - 背景、风格等
4. 可选增强步骤 - 美颜、滤镜等`,
    '步骤,设计,规范,流程',
    0.90
  );

  console.log('[知识库] 初始数据插入完成');
}

/**
 * 知识库分类
 */
const KNOWLEDGE_CATEGORIES = {
  SCENE_TEMPLATE: 'scene_template',      // 场景模板
  PROMPT_PATTERN: 'prompt_pattern',      // Prompt 模式
  STYLE_REFERENCE: 'style_reference',    // 风格参考
  BEST_PRACTICE: 'best_practice'         // 最佳实践
};

/**
 * 搜索知识库
 * @param {string} query - 搜索关键词
 * @param {Object} options - 搜索选项
 * @returns {Array} 知识条目列表
 */
function searchKnowledge(query, options = {}) {
  const {
    category = null,
    limit = 10,
    minScore = 0,
    onlyActive = true
  } = options;

  let sql = `
    SELECT * FROM knowledge_base
    WHERE (name LIKE ? OR tags LIKE ? OR content LIKE ?)
  `;
  const params = [`%${query}%`, `%${query}%`, `%${query}%`];

  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }

  if (onlyActive) {
    sql += ` AND is_active = 1`;
  }

  if (minScore > 0) {
    sql += ` AND quality_score >= ?`;
    params.push(minScore);
  }

  sql += ` ORDER BY quality_score DESC, usage_count DESC LIMIT ?`;
  params.push(limit);

  try {
    const results = db.prepare(sql).all(...params);

    // 解析 content 字段中的 JSON
    return results.map(item => ({
      ...item,
      content: tryParseJSON(item.content)
    }));
  } catch (error) {
    console.error('[知识库] 搜索失败:', error.message);
    return [];
  }
}

/**
 * 根据分类获取知识
 * @param {string} category - 分类
 * @param {number} limit - 数量限制
 * @returns {Array} 知识条目列表
 */
function getKnowledgeByCategory(category, limit = 20) {
  try {
    const sql = `
      SELECT * FROM knowledge_base
      WHERE category = ? AND is_active = 1
      ORDER BY quality_score DESC, usage_count DESC
      LIMIT ?
    `;

    const results = db.prepare(sql).all(category, limit);

    return results.map(item => ({
      ...item,
      content: tryParseJSON(item.content)
    }));
  } catch (error) {
    console.error('[知识库] 获取分类知识失败:', error.message);
    return [];
  }
}

/**
 * 根据 ID 获取知识
 * @param {number} id - 知识 ID
 * @returns {Object|null} 知识条目
 */
function getKnowledgeById(id) {
  try {
    const sql = `SELECT * FROM knowledge_base WHERE id = ?`;
    const result = db.prepare(sql).get(id);

    if (result) {
      return {
        ...result,
        content: tryParseJSON(result.content)
      };
    }
    return null;
  } catch (error) {
    console.error('[知识库] 获取知识失败:', error.message);
    return null;
  }
}

/**
 * 添加知识条目
 * @param {Object} knowledge - 知识数据
 * @returns {Object} 添加结果
 */
function addKnowledge(knowledge) {
  const {
    category,
    name,
    name_en = null,
    content,
    tags = '',
    quality_score = 0.8
  } = knowledge;

  if (!category || !name || !content) {
    throw new Error('缺少必要字段: category, name, content');
  }

  try {
    const sql = `
      INSERT INTO knowledge_base (category, name, name_en, content, tags, quality_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const contentStr = typeof content === 'object' ? JSON.stringify(content) : content;

    const result = db.prepare(sql).run(
      category, name, name_en, contentStr, tags, quality_score
    );

    return {
      success: true,
      id: result.lastInsertRowid
    };
  } catch (error) {
    console.error('[知识库] 添加知识失败:', error.message);
    throw error;
  }
}

/**
 * 更新知识条目
 * @param {number} id - 知识 ID
 * @param {Object} updates - 更新数据
 * @returns {Object} 更新结果
 */
function updateKnowledge(id, updates) {
  const allowedFields = ['name', 'name_en', 'content', 'tags', 'quality_score', 'is_active'];
  const updateFields = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = ?`);
      if (key === 'content' && typeof value === 'object') {
        params.push(JSON.stringify(value));
      } else {
        params.push(value);
      }
    }
  }

  if (updateFields.length === 0) {
    throw new Error('没有有效的更新字段');
  }

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  try {
    const sql = `UPDATE knowledge_base SET ${updateFields.join(', ')} WHERE id = ?`;
    const result = db.prepare(sql).run(...params);

    return {
      success: true,
      changes: result.changes
    };
  } catch (error) {
    console.error('[知识库] 更新知识失败:', error.message);
    throw error;
  }
}

/**
 * 删除知识条目
 * @param {number} id - 知识 ID
 * @returns {Object} 删除结果
 */
function deleteKnowledge(id) {
  try {
    const sql = `DELETE FROM knowledge_base WHERE id = ?`;
    const result = db.prepare(sql).run(id);

    return {
      success: true,
      changes: result.changes
    };
  } catch (error) {
    console.error('[知识库] 删除知识失败:', error.message);
    throw error;
  }
}

/**
 * 增加知识使用次数
 * @param {number} id - 知识 ID
 */
function incrementUsageCount(id) {
  try {
    const sql = `UPDATE knowledge_base SET usage_count = usage_count + 1 WHERE id = ?`;
    db.prepare(sql).run(id);
  } catch (error) {
    console.error('[知识库] 更新使用次数失败:', error.message);
  }
}

/**
 * 批量增加使用次数
 * @param {Array<number>} ids - 知识 ID 列表
 */
function incrementUsageCountBatch(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;

  try {
    const placeholders = ids.map(() => '?').join(',');
    const sql = `UPDATE knowledge_base SET usage_count = usage_count + 1 WHERE id IN (${placeholders})`;
    db.prepare(sql).run(...ids);
  } catch (error) {
    console.error('[知识库] 批量更新使用次数失败:', error.message);
  }
}

/**
 * 获取相关知识
 * @param {number} sourceId - 源知识 ID
 * @param {string} relationType - 关系类型
 * @returns {Array} 相关知识列表
 */
function getRelatedKnowledge(sourceId, relationType = null) {
  try {
    let sql = `
      SELECT kb.*, kr.relation_type, kr.weight
      FROM knowledge_base kb
      JOIN knowledge_relations kr ON kb.id = kr.target_id
      WHERE kr.source_id = ?
    `;
    const params = [sourceId];

    if (relationType) {
      sql += ` AND kr.relation_type = ?`;
      params.push(relationType);
    }

    sql += ` ORDER BY kr.weight DESC`;

    const results = db.prepare(sql).all(...params);

    return results.map(item => ({
      ...item,
      content: tryParseJSON(item.content)
    }));
  } catch (error) {
    console.error('[知识库] 获取相关知识失败:', error.message);
    return [];
  }
}

/**
 * 添加知识关联
 * @param {number} sourceId - 源知识 ID
 * @param {number} targetId - 目标知识 ID
 * @param {string} relationType - 关系类型
 * @param {number} weight - 权重
 */
function addKnowledgeRelation(sourceId, targetId, relationType, weight = 1.0) {
  try {
    const sql = `
      INSERT OR REPLACE INTO knowledge_relations (source_id, target_id, relation_type, weight)
      VALUES (?, ?, ?, ?)
    `;
    db.prepare(sql).run(sourceId, targetId, relationType, weight);
  } catch (error) {
    console.error('[知识库] 添加关联失败:', error.message);
  }
}

/**
 * 智能检索 - 根据场景描述检索相关知识
 * @param {string} description - 场景描述
 * @returns {Object} 检索结果
 */
function smartSearch(description) {
  const result = {
    templates: [],
    promptPatterns: [],
    bestPractices: [],
    keywords: []
  };

  // 提取关键词
  const keywords = extractKeywords(description);
  result.keywords = keywords;

  // 搜索场景模板
  for (const keyword of keywords) {
    const templates = searchKnowledge(keyword, {
      category: KNOWLEDGE_CATEGORIES.SCENE_TEMPLATE,
      limit: 3
    });
    result.templates.push(...templates);
  }

  // 去重
  result.templates = deduplicateById(result.templates);

  // 搜索 Prompt 模式
  const promptKeywords = ['人脸', '风格', '背景', '质量'];
  for (const keyword of promptKeywords) {
    if (description.includes(keyword) || keywords.some(k => k.includes(keyword))) {
      const patterns = searchKnowledge(keyword, {
        category: KNOWLEDGE_CATEGORIES.PROMPT_PATTERN,
        limit: 2
      });
      result.promptPatterns.push(...patterns);
    }
  }
  result.promptPatterns = deduplicateById(result.promptPatterns);

  // 获取最佳实践
  result.bestPractices = getKnowledgeByCategory(KNOWLEDGE_CATEGORIES.BEST_PRACTICE, 3);

  return result;
}

/**
 * 提取关键词
 * @param {string} text - 文本
 * @returns {Array<string>} 关键词列表
 */
function extractKeywords(text) {
  // 预定义的关键词映射
  const keywordMap = {
    '证件': ['证件照', 'ID'],
    '职业': ['职业照', '商务', '正装'],
    '写真': ['写真', '艺术', '人像'],
    '春节': ['春节', '新年', '红色', '喜庆'],
    '中秋': ['中秋', '月亮', '团圆'],
    '圣诞': ['圣诞', '雪', '节日'],
    '婚纱': ['婚纱', '婚礼', '浪漫'],
    '宠物': ['宠物', '萌宠', '动物'],
    '全家福': ['全家福', '家庭', '合影'],
    '商务': ['商务', '职业', '正式'],
    '休闲': ['休闲', '日常', '生活'],
    '复古': ['复古', '怀旧', '经典'],
    '时尚': ['时尚', '潮流', '现代']
  };

  const keywords = [];

  for (const [key, values] of Object.entries(keywordMap)) {
    if (text.includes(key)) {
      keywords.push(...values);
    }
  }

  // 如果没有匹配到预定义关键词，使用简单分词
  if (keywords.length === 0) {
    // 简单的中文分词（按常见词长度）
    const words = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
    keywords.push(...words.slice(0, 5));
  }

  return [...new Set(keywords)];
}

/**
 * 根据 ID 去重
 * @param {Array} items - 条目列表
 * @returns {Array} 去重后的列表
 */
function deduplicateById(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

/**
 * 尝试解析 JSON
 * @param {string} str - JSON 字符串
 * @returns {Object|string} 解析结果
 */
function tryParseJSON(str) {
  if (typeof str !== 'string') return str;

  try {
    return JSON.parse(str);
  } catch (e) {
    return str;
  }
}

// ============================================
// Agent 任务管理
// ============================================

/**
 * 创建 Agent 任务
 * @param {string} description - 用户描述
 * @returns {Object} 任务信息
 */
function createAgentTask(description) {
  if (!db) {
    throw new Error('数据库未初始化');
  }

  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const sql = `
      INSERT INTO agent_tasks (id, user_description, status, current_step, progress)
      VALUES (?, ?, 'pending', 'init', 0)
    `;
    db.prepare(sql).run(taskId, description);

    return {
      task_id: taskId,
      status: 'pending'
    };
  } catch (error) {
    console.error('[知识库] 创建任务失败:', error.message);
    throw error;
  }
}

/**
 * 更新 Agent 任务状态
 * @param {string} taskId - 任务 ID
 * @param {Object} updates - 更新数据
 */
function updateAgentTask(taskId, updates) {
  if (!db) {
    console.error('[知识库] 数据库未初始化，无法更新任务');
    return;
  }

  const allowedFields = [
    'status', 'current_step', 'progress', 'config_result',
    'images_result', 'review_score', 'iterations', 'error_message',
    'knowledge_used', 'execution_log', 'completed_at', 'step_outputs'
  ];

  const updateFields = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = ?`);
      if (typeof value === 'object') {
        params.push(JSON.stringify(value));
      } else {
        params.push(value);
      }
    }
  }

  if (updateFields.length === 0) return;

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(taskId);

  try {
    const sql = `UPDATE agent_tasks SET ${updateFields.join(', ')} WHERE id = ?`;
    console.log('[知识库] 更新任务:', taskId, 'fields:', Object.keys(updates).join(','));
    const result = db.prepare(sql).run(...params);
    console.log('[知识库] 更新结果:', result.changes, '行受影响');
  } catch (error) {
    console.error('[知识库] 更新任务失败:', error.message);
  }
}

/**
 * 获取 Agent 任务
 * @param {string} taskId - 任务 ID
 * @returns {Object|null} 任务信息
 */
function getAgentTask(taskId) {
  if (!db) {
    console.error('[知识库] 数据库未初始化，无法获取任务');
    return null;
  }

  try {
    const sql = `SELECT * FROM agent_tasks WHERE id = ?`;
    const result = db.prepare(sql).get(taskId);

    if (result) {
      return {
        ...result,
        config_result: tryParseJSON(result.config_result),
        images_result: tryParseJSON(result.images_result),
        execution_log: tryParseJSON(result.execution_log),
        step_outputs: tryParseJSON(result.step_outputs)
      };
    }
    return null;
  } catch (error) {
    console.error('[知识库] 获取任务失败:', error.message);
    return null;
  }
}

/**
 * 保存生成历史
 * @param {Object} history - 历史数据
 */
function saveGenerationHistory(history) {
  const {
    task_id,
    input_description,
    generated_config,
    knowledge_used,
    user_feedback = null,
    final_config = null,
    is_adopted = 0
  } = history;

  try {
    const sql = `
      INSERT INTO generation_history
      (task_id, input_description, generated_config, knowledge_used, user_feedback, final_config, is_adopted)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.prepare(sql).run(
      task_id,
      input_description,
      typeof generated_config === 'object' ? JSON.stringify(generated_config) : generated_config,
      knowledge_used,
      user_feedback,
      final_config ? JSON.stringify(final_config) : null,
      is_adopted
    );
  } catch (error) {
    console.error('[知识库] 保存历史失败:', error.message);
  }
}

module.exports = {
  initKnowledgeBase,
  KNOWLEDGE_CATEGORIES,

  // 知识管理
  searchKnowledge,
  getKnowledgeByCategory,
  getKnowledgeById,
  addKnowledge,
  updateKnowledge,
  deleteKnowledge,
  incrementUsageCount,
  incrementUsageCountBatch,

  // 知识关联
  getRelatedKnowledge,
  addKnowledgeRelation,

  // 智能检索
  smartSearch,
  extractKeywords,

  // 任务管理
  createAgentTask,
  updateAgentTask,
  getAgentTask,
  saveGenerationHistory
};
