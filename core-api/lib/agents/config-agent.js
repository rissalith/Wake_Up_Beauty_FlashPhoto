/**
 * 配置 Agent (Config Agent)
 * 职责: 根据计划生成具体的场景配置
 */

const BaseAgent = require('./base-agent');

class ConfigAgent extends BaseAgent {
  constructor(options = {}) {
    super('ConfigAgent', {
      temperature: 0.7,
      maxTokens: 8192, // 配置可能较长
      ...options
    });

    this.systemPrompt = `你是一个专业的 AI 图片生成场景配置专家。根据规划和知识库参考，生成完整的场景配置。

## 输出格式要求
必须返回有效的 JSON，包含 scene、steps、prompt_template 三个部分。

## 步骤类型说明
- image_upload: 图片上传（必须作为第一步）
- gender_select: 性别选择（预设男/女选项）
- tags: 标签选择（通用单选）
- image_tags: 图片标签选择（带图片的选项）
- dice_roll: 摇骰子（随机抽取）

## 配置规范
1. 每个场景必须以 image_upload 步骤开始
2. 建议在第二步包含 gender_select 步骤
3. 步骤数量控制在 3-6 个
4. 每个步骤的选项数量控制在 3-8 个
5. Prompt 模板必须使用 {{variable_name}} 引用步骤的 step_key
6. 必须提供 negative_prompt
7. **重要：所有文本都使用中文，包括 prompt_text 和 template**

## 数据结构
{
  "scene": {
    "name": "场景中文名称",
    "description": "场景中文描述",
    "points_cost": 50
  },
  "steps": [
    {
      "step_key": "upload",
      "title": "上传照片",
      "component_type": "image_upload",
      "is_required": true,
      "options": []
    },
    {
      "step_key": "gender",
      "title": "选择性别",
      "component_type": "gender_select",
      "is_required": true,
      "options": [
        { "label": "男", "value": "male", "prompt_text": "一位男性" },
        { "label": "女", "value": "female", "prompt_text": "一位女性" }
      ]
    },
    {
      "step_key": "background",
      "title": "选择背景",
      "component_type": "tags",
      "is_required": true,
      "options": [
        { "label": "喜庆红色", "value": "red", "prompt_text": "喜庆的红色背景，带有中国传统元素" },
        { "label": "金色华丽", "value": "gold", "prompt_text": "金色华丽的背景，富贵吉祥" }
      ]
    }
  ],
  "prompt_template": {
    "template": "【重要】严格保持参考照片中的人脸特征，包括脸型、五官、肤色。生成一张高质量的{{gender}}肖像照片，{{background}}。风格：专业摄影，清晰锐利，自然光线。",
    "negative_prompt": "模糊，变形，低质量，水印，文字，面部变形，多余肢体"
  }
}

## 重要提示
1. Prompt 模板中必须包含人脸保持指令（中文）
2. 每个选项的 prompt_text 必须是具体、描述性的中文
3. 确保所有步骤的 step_key 在 prompt_template 中被引用
4. negative_prompt 也使用中文

只返回 JSON，不要其他文字。`;
  }

  /**
   * 构建 Prompt
   * @param {Object} context - 执行上下文
   * @returns {string} Prompt 文本
   */
  buildPrompt(context) {
    const { userDescription, plan, knowledge } = context;

    let prompt = `请根据以下信息生成完整的场景配置：

## 用户原始描述
${userDescription}

## 规划信息
- 场景类型: ${plan.scene_type}
- 场景名称: ${plan.scene_name}
- 主题: ${plan.theme || '通用'}
- 需要的步骤: ${plan.required_steps.join(', ')}
- 风格关键词: ${plan.style_keywords.join(', ')}
- 复杂度: ${plan.estimated_complexity}
- 建议积分: ${plan.points_cost}
`;

    // 添加知识库参考
    if (knowledge) {
      // 场景模板参考
      if (knowledge.templates && knowledge.templates.length > 0) {
        prompt += `
## 参考场景模板
`;
        for (const template of knowledge.templates.slice(0, 2)) {
          if (template.content && typeof template.content === 'object') {
            prompt += `
### ${template.name}
\`\`\`json
${JSON.stringify(template.content, null, 2)}
\`\`\`
`;
          }
        }
      }

      // Prompt 模式参考
      if (knowledge.promptPatterns && knowledge.promptPatterns.length > 0) {
        prompt += `
## Prompt 编写参考
`;
        for (const pattern of knowledge.promptPatterns.slice(0, 2)) {
          prompt += `
### ${pattern.name}
${typeof pattern.content === 'string' ? pattern.content : JSON.stringify(pattern.content)}
`;
        }
      }

      // 最佳实践参考
      if (knowledge.bestPractices && knowledge.bestPractices.length > 0) {
        prompt += `
## 最佳实践
`;
        for (const practice of knowledge.bestPractices.slice(0, 2)) {
          prompt += `
### ${practice.name}
${typeof practice.content === 'string' ? practice.content.substring(0, 500) : ''}
`;
        }
      }
    }

    prompt += `
## 特殊要求
${plan.special_requirements ? plan.special_requirements.join('\n') : '无'}

请生成完整的场景配置 JSON。确保：
1. 步骤设计合理，用户体验流畅
2. 选项丰富但不过多
3. Prompt 模板包含人脸保持指令
4. 所有文本都有中英文版本`;

    return prompt;
  }

