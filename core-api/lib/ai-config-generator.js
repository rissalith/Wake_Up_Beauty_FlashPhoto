/**
 * AI 配置生成服务
 * 使用 Gemini API 自动生成场景配置
 */

const axios = require('axios');

// AI 服务配置（与 ai-review.js 保持一致）
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_API_BASE = process.env.AI_API_BASE || 'https://api.vectorengine.ai';
const AI_MODEL = process.env.AI_CONFIG_MODEL || 'gemini-2.0-flash';

// System Prompt - 指导 AI 生成符合格式的配置
const SYSTEM_PROMPT = `你是一个专业的 AI 图片生成场景配置专家。根据用户的描述，生成完整的场景配置。

## 输出格式要求
必须返回有效的 JSON，包含 scene、steps、prompt_template 三个部分。不要包含任何其他文字说明，只返回 JSON。

## 步骤类型说明
- image_upload: 图片上传（必须作为第一步，让用户上传照片）
- gender_select: 性别选择（预设男/女选项，用于区分生成效果）
- tags: 标签选择（通用单选，用于选择风格、背景等）
- image_tags: 图片标签选择（带图片的选项，适合需要视觉参考的选择）
- dice_roll: 摇骰子（随机抽取，需配置品级 normal/rare/epic/legendary）

## 配置规范
1. 每个场景必须以 image_upload 步骤开始
2. 建议在第二步包含 gender_select 步骤
3. 步骤数量控制在 3-6 个
4. 每个步骤的选项数量控制在 3-8 个
5. Prompt 模板必须使用 {{variable_name}} 引用步骤的 step_key
6. 必须提供 negative_prompt（负面提示词）
7. prompt_text 使用英文，label 使用中文

## 数据结构示例
{
  "scene": {
    "name": "场景中文名称",
    "name_en": "Scene English Name",
    "description": "场景中文描述",
    "description_en": "Scene English description",
    "points_cost": 50
  },
  "steps": [
    {
      "step_key": "upload",
      "title": "上传照片",
      "title_en": "Upload Photo",
      "component_type": "image_upload",
      "is_required": true,
      "options": []
    },
    {
      "step_key": "gender",
      "title": "选择性别",
      "title_en": "Select Gender",
      "component_type": "gender_select",
      "is_required": true,
      "options": [
        { "label": "男", "label_en": "Male", "value": "male", "prompt_text": "male person" },
        { "label": "女", "label_en": "Female", "value": "female", "prompt_text": "female person" }
      ]
    },
    {
      "step_key": "background",
      "title": "选择背景",
      "title_en": "Select Background",
      "component_type": "tags",
      "is_required": true,
      "options": [
        { "label": "红色喜庆", "label_en": "Red Festive", "value": "red", "prompt_text": "red festive background with golden decorations" },
        { "label": "蓝色商务", "label_en": "Blue Business", "value": "blue", "prompt_text": "professional blue gradient background" }
      ]
    }
  ],
  "prompt_template": {
    "template": "Generate a professional portrait photo. Subject: {{gender}}. Background: {{background}}. Style: high quality, studio lighting, sharp focus.",
    "negative_prompt": "blurry, distorted, low quality, watermark, text, deformed face, extra limbs"
  }
}`;

/**
 * 调用 Gemini API 生成场景配置
 * @param {string} description - 用户输入的场景描述
 * @returns {Promise<Object>} 生成的配置
 */
