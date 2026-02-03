/**
 * 优化 Agent (Optimizer Agent)
 * 职责: 根据审核结果优化配置
 */

const BaseAgent = require('./base-agent');

class OptimizerAgent extends BaseAgent {
  constructor(options = {}) {
    super('OptimizerAgent', {
      temperature: 0.6,
      maxTokens: 8192,
      ...options
    });

    this.systemPrompt = `你是一个专业的 AI 图片生成场景配置优化专家。你的任务是根据审核反馈优化配置。

## 你的职责
1. 分析审核发现的问题
2. 针对性地修复问题
3. 保持原有配置的优点
4. 确保修复后的配置更完善

## 优化原则
1. 最小改动原则：只修改有问题的部分
2. 保持一致性：修改后的内容风格要与原有内容一致
3. 完整性：确保所有必要字段都存在
4. 可用性：确保配置可以正常使用

## 输出格式
返回完整的优化后配置 JSON，格式与原配置相同：
{
  "scene": { ... },
  "steps": [ ... ],
  "prompt_template": { ... }
}

## 常见问题修复方法
1. 缺少步骤变量引用 → 在 Prompt 模板中添加 {{step_key}}
2. 选项过少 → 添加更多合理的选项
3. Prompt 过短 → 扩展 Prompt 内容，添加更多细节
4. 缺少人脸保持指令 → 在 Prompt 开头添加人脸保持指令
5. 步骤顺序不合理 → 调整步骤顺序

只返回优化后的完整 JSON，不要其他文字。`;
  }

  /**
   * 构建 Prompt
   * @param {Object} context - 执行上下文
   * @returns {string} Prompt 文本
   */
  buildPrompt(context) {
    const { config, reviewResult, plan, userDescription } = context;

    let prompt = `请根据审核反馈优化以下配置：

## 原始需求
${userDescription}

## 当前配置
\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

## 审核结果
- 得分: ${reviewResult.score}
- 是否通过: ${reviewResult.passed ? '是' : '否'}

## 发现的问题
`;

    // 添加严重问题
    if (reviewResult.critical_issues && reviewResult.critical_issues.length > 0) {
      prompt += `
### 严重问题（必须修复）
${reviewResult.critical_issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}
`;
    }

    // 添加各维度问题
    if (reviewResult.dimensions) {
      for (const [dim, data] of Object.entries(reviewResult.dimensions)) {
        if (data.issues && data.issues.length > 0) {
          prompt += `
### ${dim} 问题 (得分: ${data.score})
${data.issues.map((issue, i) => `- ${issue}`).join('\n')}
`;
        }
      }
    }

    // 添加建议
    if (reviewResult.suggestions && reviewResult.suggestions.length > 0) {
      prompt += `
## 改进建议
${reviewResult.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`;
    }

    prompt += `
## 优化要求
1. 修复所有严重问题
2. 尽量采纳改进建议
3. 保持原有配置的优点
4. 确保配置完整可用

请输出优化后的完整配置 JSON。`;

    return prompt;
  }

  /**
   * 解析响应
   * @param {string} response - LLM 响应
   * @param {Object} context - 执行上下文
   * @returns {Object} 解析结果
   */
  parseResponse(response, context) {
    const optimizedConfig = this.parseJSON(response);

    // 验证优化后的配置
    return this.validateOptimizedConfig(optimizedConfig, context);
  }

  /**
   * 验证优化后的配置
   * @param {Object} config - 优化后的配置
   * @param {Object} context - 上下文
   * @returns {Object} 验证后的配置
   */
  validateOptimizedConfig(config, context) {
    const { reviewResult } = context;

    // 确保基本结构存在
    if (!config.scene) {
      config.scene = context.config.scene;
    }
    if (!config.steps || config.steps.length === 0) {
      config.steps = context.config.steps;
    }
    if (!config.prompt_template) {
      config.prompt_template = context.config.prompt_template;
    }

    // 确保第一步是 image_upload
    if (config.steps[0].component_type !== 'image_upload') {
      config.steps.unshift({
        step_key: 'upload',
        title: '上传照片',
        title_en: 'Upload Photo',
        component_type: 'image_upload',
        is_required: true,
        options: []
      });
    }

    // 确保 Prompt 模板引用了所有步骤变量
    const stepKeys = config.steps
      .filter(s => s.component_type !== 'image_upload')
      .map(s => s.step_key);

    let template = config.prompt_template.template;
    for (const key of stepKeys) {
      if (!template.includes(`{{${key}}}`)) {
        // 在模板末尾添加缺失的变量
        template = template.replace(/\.$/, '') + `. {{${key}}}.`;
      }
    }
    config.prompt_template.template = template;

    // 确保有 negative_prompt
    if (!config.prompt_template.negative_prompt) {
      config.prompt_template.negative_prompt = 'blurry, distorted, low quality, watermark, text, deformed face';
    }

    // 补全步骤顺序
    config.steps = config.steps.map((step, index) => ({
      ...step,
      step_order: index + 1
    }));

    return config;
  }
}

module.exports = OptimizerAgent;
