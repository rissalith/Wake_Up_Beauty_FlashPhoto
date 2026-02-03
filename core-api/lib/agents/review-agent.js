/**
 * 审核 Agent (Review Agent)
 * 职责: 检查配置质量，提出优化建议
 */

const BaseAgent = require('./base-agent');

class ReviewAgent extends BaseAgent {
  constructor(options = {}) {
    super('ReviewAgent', {
      temperature: 0.3, // 审核需要更确定性的输出
      ...options
    });

    this.systemPrompt = `你是一个专业的 AI 图片生成场景配置审核专家。你的任务是检查配置的质量和完整性，并提出改进建议。

## 审核维度
1. **结构完整性**: 检查必要字段是否存在
2. **步骤设计**: 检查步骤数量、顺序、类型是否合理
3. **选项质量**: 检查选项数量、描述是否充分
4. **Prompt 质量**: 检查 Prompt 模板是否有效
5. **用户体验**: 检查整体流程是否流畅

## 输出格式
{
  "passed": true/false,
  "score": 0-100,
  "dimensions": {
    "structure": { "score": 0-100, "issues": [] },
    "steps": { "score": 0-100, "issues": [] },
    "options": { "score": 0-100, "issues": [] },
    "prompt": { "score": 0-100, "issues": [] },
    "ux": { "score": 0-100, "issues": [] }
  },
  "critical_issues": ["严重问题1", "严重问题2"],
  "suggestions": ["建议1", "建议2"],
  "summary": "总体评价"
}

## 评分标准
- 90-100: 优秀，可直接使用
- 70-89: 良好，有小问题但可接受
- 50-69: 一般，需要改进
- 0-49: 不合格，需要重新生成

## 严重问题（会导致不通过）
- 缺少必要步骤（如 image_upload）
- Prompt 模板为空或无效
- 步骤数量过少（<2）或过多（>8）
- 选项缺失或描述不清

只返回 JSON，不要其他文字。`;
  }

  /**
   * 构建 Prompt
   * @param {Object} context - 执行上下文
   * @returns {string} Prompt 文本
   */
  buildPrompt(context) {
    const { config, plan, iteration } = context;

    let prompt = `请审核以下场景配置：

## 原始需求
${context.userDescription}

## 规划信息
- 场景类型: ${plan.scene_type}
- 场景名称: ${plan.scene_name}
- 预期步骤: ${plan.required_steps.join(', ')}
- 复杂度: ${plan.estimated_complexity}

## 当前配置
\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

## 审核要求
1. 检查配置是否满足原始需求
2. 检查步骤设计是否合理
3. 检查选项是否充分
4. 检查 Prompt 模板是否有效
5. 评估用户体验

当前是第 ${iteration + 1} 次审核。`;

    if (iteration > 0 && context.previousReview) {
      prompt += `

## 上次审核结果
${JSON.stringify(context.previousReview, null, 2)}

请检查之前的问题是否已修复。`;
    }

    return prompt;
  }

  /**
   * 解析响应
   * @param {string} response - LLM 响应
   * @param {Object} context - 执行上下文
   * @returns {Object} 解析结果
   */
  parseResponse(response, context) {
    const review = this.parseJSON(response);

    // 确保必要字段存在
    if (typeof review.passed !== 'boolean') {
      review.passed = review.score >= 70;
    }
    if (typeof review.score !== 'number') {
      review.score = review.passed ? 75 : 50;
    }
    if (!Array.isArray(review.critical_issues)) {
      review.critical_issues = [];
    }
    if (!Array.isArray(review.suggestions)) {
      review.suggestions = [];
    }

    // 额外的本地验证
    const localIssues = this.localValidation(context.config);
    if (localIssues.length > 0) {
      review.critical_issues.push(...localIssues);
      review.passed = false;
      review.score = Math.min(review.score, 60);
    }

    return review;
  }

  /**
   * 本地验证（不依赖 LLM）
   * @param {Object} config - 配置
   * @returns {Array<string>} 问题列表
   */
  localValidation(config) {
    const issues = [];

    // 检查 scene
    if (!config.scene || !config.scene.name) {
      issues.push('缺少场景名称');
    }

    // 检查 steps
    if (!Array.isArray(config.steps) || config.steps.length === 0) {
      issues.push('缺少步骤配置');
    } else {
      // 检查第一步是否是 image_upload
      if (config.steps[0].component_type !== 'image_upload') {
        issues.push('第一步必须是图片上传');
      }

      // 检查步骤数量
      if (config.steps.length < 2) {
        issues.push('步骤数量过少，至少需要2个步骤');
      }
      if (config.steps.length > 8) {
        issues.push('步骤数量过多，建议不超过8个');
      }

      // 检查每个步骤
      for (const step of config.steps) {
        if (!step.step_key) {
          issues.push(`步骤 "${step.title}" 缺少 step_key`);
        }
        if (!step.title) {
          issues.push('存在缺少标题的步骤');
        }
        // 非上传步骤应该有选项
        if (step.component_type !== 'image_upload') {
          if (!step.options || step.options.length === 0) {
            issues.push(`步骤 "${step.title}" 缺少选项`);
          } else if (step.options.length < 2) {
            issues.push(`步骤 "${step.title}" 选项过少，至少需要2个`);
          }
        }
      }
    }

    // 检查 prompt_template
    if (!config.prompt_template || !config.prompt_template.template) {
      issues.push('缺少 Prompt 模板');
    } else {
      const template = config.prompt_template.template;
      if (template.length < 50) {
        issues.push('Prompt 模板过短，可能不够详细');
      }

      // 检查是否引用了步骤变量
      const stepKeys = config.steps
        .filter(s => s.component_type !== 'image_upload')
        .map(s => s.step_key);

      for (const key of stepKeys) {
        if (!template.includes(`{{${key}}}`)) {
          issues.push(`Prompt 模板未引用步骤变量 {{${key}}}`);
        }
      }
    }

    return issues;
  }
}

module.exports = ReviewAgent;
