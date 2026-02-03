/**
 * AI Agent API 路由
 * 提供场景配置自动生成的 API 接口
 */

const express = require('express');
const router = express.Router();

const AgentOrchestrator = require('../../lib/agent-orchestrator');
const {
  initKnowledgeBase,
  searchKnowledge,
  getKnowledgeByCategory,
  getKnowledgeById,
  addKnowledge,
  updateKnowledge,
  deleteKnowledge,
  smartSearch,
  KNOWLEDGE_CATEGORIES
} = require('../../lib/knowledge-base');

// 创建 Orchestrator 实例
const orchestrator = new AgentOrchestrator({
  maxIterations: 3,
  generateImages: true,
  saveHistory: true
});

// ============================================
// Agent 生成 API
// ============================================

/**
 * 生成场景配置
 * POST /api/admin/ai-agent/generate
 */
router.post('/generate', async (req, res) => {
  try {
    const { description, options = {} } = req.body;

    if (!description || description.trim().length < 5) {
      return res.status(400).json({
        code: 400,
        message: '请提供有效的场景描述（至少5个字符）'
      });
    }

    console.log('[AI Agent API] 收到生成请求:', description.substring(0, 50));

    // 异步生成（返回任务 ID）
    if (options.async) {
      const { createAgentTask, updateAgentTask } = require('../../lib/knowledge-base');
      const task = createAgentTask(description);
      console.log('[AI Agent API] 创建异步任务:', task.task_id);

      // 在后台执行生成，传入已创建的 taskId
      setImmediate(async () => {
        try {
          console.log('[AI Agent API] 开始后台执行任务:', task.task_id);
          await orchestrator.generateSceneConfig(description, { ...options, taskId: task.task_id });
          console.log('[AI Agent API] 后台任务完成:', task.task_id);
        } catch (error) {
          console.error('[AI Agent API] 后台生成失败:', error.message, error.stack);
          // 更新任务状态为失败
          try {
            updateAgentTask(task.task_id, {
              status: 'failed',
              error_message: error.message
            });
          } catch (e) {
            console.error('[AI Agent API] 更新失败状态失败:', e.message);
          }
        }
      });

      return res.json({
        code: 200,
        data: {
          task_id: task.task_id,
          status: 'processing',
          message: '任务已创建，请通过 /status 接口查询进度'
        }
      });
    }

    // 同步生成
    const result = await orchestrator.generateSceneConfig(description, options);

    if (result.success) {
      res.json({
        code: 200,
        data: {
          task_id: result.task_id,
          config: result.config,
          images: result.images,
          review: result.review,
          iterations: result.iterations,
          duration: result.duration
        }
      });
    } else {
      res.status(500).json({
        code: 500,
        message: result.error,
        task_id: result.task_id
      });
    }

  } catch (error) {
    console.error('[AI Agent API] 生成失败:', error.message);
    res.status(500).json({
      code: 500,
      message: '生成失败: ' + error.message
    });
  }
});

/**
 * 获取任务状态
 * GET /api/admin/ai-agent/status/:taskId
 */