async function generateSceneConfig(description) {
  if (!AI_API_KEY) {
    throw new Error('未配置 AI_API_KEY');
  }

  const userPrompt = `请根据以下描述生成一个完整的 AI 图片生成场景配置：

${description}

请直接返回 JSON 格式的配置，不要包含任何其他文字。`;

  try {
    const requestData = {
      contents: [{
        parts: [
          { text: SYSTEM_PROMPT },
          { text: userPrompt }
        ]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    };

    console.log('[AI Config Generator] 调用 Gemini API:', AI_MODEL);

    const response = await axios.post(
      `${AI_API_BASE}/v1beta/models/${AI_MODEL}:generateContent`,
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
    if (!textPart) {
      throw new Error('Gemini API 返回内容为空');
    }

    const content = textPart.text;
    console.log('[AI Config Generator] API 返回内容长度:', content.length);

    // 解析 JSON
    const config = parseJsonResponse(content);

    // 验证配置
    validateConfig(config);

    // 补全配置
    return completeConfig(config);

  } catch (error) {
    console.error('[AI Config Generator] 生成失败:', error.message);
    if (error.response) {
      console.error('[AI Config Generator] API 响应状态:', error.response.status);
      console.error('[AI Config Generator] API 响应数据:', JSON.stringify(error.response.data).substring(0, 500));
    }
    throw error;
  }
}

/**
 * 解析 JSON 响应
 * @param {string} content - AI 返回的内容
 * @returns {Object} 解析后的 JSON
 */
function parseJsonResponse(content) {
  // 尝试直接解析
  try {
    return JSON.parse(content);
  } catch (e) {
    // 尝试提取 JSON 块
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    // 尝试提取 { } 之间的内容
    const braceMatch = content.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return JSON.parse(braceMatch[0]);
    }

    throw new Error('无法解析 AI 返回的 JSON');
  }
}

/**
 * 验证配置格式
 * @param {Object} config - 配置对象
 */
function validateConfig(config) {
  // 验证 scene
  if (!config.scene || !config.scene.name) {
    throw new Error('配置缺少 scene.name');
  }

  // 验证 steps
  if (!Array.isArray(config.steps) || config.steps.length === 0) {
    throw new Error('配置缺少 steps 或 steps 为空');
  }

  // 验证第一步是 image_upload
  if (config.steps[0].component_type !== 'image_upload') {
    throw new Error('第一步必须是 image_upload 类型');
  }

  // 验证每个步骤
  const validTypes = ['image_upload', 'gender_select', 'tags', 'image_tags', 'dice_roll', 'single_select', 'tag_select', 'image_tag_select'];
  for (const step of config.steps) {
    if (!step.step_key || !step.title || !step.component_type) {
      throw new Error(`步骤配置不完整: ${JSON.stringify(step)}`);
    }
    if (!validTypes.includes(step.component_type)) {
      throw new Error(`无效的步骤类型: ${step.component_type}`);
    }
  }

  // 验证 prompt_template
  if (!config.prompt_template || !config.prompt_template.template) {
    throw new Error('配置缺少 prompt_template.template');
  }
}

/**
 * 根据配置生成默认的 step_key
 * @param {string} title - 步骤标题
 * @param {number} index - 步骤索引
 * @returns {string} step_key
 */
function generateStepKey(title, index) {
  // 简单的拼音转换或使用索引
  const keyMap = {
    '上传照片': 'upload',
    '选择性别': 'gender',
    '性别': 'gender',
    '背景': 'background',
    '风格': 'style',
    '表情': 'expression',
    '服装': 'clothing',
    '发型': 'hairstyle',
    '美颜': 'beauty',
    '滤镜': 'filter',
    '祝福语': 'blessing',
    '装饰': 'decoration'
  };

  for (const [key, value] of Object.entries(keyMap)) {
    if (title.includes(key)) {
      return value;
    }
  }

  return `step_${index}`;
}

/**
 * 补全配置中缺失的字段
 * @param {Object} config - 原始配置
 * @returns {Object} 补全后的配置
 */
function completeConfig(config) {
  // 补全 scene
  config.scene = {
    name: config.scene.name || '未命名场景',
    name_en: config.scene.name_en || config.scene.name || 'Unnamed Scene',
    description: config.scene.description || '',
    description_en: config.scene.description_en || config.scene.description || '',
    points_cost: config.scene.points_cost || 50,
    ...config.scene
  };

  // 补全 steps
  config.steps = config.steps.map((step, index) => ({
    step_key: step.step_key || generateStepKey(step.title, index),
    title: step.title,
    title_en: step.title_en || step.title,
    component_type: step.component_type,
    is_required: step.is_required !== false,
    step_order: index + 1,
    options: (step.options || []).map((opt, optIndex) => ({
      label: opt.label,
      label_en: opt.label_en || opt.label,
      value: opt.value || `option_${optIndex}`,
      prompt_text: opt.prompt_text || opt.label,
      grade: opt.grade || 'normal',
      sort_order: optIndex + 1,
      ...opt
    })),
    ...step
  }));

  // 补全 prompt_template
  config.prompt_template = {
    template: config.prompt_template.template,
    negative_prompt: config.prompt_template.negative_prompt || 'blurry, distorted, low quality, watermark',
    ...config.prompt_template
  };

  return config;
}

module.exports = {
  generateSceneConfig,
  parseJsonResponse,
  validateConfig,
  completeConfig
};
