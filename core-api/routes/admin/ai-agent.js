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

// 敏感词列表 - 用于输入内容安全检测
const SENSITIVE_KEYWORDS = [
  // 版权相关
  'disney', 'mickey', 'marvel', 'avengers', 'dc comics', 'batman', 'superman',
  'pokemon', 'pikachu', 'naruto', 'one piece', 'dragon ball', 'anime character',
  'celebrity', 'famous person', 'movie star', 'singer', 'politician',
  '迪士尼', '漫威', '皮卡丘', '海贼王', '火影', '龙珠', '明星', '名人',
  // 色情相关
  'nude', 'naked', 'sexy', 'erotic', 'porn', 'nsfw', 'adult content',
  '裸体', '色情', '性感', '成人', '暴露', '情色',
  // 暴力相关
  'gore', 'blood', 'violent', 'weapon', 'gun', 'knife', 'murder', 'kill',
  '暴力', '血腥', '武器', '枪', '刀', '杀', '死亡',
  // 儿童相关敏感
  'child abuse', 'minor', 'underage',
  '虐童', '未成年',
  // 其他敏感
  'hate', 'racist', 'nazi', 'terrorist', 'drug', 'illegal',
  '仇恨', '种族', '恐怖', '毒品', '非法', '政治'
];

/**
 * 内容安全检查
 * @param {string} text - 要检查的文本
 * @returns {Object} { safe: boolean, message: string }
 */
