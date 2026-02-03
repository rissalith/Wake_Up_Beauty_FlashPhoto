/**
 * AI 自动审核模块
 * 使用 Gemini API 对模板内容进行自动审核
 *
 * 审核维度：
 * 1. 图片敏感性检测（封面图、参考图）
 * 2. 文字敏感性检测（名称、描述、标签）
 * 3. 流程完整性检测（步骤配置、Prompt 模板）
 */

const axios = require('axios');

// AI 服务配置
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_API_BASE = process.env.AI_API_BASE || 'https://api.vectorengine.ai';
const AI_REVIEW_MODEL = process.env.AI_REVIEW_MODEL || 'gemini-2.0-flash';

// 审核结果状态
const REVIEW_STATUS = {
  APPROVED: 'approved',      // 审核通过
  REJECTED: 'rejected',      // 审核拒绝
  MANUAL_REVIEW: 'manual',   // 需人工复核
  ERROR: 'error'             // 审核出错
};

// 审核维度
const REVIEW_DIMENSIONS = {
  IMAGE_SAFETY: 'image_safety',       // 图片安全
  TEXT_SAFETY: 'text_safety',         // 文字安全
  FLOW_COMPLETENESS: 'flow_complete', // 流程完整性
  QUALITY: 'quality'                  // 质量评估
};

/**
 * 审核模板内容
 * @param {Object} template - 模板数据
 * @param {Array} steps - 步骤数据
 * @param {Array} prompts - Prompt 模板数据
 * @returns {Object} 审核结果
 */
async function reviewTemplate(template, steps = [], prompts = []) {
  console.log(`[AI审核] 开始审核模板: ${template.name} (${template.id})`);
  const startTime = Date.now();

  const results = {
    templateId: template.id,
    status: REVIEW_STATUS.APPROVED,
    score: 100,
    dimensions: {},
    issues: [],
    reviewedAt: new Date().toISOString()
  };

  try {
    // 1. 审核图片安全性
    const imageResult = await reviewImages(template);
    results.dimensions[REVIEW_DIMENSIONS.IMAGE_SAFETY] = imageResult;
    if (!imageResult.passed) {
      results.issues.push(...imageResult.issues);
    }

    // 2. 审核文字安全性
    const textResult = await reviewText(template, steps);
    results.dimensions[REVIEW_DIMENSIONS.TEXT_SAFETY] = textResult;
    if (!textResult.passed) {
      results.issues.push(...textResult.issues);
    }

    // 3. 审核流程完整性
    const flowResult = reviewFlowCompleteness(template, steps, prompts);
    results.dimensions[REVIEW_DIMENSIONS.FLOW_COMPLETENESS] = flowResult;
    if (!flowResult.passed) {
      results.issues.push(...flowResult.issues);
    }

    // 4. 计算综合得分和最终状态
    const scores = Object.values(results.dimensions).map(d => d.score);
    results.score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // 任何维度不通过则整体不通过
    const allPassed = Object.values(results.dimensions).every(d => d.passed);
    if (!allPassed) {
      results.status = REVIEW_STATUS.REJECTED;
    }

    const duration = Date.now() - startTime;
    console.log(`[AI审核] 审核完成: ${results.status}, 得分: ${results.score}, 耗时: ${duration}ms`);

  } catch (error) {
    console.error('[AI审核] 审核出错:', error.message);
    results.status = REVIEW_STATUS.ERROR;
    results.score = 0;
    results.issues.push({
      dimension: 'system',
      type: 'error',
      message: '审核服务异常: ' + error.message
    });
  }

  return results;
}

/**
 * 审核图片安全性
 */
async function reviewImages(template) {
  const result = {
    passed: true,
    score: 100,
    issues: []
  };

  const imagesToReview = [];

  if (template.cover_image) {
    imagesToReview.push({ type: '封面图', url: template.cover_image });
  }
  if (template.reference_image) {
    imagesToReview.push({ type: '参考图', url: template.reference_image });
  }

  if (imagesToReview.length === 0) {
    result.passed = false;
    result.score = 0;
    result.issues.push({
      dimension: REVIEW_DIMENSIONS.IMAGE_SAFETY,
      type: 'missing',
      message: '缺少封面图'
    });
    return result;
  }

  // 使用 AI 审核每张图片
  for (const img of imagesToReview) {
    try {
      const imageReview = await reviewImageWithAI(img.url, img.type);
      if (!imageReview.safe) {
        result.passed = false;
        result.score = Math.min(result.score, imageReview.score);
        result.issues.push({
          dimension: REVIEW_DIMENSIONS.IMAGE_SAFETY,
          type: 'unsafe_content',
          message: `${img.type}包含不当内容: ${imageReview.reason}`,
          details: imageReview.categories
        });
      }
    } catch (error) {
      console.warn(`[AI审核] 图片审核失败 (${img.type}):`, error.message);
      // 图片审核失败不阻断，但记录警告
      result.issues.push({
        dimension: REVIEW_DIMENSIONS.IMAGE_SAFETY,
        type: 'warning',
        message: `${img.type}审核失败: ${error.message}`
      });
    }
  }

  return result;
}

