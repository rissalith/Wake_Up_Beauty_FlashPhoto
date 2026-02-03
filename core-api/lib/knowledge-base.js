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

  // 执行迁移脚本
  const migrationPath = path.join(__dirname, '../migrations/add-knowledge-base.sql');
  if (fs.existsSync(migrationPath)) {
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // 分割 SQL 语句并执行
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        db.exec(statement);
      } catch (error) {
        // 忽略已存在的表/索引错误
        if (!error.message.includes('already exists')) {
          console.warn('[知识库] 执行SQL警告:', error.message.substring(0, 100));
        }
      }
    }

    console.log('[知识库] 初始化完成');
  }
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
  const allowedFields = [
    'status', 'current_step', 'progress', 'config_result',
    'images_result', 'review_score', 'iterations', 'error_message',
    'knowledge_used', 'execution_log', 'completed_at'
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
    db.prepare(sql).run(...params);
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
  try {
    const sql = `SELECT * FROM agent_tasks WHERE id = ?`;
    const result = db.prepare(sql).get(taskId);

    if (result) {
      return {
        ...result,
        config_result: tryParseJSON(result.config_result),
        images_result: tryParseJSON(result.images_result),
        execution_log: tryParseJSON(result.execution_log)
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