  /**
   * 解析响应
   * @param {string} response - LLM 响应
   * @param {Object} context - 执行上下文
   * @returns {Object} 解析结果
   */
  parseResponse(response, context) {
    const config = this.parseJSON(response);

    // 验证和补全配置
    return this.validateAndComplete(config, context);
  }

  /**
   * 验证和补全配置
   * @param {Object} config - 原始配置
   * @param {Object} context - 上下文
   * @returns {Object} 补全后的配置
   */
  validateAndComplete(config, context) {
    const { plan } = context;

    // 验证 scene
    if (!config.scene) {
      config.scene = {};
    }
    config.scene = {
      name: config.scene.name || plan.scene_name || '未命名场景',
      name_en: config.scene.name_en || plan.scene_name_en || 'Unnamed Scene',
      description: config.scene.description || plan.description || '',
      description_en: config.scene.description_en || '',
      points_cost: config.scene.points_cost || plan.points_cost || 50
    };

    // 验证 steps
    if (!Array.isArray(config.steps) || config.steps.length === 0) {
      throw new Error('配置缺少 steps');
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

    // 补全每个步骤
    config.steps = config.steps.map((step, index) => ({
      step_key: step.step_key || `step_${index}`,
      title: step.title || `步骤 ${index + 1}`,
      title_en: step.title_en || step.title || `Step ${index + 1}`,
      component_type: step.component_type || 'tags',
      is_required: step.is_required !== false,
      step_order: index + 1,
      options: (step.options || []).map((opt, optIndex) => ({
        label: opt.label || `选项 ${optIndex + 1}`,
        label_en: opt.label_en || opt.label,
        value: opt.value || `option_${optIndex}`,
        prompt_text: opt.prompt_text || opt.label,
        sort_order: optIndex + 1,
        is_default: opt.is_default || optIndex === 0
      }))
    }));

    // 验证 prompt_template
    if (!config.prompt_template) {
      config.prompt_template = {};
    }
    if (!config.prompt_template.template) {
      // 自动生成基础模板
      const stepKeys = config.steps
        .filter(s => s.component_type !== 'image_upload')
        .map(s => s.step_key);

      config.prompt_template.template = this.generateDefaultTemplate(stepKeys);
    }
    if (!config.prompt_template.negative_prompt) {
      config.prompt_template.negative_prompt = '模糊，变形，低质量，水印，文字，面部变形，多余肢体，畸形';
    }

    // 确保 Prompt 包含人脸保持指令
    if (!config.prompt_template.template.includes('人脸') &&
        !config.prompt_template.template.includes('面部') &&
        !config.prompt_template.template.includes('脸型')) {
      config.prompt_template.template = this.addFacePreservation(config.prompt_template.template);
    }

    return config;
  }

  /**
   * 生成默认 Prompt 模板
   * @param {Array<string>} stepKeys - 步骤 key 列表
   * @returns {string} Prompt 模板
   */
  generateDefaultTemplate(stepKeys) {
    let template = '【重要】严格保持参考照片中的人脸特征，包括脸型、五官、肤色，生成的人脸必须与原照片高度一致。';
    template += '生成一张高质量的肖像照片。';

    for (const key of stepKeys) {
      template += `{{${key}}}。`;
    }

    template += '风格：专业摄影，清晰锐利，自然光线，高分辨率。';

    return template;
  }

  /**
   * 添加人脸保持指令
   * @param {string} template - 原始模板
   * @returns {string} 添加后的模板
   */
  addFacePreservation(template) {
    const faceInstruction = '【重要】严格保持参考照片中的人脸特征，包括脸型、眼睛、鼻子、嘴巴和肤色，生成的人脸必须与原照片高度一致。';
    return faceInstruction + template;
  }
}

module.exports = ConfigAgent;
