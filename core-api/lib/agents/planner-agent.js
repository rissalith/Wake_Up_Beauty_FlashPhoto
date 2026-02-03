/**
 * 规划 Agent (Planner Agent)
 * 职责: 理解用户意图，制定生成计划
 */

const BaseAgent = require('./base-agent');

class PlannerAgent extends BaseAgent {
  constructor(options = {}) {
    super('PlannerAgent', {
      temperature: 0.5, // 规划需要更确定性的输出
      ...options
    });

    this.systemPrompt = `你是一个专业的 AI 图片生成场景规划专家。你的任务是分析用户的场景描述，制定详细的生成计划。

## 你的职责
1. 理解用户想要创建的场景类型
2. 识别场景的核心特征和风格
3. 规划需要的步骤和选项
4. 评估场景复杂度

## 输出格式
必须返回有效的 JSON，格式如下：
{
  "scene_type": "场景类型标识",
  "scene_name": "场景中文名称",
  "scene_name_en": "Scene English Name",
  "theme": "主题标识",
  "description": "场景描述",
  "required_steps": ["upload", "gender", "step3", ...],
  "style_keywords": ["关键词1", "关键词2", ...],
  "reference_templates": ["可参考的模板名称"],
  "estimated_complexity": "low/medium/high",
  "points_cost": 50-200,
  "special_requirements": ["特殊需求1", "特殊需求2"]
}

## 场景类型参考
- idphoto: 证件照
- professional: 职业照
- portrait: 写真照
- festival: 节日主题
- wedding: 婚纱照
- pet: 宠物写真
- family: 全家福
- artistic: 艺术创作
- custom: 自定义场景

## 步骤类型参考
- upload: 图片上传 (必须作为第一步)
- gender: 性别选择
- background: 背景选择
- style: 风格选择
- clothing: 服装选择
- expression: 表情选择
- decoration: 装饰选择
- blessing: 祝福语选择
- filter: 滤镜选择

只返回 JSON，不要其他文字。`;
  }

  /**
   * 构建 Prompt
   * @param {Object} context - 执行上下文
   * @returns {string} Prompt 文本
   */
  buildPrompt(context) {
    const { userDescription, knowledge } = context;

    let prompt = `请分析以下场景描述，制定生成计划：

## 用户描述
${userDescription}
`;

    // 如果有知识库参考
    if (knowledge && knowledge.templates && knowledge.templates.length > 0) {
      prompt += `
## 可参考的现有模板
${knowledge.templates.map(t => `- ${t.name}: ${t.tags || ''}`).join('\n')}
`;
    }

    prompt += `
请根据用户描述，输出详细的场景规划 JSON。`;

    return prompt;
  }

  /**
   * 解析响应
   * @param {string} response - LLM 响应
   * @param {Object} context - 执行上下文
   * @returns {Object} 解析结果
   */
  parseResponse(response, context) {
    const plan = this.parseJSON(response);

    // 验证必要字段
    if (!plan.scene_type) {
      plan.scene_type = 'custom';
    }
    if (!plan.scene_name) {
      plan.scene_name = '自定义场景';
    }
    if (!Array.isArray(plan.required_steps)) {
      plan.required_steps = ['upload', 'gender'];
    }
    if (!plan.required_steps.includes('upload')) {
      plan.required_steps.unshift('upload');
    }
    if (!Array.isArray(plan.style_keywords)) {
      plan.style_keywords = [];
    }
    if (!plan.estimated_complexity) {
      plan.estimated_complexity = 'medium';
    }
    if (!plan.points_cost) {
      plan.points_cost = 50;
    }

    return plan;
  }
}

module.exports = PlannerAgent;