/**
 * 使用 AI 审核单张图片
 */
async function reviewImageWithAI(imageUrl, imageType) {
  if (!AI_API_KEY) {
    console.warn('[AI审核] AI_API_KEY 未配置，跳过图片审核');
    return { safe: true, score: 100, reason: '审核服务未配置' };
  }

  try {
    // 下载图片并转为 base64
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
    const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';

    // 构建审核 Prompt
    const reviewPrompt = `你是一个内容安全审核专家。请审核这张图片是否适合作为${imageType}在公开平台展示。

请检查以下方面：
1. 是否包含色情、裸露或性暗示内容
2. 是否包含暴力、血腥或恐怖内容
3. 是否包含政治敏感内容
4. 是否包含歧视、仇恨言论相关内容
5. 是否包含违法违规内容（如毒品、武器等）
6. 图片质量是否合格（清晰度、构图等）

请以 JSON 格式返回审核结果：
{
  "safe": true/false,
  "score": 0-100,
  "reason": "简短说明",
  "categories": {
    "sexual": false,
    "violence": false,
    "political": false,
    "hate": false,
    "illegal": false
  }
}

只返回 JSON，不要其他内容。`;

    const requestData = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: imageBase64
            }
          },
          { text: reviewPrompt }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500
      }
    };

    const response = await axios.post(
      `${AI_API_BASE}/v1beta/models/${AI_REVIEW_MODEL}:generateContent`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`
        },
        timeout: 60000
      }
    );

    // 解析响应
    const textPart = response.data.candidates?.[0]?.content?.parts?.find(p => p.text);
    if (textPart) {
      // 提取 JSON
      const jsonMatch = textPart.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          safe: result.safe !== false,
          score: result.score || (result.safe ? 100 : 0),
          reason: result.reason || '',
          categories: result.categories || {}
        };
      }
    }

    // 默认通过
    return { safe: true, score: 100, reason: '审核完成' };

  } catch (error) {
    console.error('[AI审核] 图片审核 API 调用失败:', error.message);
    throw error;
  }
}

/**
 * 审核文字安全性
 */
async function reviewText(template, steps) {
  const result = {
    passed: true,
    score: 100,
    issues: []
  };

  // 收集所有需要审核的文字
  const textsToReview = [];

  if (template.name) textsToReview.push({ type: '模板名称', text: template.name });
  if (template.description) textsToReview.push({ type: '模板描述', text: template.description });
  if (template.tags) textsToReview.push({ type: '标签', text: template.tags });

  // 收集步骤中的文字
  for (const step of steps) {
    if (step.title) textsToReview.push({ type: `步骤"${step.title}"`, text: step.title });
    if (step.options) {
      for (const opt of step.options) {
        if (opt.label) textsToReview.push({ type: `选项"${opt.label}"`, text: opt.label });
      }
    }
  }

  if (textsToReview.length === 0) {
    return result;
  }

  // 合并文字进行批量审核
  const allText = textsToReview.map(t => `[${t.type}]: ${t.text}`).join('\n');

  try {
    const textReview = await reviewTextWithAI(allText);
    if (!textReview.safe) {
      result.passed = false;
      result.score = textReview.score;
      result.issues.push({
        dimension: REVIEW_DIMENSIONS.TEXT_SAFETY,
        type: 'unsafe_content',
        message: `文字内容包含不当内容: ${textReview.reason}`,
        details: textReview.flaggedItems
      });
    }
  } catch (error) {
    console.warn('[AI审核] 文字审核失败:', error.message);
    // 文字审核失败不阻断
    result.issues.push({
      dimension: REVIEW_DIMENSIONS.TEXT_SAFETY,
      type: 'warning',
      message: `文字审核失败: ${error.message}`
    });
  }

  return result;
}

/**
 * 使用 AI 审核文字内容
 */
async function reviewTextWithAI(text) {
  if (!AI_API_KEY) {
    console.warn('[AI审核] AI_API_KEY 未配置，跳过文字审核');
    return { safe: true, score: 100, reason: '审核服务未配置' };
  }

  try {
    const reviewPrompt = `你是一个内容安全审核专家。请审核以下文字内容是否适合在公开平台展示。

待审核内容：
${text}

请检查以下方面：
1. 是否包含色情、低俗内容
2. 是否包含暴力、恐怖内容
3. 是否包含政治敏感内容
4. 是否包含歧视、仇恨言论
5. 是否包含违法违规内容
6. 是否包含广告、垃圾信息
7. 是否包含个人隐私信息

请以 JSON 格式返回审核结果：
{
  "safe": true/false,
  "score": 0-100,
  "reason": "简短说明",
  "flaggedItems": ["问题项1", "问题项2"]
}

只返回 JSON，不要其他内容。`;

    const requestData = {
      contents: [{
        parts: [{ text: reviewPrompt }]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500
      }
    };

    const response = await axios.post(
      `${AI_API_BASE}/v1beta/models/${AI_REVIEW_MODEL}:generateContent`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`
        },
        timeout: 30000
      }
    );

    // 解析响应
    const textPart = response.data.candidates?.[0]?.content?.parts?.find(p => p.text);
    if (textPart) {
      const jsonMatch = textPart.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          safe: result.safe !== false,
          score: result.score || (result.safe ? 100 : 0),
          reason: result.reason || '',
          flaggedItems: result.flaggedItems || []
        };
      }
    }

    return { safe: true, score: 100, reason: '审核完成' };

  } catch (error) {
    console.error('[AI审核] 文字审核 API 调用失败:', error.message);
    throw error;
  }
}