router.get('/status/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const task = orchestrator.getTaskStatus(taskId);

    if (!task) {
      return res.status(404).json({
        code: 404,
        message: '任务不存在'
      });
    }

    res.json({
      code: 200,
      data: task
    });

  } catch (error) {
    console.error('[AI Agent API] 获取状态失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

/**
 * 仅生成规划（预览）
 * POST /api/admin/ai-agent/plan
 */
router.post('/plan', async (req, res) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({
        code: 400,
        message: '请提供场景描述'
      });
    }

    const result = await orchestrator.generatePlanOnly(description);

    res.json({
      code: 200,
      data: result
    });

  } catch (error) {
    console.error('[AI Agent API] 规划失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

/**
 * 审核配置
 * POST /api/admin/ai-agent/review
 */
router.post('/review', async (req, res) => {
  try {
    const { config, description } = req.body;

    if (!config) {
      return res.status(400).json({
        code: 400,
        message: '请提供配置'
      });
    }

    const result = await orchestrator.reviewConfigOnly(config, description || '');

    res.json({
      code: 200,
      data: result
    });

  } catch (error) {
    console.error('[AI Agent API] 审核失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

/**
 * 生成图片
 * POST /api/admin/ai-agent/generate-images
 */
router.post('/generate-images', async (req, res) => {
  try {
    const { config, plan } = req.body;

    if (!config) {
      return res.status(400).json({
        code: 400,
        message: '请提供配置'
      });
    }

    const defaultPlan = plan || {
      scene_type: 'custom',
      scene_name: config.scene?.name || '自定义场景',
      style_keywords: []
    };

    const result = await orchestrator.generateImagesOnly(config, defaultPlan);

    res.json({
      code: 200,
      data: result
    });

  } catch (error) {
    console.error('[AI Agent API] 图片生成失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

// ============================================
// 知识库管理 API
// ============================================

/**
 * 搜索知识库
 * GET /api/admin/ai-agent/knowledge/search
 */
router.get('/knowledge/search', (req, res) => {
  try {
    const { q, category, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json({
        code: 400,
        message: '请提供搜索关键词'
      });
    }

    const results = searchKnowledge(q, {
      category,
      limit: parseInt(limit)
    });

    res.json({
      code: 200,
      data: results
    });

  } catch (error) {
    console.error('[AI Agent API] 搜索失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

/**
 * 智能搜索
 * POST /api/admin/ai-agent/knowledge/smart-search
 */
router.post('/knowledge/smart-search', (req, res) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({
        code: 400,
        message: '请提供描述'
      });
    }

    const results = smartSearch(description);

    res.json({
      code: 200,
      data: results
    });

  } catch (error) {
    console.error('[AI Agent API] 智能搜索失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

/**
 * 获取知识分类列表
 * GET /api/admin/ai-agent/knowledge/categories
 */
router.get('/knowledge/categories', (req, res) => {
  res.json({
    code: 200,
    data: KNOWLEDGE_CATEGORIES
  });
});

/**
 * 获取分类下的知识
 * GET /api/admin/ai-agent/knowledge/category/:category
 */
router.get('/knowledge/category/:category', (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 20 } = req.query;

    const results = getKnowledgeByCategory(category, parseInt(limit));

    res.json({
      code: 200,
      data: results
    });

  } catch (error) {
    console.error('[AI Agent API] 获取分类知识失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

/**
 * 获取单个知识
 * GET /api/admin/ai-agent/knowledge/:id
 */
router.get('/knowledge/:id', (req, res) => {
  try {
    const { id } = req.params;
    const knowledge = getKnowledgeById(parseInt(id));

    if (!knowledge) {
      return res.status(404).json({
        code: 404,
        message: '知识不存在'
      });
    }

    res.json({
      code: 200,
      data: knowledge
    });

  } catch (error) {
    console.error('[AI Agent API] 获取知识失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

/**
 * 添加知识
 * POST /api/admin/ai-agent/knowledge
 */
router.post('/knowledge', (req, res) => {
  try {
    const { category, name, name_en, content, tags, quality_score } = req.body;

    if (!category || !name || !content) {
      return res.status(400).json({
        code: 400,
        message: '缺少必要字段: category, name, content'
      });
    }

    const result = addKnowledge({
      category,
      name,
      name_en,
      content,
      tags,
      quality_score
    });

    res.json({
      code: 200,
      data: result
    });

  } catch (error) {
    console.error('[AI Agent API] 添加知识失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

/**
 * 更新知识
 * PUT /api/admin/ai-agent/knowledge/:id
 */
router.put('/knowledge/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const result = updateKnowledge(parseInt(id), updates);

    res.json({
      code: 200,
      data: result
    });

  } catch (error) {
    console.error('[AI Agent API] 更新知识失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

/**
 * 删除知识
 * DELETE /api/admin/ai-agent/knowledge/:id
 */
router.delete('/knowledge/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = deleteKnowledge(parseInt(id));

    res.json({
      code: 200,
      data: result
    });

  } catch (error) {
    console.error('[AI Agent API] 删除知识失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

module.exports = router;