function checkContentSafety(text) {
  if (!text) return { safe: true };

  const lowerText = text.toLowerCase();

  for (const keyword of SENSITIVE_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return {
        safe: false,
        message: `内容包含敏感词"${keyword}"，请修改后重试。为保护版权和遵守法规，不支持生成涉及版权角色、真实名人、色情、暴力等内容的图片。`
      };
    }
  }

  return { safe: true };
}

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

    if (!description || description.trim().length < 1) {
      return res.status(400).json({
        code: 400,
        message: '请提供场景描述'
      });
    }

    // 内容安全审核
    const safetyCheck = checkContentSafety(description);
    if (!safetyCheck.safe) {
      return res.status(400).json({
        code: 400,
        message: safetyCheck.message
      });
    }

    console.log('[AI Agent API] 收到生成请求:', description.substring(0, 50));

    // 异步生成（返回任务 ID）
    if (options.async) {
      const { createAgentTask, updateAgentTask } = require('../../lib/knowledge-base');
      const task = createAgentTask(description);
      console.log('[AI Agent API] 创建异步任务:', task.task_id);

      // 在后台执行生成，传入已创建的 taskId
      // 使用 setTimeout 确保异步执行
      setTimeout(async () => {
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
      }, 0);

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

/**
 * 生成模板图片（封面图/参考图）- 需要扣费
 * POST /api/admin/ai-agent/generate-image
 */
router.post('/generate-image', async (req, res) => {
  try {
    const { description, type, ratio, templateName, templateDescription, userId } = req.body;

    if (!description && !templateName) {
      return res.status(400).json({
        code: 400,
        message: '请提供模板描述'
      });
    }

    if (!type || !['cover', 'reference'].includes(type)) {
      return res.status(400).json({
        code: 400,
        message: '请指定图片类型 (cover 或 reference)'
      });
    }

    // 内容安全审核 - 检查敏感词
    const fullDescription = templateDescription
      ? `${templateName || '模板'}：${templateDescription}`
      : (templateName || description);

    const contentCheckResult = checkContentSafety(fullDescription);
    if (!contentCheckResult.safe) {
      return res.status(400).json({
        code: 400,
        message: contentCheckResult.message || '内容包含敏感信息，请修改后重试'
      });
    }

    // 图片生成费用
    const IMAGE_COST = 5;

    // 如果有 userId，检查并扣除积分
    if (userId) {
      const db = require('../../config/database').getDb();
      const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);

      if (!user) {
        return res.status(404).json({
          code: 404,
          message: '用户不存在'
        });
      }

      if (user.points < IMAGE_COST) {
        return res.status(400).json({
          code: 400,
          message: `醒币不足，生成图片需要 ${IMAGE_COST} 醒币`
        });
      }

      // 扣除积分
      db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(IMAGE_COST, userId);

      // 记录积分变动
      db.prepare(`
        INSERT INTO points_records (id, user_id, type, amount, balance_after, description, created_at)
        VALUES (?, ?, 'consume', ?, ?, ?, datetime('now'))
      `).run(
        `pr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        -IMAGE_COST,
        user.points - IMAGE_COST,
        `AI生成${type === 'cover' ? '封面图' : '参考图'}`
      );
    }

    // 根据类型和比例确定尺寸
    const sizeMap = {
      '1:1': { width: 1024, height: 1024 },
      '3:4': { width: 768, height: 1024 },
      '4:3': { width: 1024, height: 768 },
      '9:16': { width: 576, height: 1024 },
      '16:9': { width: 1024, height: 576 }
    };
    const size = sizeMap[ratio] || sizeMap['1:1'];

    // 调用图片生成 Agent
    const ImageAgent = require('../../lib/agents/image-agent');
    const imageAgent = new ImageAgent();

    const imageResult = await imageAgent.generateSingleImage({
      description: fullDescription,
      type,
      width: size.width,
      height: size.height,
      style: type === 'cover' ? 'cover_art' : 'reference_style'
    });

    if (!imageResult.success) {
      // 如果生成失败，退还积分
      if (userId) {
        const db = require('../../config/database').getDb();
        db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(IMAGE_COST, userId);
        const updatedUser = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
        db.prepare(`
          INSERT INTO points_records (id, user_id, type, amount, balance_after, description, created_at)
          VALUES (?, ?, 'refund', ?, ?, ?, datetime('now'))
        `).run(
          `pr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId,
          IMAGE_COST,
          updatedUser.points,
          'AI生成图片失败退款'
        );
      }

      throw new Error(imageResult.error || '图片生成失败');
    }

    res.json({
      code: 200,
      data: {
        url: imageResult.url,
        type,
        ratio,
        cost: IMAGE_COST
      }
    });

  } catch (error) {
    console.error('[AI Agent API] 模板图片生成失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

/**
 * AI 优化 Prompt
 * POST /api/admin/ai-agent/optimize-prompt
 */
router.post('/optimize-prompt', async (req, res) => {
  try {
    const { currentPrompt, negativePrompt, userFeedback, templateName, templateDescription } = req.body;

    if (!currentPrompt) {
      return res.status(400).json({
        code: 400,
        message: '请提供当前 Prompt'
      });
    }

    if (!userFeedback) {
      return res.status(400).json({
        code: 400,
        message: '请提供优化建议'
      });
    }

    // 内容安全检查
    const safetyCheck = checkContentSafety(userFeedback);
    if (!safetyCheck.safe) {
      return res.status(400).json({
        code: 400,
        message: safetyCheck.message
      });
    }

    // 调用 AI 优化 Prompt
    const axios = require('axios');
    const AI_API_KEY = process.env.AI_API_KEY || '';
    const AI_API_BASE = process.env.AI_API_BASE || 'https://api.vectorengine.ai';

    const optimizePrompt = `你是一个专业的 AI 图片生成 Prompt 优化专家。

当前模板信息：
- 模板名称：${templateName || '未命名'}
- 模板描述：${templateDescription || '无'}

当前 Prompt 模板：
${currentPrompt}

当前负面提示词：
${negativePrompt || '无'}

用户反馈/优化需求：
${userFeedback}

请根据用户的反馈优化 Prompt，注意：
1. 保留原有的变量引用格式 {{变量名}}，不要修改变量名
2. 只针对用户提到的问题进行局部优化，不要大幅改动
3. 保持 Prompt 的专业性和有效性
4. 如果用户的需求不合理或可能导致不良结果，请适当调整

请以 JSON 格式返回优化后的结果：
{
  "prompt_template": "优化后的 Prompt 模板",
  "negative_prompt": "优化后的负面提示词",
  "changes_summary": "简要说明做了哪些修改"
}`;

    const response = await axios.post(
      `${AI_API_BASE}/v1beta/models/gemini-3-flash-preview:generateContent`,
      {
        contents: [{ parts: [{ text: optimizePrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`
        },
        timeout: 30000
      }
    );

    // 解析响应
    const parts = response.data.candidates?.[0]?.content?.parts || [];
    const textParts = parts.filter(p => p.text && !p.thought);
    if (textParts.length === 0) {
      throw new Error('AI 返回内容为空');
    }

    const responseText = textParts[textParts.length - 1].text;

    // 尝试解析 JSON
    let result;
    try {
      // 尝试直接解析
      result = JSON.parse(responseText);
    } catch (e) {
      // 尝试提取 JSON 块
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        const braceMatch = responseText.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          result = JSON.parse(braceMatch[0]);
        } else {
          throw new Error('无法解析 AI 响应');
        }
      }
    }

    res.json({
      code: 200,
      data: {
        prompt_template: result.prompt_template || currentPrompt,
        negative_prompt: result.negative_prompt || negativePrompt,
        changes_summary: result.changes_summary || '已优化'
      }
    });

  } catch (error) {
    console.error('[AI Agent API] Prompt 优化失败:', error.message);
    res.status(500).json({
      code: 500,
      message: error.message
    });
  }
});

/**
 * 局部修改配置
 * POST /api/admin/ai-agent/partial-modify
 * 支持修改步骤配置或 Prompt 配置
 */
router.post('/partial-modify', async (req, res) => {
  try {
    const { target, instruction, globalContext } = req.body;

    if (!target || !instruction || !globalContext) {
      return res.status(400).json({
        code: 400,
        message: '缺少必要参数: target, instruction, globalContext'
      });
    }

    if (!['steps', 'prompt'].includes(target)) {
      return res.status(400).json({
        code: 400,
        message: '不支持的修改目标，仅支持 steps 或 prompt'
      });
    }

    // 内容安全检查
    const safetyCheck = checkContentSafety(instruction);
    if (!safetyCheck.safe) {
      return res.status(400).json({
        code: 400,
        message: safetyCheck.message
      });
    }

    console.log('[AI Agent API] 局部修改请求:', { target, instruction: instruction.substring(0, 50) });

    const axios = require('axios');
    const AI_API_KEY = process.env.AI_API_KEY || '';
    const AI_API_BASE = process.env.AI_API_BASE || 'https://api.vectorengine.ai';

    let result;

    if (target === 'steps') {
      // 修改步骤配置
      const modifyStepsPrompt = `你是一个模板配置专家。用户想要修改模板的操作步骤配置。

当前模板全局配置：
- 模板名称：${globalContext.name || '未命名'}
- 模板描述：${globalContext.description || '无'}
- 当前步骤配置：
${JSON.stringify(globalContext.steps || [], null, 2)}
- 当前 Prompt 模板：${globalContext.prompt_template || '无'}

用户的修改指令：${instruction}

请根据用户的指令修改步骤配置，返回修改后的完整步骤数组。

注意：
1. 保持步骤结构的完整性
2. 每个步骤必须包含以下字段：
   - step_key: 唯一标识（英文，如 upload_photo, select_background）
   - title: 步骤标题（中文）
   - component_type: 组件类型，可选值：image_upload, gender_select, tags, image_tags, dice_roll
   - is_required: 是否必填（布尔值）
3. 如果组件类型是 tags 或 image_tags，需要包含 options 数组，每个选项包含 label 和 value
4. 如果是添加新步骤，请确保 step_key 唯一且有意义
5. 如果修改涉及到 Prompt 中的变量引用，请在返回中说明

请直接返回 JSON 格式：
{
  "steps": [步骤数组],
  "prompt_variables_changed": ["如果有变量变化，列出变化的变量名"]
}`;

      const response = await axios.post(
        `${AI_API_BASE}/v1beta/models/gemini-3-flash-preview:generateContent`,
        {
          contents: [{ parts: [{ text: modifyStepsPrompt }] }],
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
          timeout: 30000
        }
      );

      const parts = response.data.candidates?.[0]?.content?.parts || [];
      const textParts = parts.filter(p => p.text && !p.thought);
      if (textParts.length === 0) {
        throw new Error('AI 返回内容为空');
      }

      const responseText = textParts[textParts.length - 1].text;
      result = parseJsonResponse(responseText);

    } else if (target === 'prompt') {
      // 修改 Prompt 配置
      const modifyPromptPrompt = `你是一个 AI 图片生成 Prompt 专家。用户想要修改模板的 Prompt 配置。

当前模板全局配置：
- 模板名称：${globalContext.name || '未命名'}
- 模板描述：${globalContext.description || '无'}
- 操作步骤：
${JSON.stringify(globalContext.steps || [], null, 2)}
- 当前 Prompt 模板：${globalContext.prompt_template || '无'}
- 当前负面提示词：${globalContext.negative_prompt || '无'}

用户的修改指令：${instruction}

请根据用户的指令修改 Prompt 配置。

注意：
1. 保持 Prompt 中的变量引用格式 {{变量名}}，变量名应与步骤中的 step_key 对应
2. 只针对用户提到的问题进行局部优化，不要大幅改动
3. 保持 Prompt 的专业性和有效性
4. 负面提示词用于排除不想要的效果

请返回 JSON 格式：
{
  "prompt_template": "修改后的 Prompt 模板",
  "negative_prompt": "修改后的负面提示词"
}`;

      const response = await axios.post(
        `${AI_API_BASE}/v1beta/models/gemini-3-flash-preview:generateContent`,
        {
          contents: [{ parts: [{ text: modifyPromptPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AI_API_KEY}`
          },
          timeout: 30000
        }
      );

      const parts = response.data.candidates?.[0]?.content?.parts || [];
      const textParts = parts.filter(p => p.text && !p.thought);
      if (textParts.length === 0) {
        throw new Error('AI 返回内容为空');
      }

      const responseText = textParts[textParts.length - 1].text;
      result = parseJsonResponse(responseText);
    }

    console.log('[AI Agent API] 局部修改成功:', target);

    res.json({
      code: 200,
      data: result
    });

  } catch (error) {
    console.error('[AI Agent API] 局部修改失败:', error.message);
    res.status(500).json({
      code: 500,
      message: '修改失败: ' + error.message
    });
  }
});

/**
 * 解析 JSON 响应的辅助函数
 */
function parseJsonResponse(responseText) {
  try {
    // 尝试直接解析
    return JSON.parse(responseText);
  } catch (e) {
    // 尝试提取 JSON 块
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    // 尝试提取花括号内容
    const braceMatch = responseText.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return JSON.parse(braceMatch[0]);
    }
    throw new Error('无法解析 AI 响应');
  }
}

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