/**
 * 审核流程完整性（本地检查，不需要 AI）
 */
function reviewFlowCompleteness(template, steps, prompts) {
  const result = {
    passed: true,
    score: 100,
    issues: []
  };

  // 检查基本信息
  if (!template.name || template.name.trim().length < 2) {
    result.passed = false;
    result.score -= 30;
    result.issues.push({
      dimension: REVIEW_DIMENSIONS.FLOW_COMPLETENESS,
      type: 'incomplete',
      message: '模板名称不能为空且至少2个字符'
    });
  }

  if (!template.cover_image) {
    result.passed = false;
    result.score -= 30;
    result.issues.push({
      dimension: REVIEW_DIMENSIONS.FLOW_COMPLETENESS,
      type: 'incomplete',
      message: '缺少封面图'
    });
  }

  if (!template.reference_image) {
    result.passed = false;
    result.score -= 20;
    result.issues.push({
      dimension: REVIEW_DIMENSIONS.FLOW_COMPLETENESS,
      type: 'incomplete',
      message: '缺少参考图'
    });
  }

  // 检查步骤配置
  if (!steps || steps.length === 0) {
    result.passed = false;
    result.score -= 20;
    result.issues.push({
      dimension: REVIEW_DIMENSIONS.FLOW_COMPLETENESS,
      type: 'incomplete',
      message: '缺少步骤配置'
    });
  } else {
    // 检查每个步骤是否有选项
    for (const step of steps) {
      if (!step.options || step.options.length === 0) {
        result.issues.push({
          dimension: REVIEW_DIMENSIONS.FLOW_COMPLETENESS,
          type: 'warning',
          message: `步骤"${step.title}"缺少选项配置`
        });
      }
    }
  }

  // 检查 Prompt 模板
  if (!prompts || prompts.length === 0) {
    result.passed = false;
    result.score -= 20;
    result.issues.push({
      dimension: REVIEW_DIMENSIONS.FLOW_COMPLETENESS,
      type: 'incomplete',
      message: '缺少 Prompt 模板配置'
    });
  } else {
    // 检查 Prompt 是否有效
    for (const prompt of prompts) {
      if (!prompt.template || prompt.template.trim().length < 10) {
        result.issues.push({
          dimension: REVIEW_DIMENSIONS.FLOW_COMPLETENESS,
          type: 'warning',
          message: `Prompt 模板"${prompt.name || '默认'}"内容过短`
        });
      }
    }
  }

  result.score = Math.max(0, result.score);
  return result;
}

/**
 * 生成审核报告
 */
function generateReviewReport(reviewResult) {
  const report = {
    summary: '',
    details: [],
    suggestions: []
  };

  if (reviewResult.status === REVIEW_STATUS.APPROVED) {
    report.summary = '审核通过，模板可以上架';
  } else if (reviewResult.status === REVIEW_STATUS.REJECTED) {
    report.summary = `审核不通过，发现 ${reviewResult.issues.length} 个问题`;

    // 生成详细问题列表
    for (const issue of reviewResult.issues) {
      report.details.push({
        type: issue.type,
        message: issue.message
      });

      // 生成修改建议
      if (issue.type === 'unsafe_content') {
        report.suggestions.push('请修改或替换包含不当内容的图片/文字');
      } else if (issue.type === 'incomplete') {
        report.suggestions.push(issue.message);
      }
    }
  } else if (reviewResult.status === REVIEW_STATUS.ERROR) {
    report.summary = '审核服务异常，请稍后重试';
  }

  return report;
}

module.exports = {
  reviewTemplate,
  reviewImages,
  reviewText,
  reviewFlowCompleteness,
  generateReviewReport,
  REVIEW_STATUS,
  REVIEW_DIMENSIONS
};
