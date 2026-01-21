/**
 * AI Agent 路由 - 使用 Gemini API 自动生成场景配置
 * 通过 Vector Engine (https://api.vectorengine.ai) 中转调用
 * 支持图像生成（Nano Banana）和绿幕抠图
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { uploadBufferToCOS, ASSET_COS_CONFIG } = require('../config/cos');

// AI API 配置
const AI_API_BASE = process.env.AI_API_BASE || 'https://api.vectorengine.ai';
const AI_API_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'gemini-2.0-flash';
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'gemini-3-pro-image-preview'; // 图像生成模型

// 绿幕颜色配置（用于抠图）
const GREEN_SCREEN = {
  r: 0,
  g: 255,
  b: 0,
  tolerance: 150,  // 颜色容差（增加以更好地处理边缘）
  edgeTolerance: 180  // 边缘容差（更宽松）
};

// 支持的步骤组件类型
const SUPPORTED_COMPONENT_TYPES = [
  'image_upload',    // 图片上传
  'gender_select',   // 性别选择
  'radio',           // 单选框
  'tags',            // 标签选择
  'spec_select',     // 规格选择
  'color_picker',    // 颜色选择
  'image_tags',      // 图片标签
  'slider'           // 滑块
];

// 系统提示词 - 指导 AI 生成场景配置
const SYSTEM_PROMPT = `你是一个专业的AI写真场景配置生成助手。你需要根据用户的描述，生成完整的场景配置JSON。

## 输出格式要求
你必须返回一个严格的JSON对象，包含以下结构：

{
  "scene": {
    "scene_key": "场景唯一标识，使用英文下划线格式，如 pet_photo",
    "name": "场景中文名称",
    "name_en": "场景英文名称",
    "description": "场景中文描述，一句话说明",
    "description_en": "场景英文描述",
    "icon_description": "【必填】场景图标的英文描述，用于AI生成图标，如：a cute cartoon pet icon with camera",
    "points_cost": 50,
    "status": "active",
    "is_review_safe": true
  },
  "steps": [
    {
      "step_key": "步骤标识，如 background, style",
      "title": "步骤中文标题",
      "title_en": "步骤英文标题",
      "component_type": "组件类型",
      "is_required": true,
      "is_visible": true,
      "step_order": 1,
      "step_icon_description": "步骤图标的英文描述，用于AI生成，如：background selection icon（可选）",
      "options": [
        {
          "option_key": "选项标识",
          "label": "选项中文名",
          "label_en": "选项英文名",
          "color": "#颜色值（如果是颜色选择）",
          "image_description": "【必填】选项示意图的英文描述，用于AI生成图片，如：outdoor park scenery with green trees",
          "prompt_text": "该选项对应的AI提示词片段（中文描述）",
          "is_default": false
        }
      ]
    }
  ],
  "prompt_template": {
    "name": "模板名称",
    "template": "完整的Prompt模板，使用{{步骤的step_key}}作为变量占位符。模板必须包含所有步骤的step_key变量。【重要】模板必须以中文为主，英文为辅。例如：专业的{{pet_type}}肖像照，{{background}}背景，{{style}}风格，{{filter}}色调，高质量，细节丰富，8k分辨率，摄影棚灯光",
    "negative_prompt": "负面提示词（中英文混合），如：模糊，低质量，扭曲，丑陋，变形，blurry, low quality, distorted, bad anatomy"
  }
}

## 组件类型说明
可用的 component_type 值：
- image_upload: 图片上传（通常是第一步，让用户上传照片）
- gender_select: 性别选择（男/女）
- radio: 单选框（通用单选）
- tags: 标签选择（多个文字标签）
- spec_select: 规格选择（照片尺寸，需要 width/height）
- color_picker: 颜色选择（背景色等）
- image_tags: 图片标签（带图片的选项）
- slider: 滑块（如美颜程度 0-100）

## 重要规则
1. 第一个步骤通常是 image_upload（上传照片），upload步骤不需要options
2. 每个步骤至少有一个默认选项（is_default: true），除了image_upload步骤
3. prompt_template 中的变量名必须与步骤的 step_key 完全对应（除了image_upload步骤）
4. 颜色值使用标准十六进制格式
5. 所有文本必须同时提供中英文
6. 只返回JSON，不要添加任何解释文字
7. **【关键】scene.icon_description 和每个选项的 image_description 字段都是必填的，不能省略或留空**

## 图标和图片描述规则（必须严格遵守）
1. **icon_description（必填）**: 场景图标描述，使用简洁的英文描述一个代表该场景的图标
   - 示例："a professional camera icon with business suit", "cute pet paw with heart shape"
   - 要求：简洁、具体、适合生成透明背景的图标

2. **step_icon_description（可选）**: 步骤图标描述，描述该步骤的功能图标
   - 示例："background selection icon", "style picker icon"

3. **image_description（必填）**: 每个选项的示意图描述，描述该选项代表的视觉效果
   - 示例："outdoor park with green trees and sunshine", "modern office interior with glass windows"
   - 要求：详细、具体、能够清晰表达选项的视觉特征
   - **重要：除了 image_upload 步骤外，所有步骤的每个选项都必须有 image_description**

4. 所有描述都应该是简洁的英文短语，适合用于AI图像生成

## Prompt模板规则
1. template字段必须是一个完整的、高质量的AI图像生成提示词
2. **【重要】模板必须以中文为主，英文为辅**，这样更符合中文用户的使用习惯
3. 使用{{step_key}}格式引用步骤变量（step_key不含upload步骤）
4. 模板应包含：主题描述、风格、质量词、技术参数等
5. 示例（中文为主）：专业的{{pet_type}}肖像照，{{background}}背景，{{style}}艺术风格，{{filter}}色调，高质量，细节丰富，8k分辨率，摄影棚灯光
6. negative_prompt应包含常见的负面词汇（中英文混合）：模糊，低质量，扭曲，丑陋，变形，blurry, low quality, distorted, bad anatomy等
7. prompt_text（选项的提示词片段）也应该使用中文描述`;

// 修改场景的系统提示词
const MODIFY_SYSTEM_PROMPT = `你是一个专业的AI写真场景配置助手。用户会给你一个现有的场景配置，以及修改指令。
你需要根据指令修改配置，并返回修改后的完整JSON。

## 输出格式
返回与输入相同结构的完整JSON，只修改用户要求的部分，其他保持不变。

## 注意事项
1. 只返回JSON，不要添加解释
2. 保持所有ID和key不变（除非用户明确要求修改）
3. 新增的选项需要生成唯一的option_key
4. 确保中英文都有更新`;

/**
 * 调用 Gemini API
 */
async function callGeminiAPI(messages, temperature = 0.7) {
  if (!AI_API_KEY) {
    throw new Error('AI_API_KEY 未配置');
  }

  const response = await fetch(`${AI_API_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: messages,
      temperature: temperature,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API 错误:', response.status, errorText);
    throw new Error(`AI API 调用失败: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

/**
 * 解析 AI 返回的 JSON
 */
function parseAIResponse(content) {
  // 尝试提取 JSON 块
  let jsonStr = content;
  
  // 如果包含 markdown 代码块，提取其中的 JSON
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }
  
  // 尝试解析
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // 尝试修复常见问题
    jsonStr = jsonStr
      .replace(/,\s*}/g, '}')  // 移除尾随逗号
      .replace(/,\s*]/g, ']')
      .replace(/'/g, '"');     // 单引号转双引号
    
    return JSON.parse(jsonStr);
  }
}

/**
 * 验证场景配置结构
 */
function validateSceneConfig(config) {
  const errors = [];
  
  if (!config.scene) {
    errors.push('缺少 scene 配置');
  } else {
    if (!config.scene.scene_key) errors.push('缺少 scene.scene_key');
    if (!config.scene.name) errors.push('缺少 scene.name');
  }
  
  if (!config.steps || !Array.isArray(config.steps)) {
    errors.push('缺少 steps 数组');
  } else {
    config.steps.forEach((step, i) => {
      if (!step.step_key) errors.push(`步骤 ${i + 1} 缺少 step_key`);
      if (!step.title) errors.push(`步骤 ${i + 1} 缺少 title`);
      if (!SUPPORTED_COMPONENT_TYPES.includes(step.component_type)) {
        errors.push(`步骤 ${i + 1} 的 component_type "${step.component_type}" 不支持`);
      }
    });
  }
  
  if (!config.prompt_template) {
    errors.push('缺少 prompt_template');
  }
  
  return errors;
}

/**
 * 为配置填充默认值
 */
function fillDefaults(config) {
  // 场景默认值
  config.scene = {
    points_cost: 50,
    status: 'active',
    is_review_safe: true,
    ...config.scene
  };
  
  // 步骤默认值
  config.steps = config.steps.map((step, index) => ({
    is_required: true,
    is_visible: true,
    step_order: index + 1,
    gender_based: false,
    ...step,
    options: (step.options || []).map((opt, optIndex) => ({
      is_default: optIndex === 0,
      sort_order: optIndex + 1,
      ...opt,
      option_key: opt.option_key || `opt_${Date.now().toString(36)}_${optIndex}`
    }))
  }));
  
  // Prompt 模板默认值
  config.prompt_template = {
    is_active: true,
    ...config.prompt_template
  };
  
  return config;
}

// ========== API 路由 ==========

/**
 * POST /api/ai-agent/generate-scene
 * 根据描述生成完整场景配置
 */
router.post('/generate-scene', authMiddleware, async (req, res) => {
  try {
    const { description, reference_scene } = req.body;
    
    if (!description) {
      return res.json({ code: 400, message: '请提供场景描述' });
    }
    
    console.log('[AI Agent] 生成场景:', description);
    
    let userPrompt = `请为以下场景生成完整配置：\n\n${description}`;
    
    // 如果有参考场景，添加到提示中
    if (reference_scene) {
      userPrompt += `\n\n参考现有场景配置（可以参考其结构和风格）：\n${JSON.stringify(reference_scene, null, 2)}`;
    }
    
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];
    
    const aiResponse = await callGeminiAPI(messages, 0.7);
    console.log('[AI Agent] AI 原始响应长度:', aiResponse.length);

    // 解析响应
    let config;
    try {
      config = parseAIResponse(aiResponse);

      // 【调试】检查关键字段是否存在
      console.log('[AI Agent] 检查关键字段:');
      console.log('  - scene.icon_description:', config.scene?.icon_description ? '✓ 存在' : '✗ 缺失');
      if (config.steps) {
        config.steps.forEach((step, i) => {
          console.log(`  - steps[${i}].title: ${step.title}`);
          if (step.options) {
            step.options.forEach((opt, j) => {
              console.log(`    - options[${j}].label: ${opt.label}, image_description: ${opt.image_description ? '✓' : '✗'}`);
            });
          }
        });
      }

    } catch (parseError) {
      console.error('[AI Agent] JSON 解析失败:', parseError);
      return res.json({
        code: 500,
        message: '解析AI响应失败，请重试',
        raw_response: aiResponse.substring(0, 500)
      });
    }

    // 验证配置
    const errors = validateSceneConfig(config);
    if (errors.length > 0) {
      console.warn('[AI Agent] 配置验证警告:', errors);
      // 不阻止返回，只是警告
    }

    // 填充默认值
    config = fillDefaults(config);
    
    res.json({
      code: 200,
      message: '场景配置生成成功',
      data: config,
      warnings: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('[AI Agent] 生成场景失败:', error);
    res.json({ code: 500, message: error.message || '生成失败' });
  }
});

/**
 * POST /api/ai-agent/modify-scene
 * 基于现有场景进行修改
 */
router.post('/modify-scene', authMiddleware, async (req, res) => {
  try {
    const { current_config, instruction } = req.body;
    
    if (!current_config) {
      return res.json({ code: 400, message: '请提供当前场景配置' });
    }
    if (!instruction) {
      return res.json({ code: 400, message: '请提供修改指令' });
    }
    
    console.log('[AI Agent] 修改场景:', instruction);
    
    const userPrompt = `当前场景配置：
${JSON.stringify(current_config, null, 2)}

修改指令：${instruction}

请返回修改后的完整JSON配置。`;
    
    const messages = [
      { role: 'system', content: MODIFY_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];
    
    const aiResponse = await callGeminiAPI(messages, 0.5);
    
    // 解析响应
    let config;
    try {
      config = parseAIResponse(aiResponse);
    } catch (parseError) {
      console.error('[AI Agent] JSON 解析失败:', parseError);
      return res.json({ 
        code: 500, 
        message: '解析AI响应失败，请重试'
      });
    }
    
    // 填充默认值
    config = fillDefaults(config);
    
    res.json({
      code: 200,
      message: '修改成功',
      data: config
    });
    
  } catch (error) {
    console.error('[AI Agent] 修改场景失败:', error);
    res.json({ code: 500, message: error.message || '修改失败' });
  }
});

/**
 * POST /api/ai-agent/generate-prompt
 * 单独生成 Prompt 模板
 */
router.post('/generate-prompt', authMiddleware, async (req, res) => {
  try {
    const { scene_name, scene_description, steps } = req.body;
    
    if (!scene_name) {
      return res.json({ code: 400, message: '请提供场景名称' });
    }
    
    console.log('[AI Agent] 生成Prompt:', scene_name);
    
    const stepKeys = steps ? steps.map(s => s.step_key).filter(k => k && k !== 'upload') : [];
    
    const userPrompt = `请为以下场景生成一个高质量的AI图像生成Prompt模板：

场景名称：${scene_name}
场景描述：${scene_description || '无'}
可用变量（步骤标识）：${stepKeys.join(', ') || '无'}

请返回JSON格式：
{
  "name": "模板名称",
  "template": "Prompt模板，使用{{变量名}}表示变量",
  "negative_prompt": "负面提示词"
}`;
    
    const messages = [
      { role: 'system', content: '你是一个专业的AI图像生成Prompt工程师。只返回JSON，不要添加任何解释。' },
      { role: 'user', content: userPrompt }
    ];
    
    const aiResponse = await callGeminiAPI(messages, 0.7);
    
    let result;
    try {
      result = parseAIResponse(aiResponse);
    } catch (parseError) {
      return res.json({ code: 500, message: '解析失败' });
    }
    
    res.json({
      code: 200,
      data: result
    });
    
  } catch (error) {
    console.error('[AI Agent] 生成Prompt失败:', error);
    res.json({ code: 500, message: error.message || '生成失败' });
  }
});

/**
 * POST /api/ai-agent/chat
 * 通用对话接口（用于自由交流和问答）
 */
router.post('/chat', authMiddleware, async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!message) {
      return res.json({ code: 400, message: '请提供消息内容' });
    }
    
    const messages = [
      { 
        role: 'system', 
        content: '你是醒美闪图后台管理系统的AI助手，专门帮助用户配置AI写真场景。你可以帮助用户：\n1. 解答场景配置相关问题\n2. 提供Prompt编写建议\n3. 推荐合适的步骤和选项设置\n请用简洁专业的中文回答。' 
      }
    ];
    
    // 如果有上下文，添加到对话历史
    if (context && Array.isArray(context)) {
      messages.push(...context.slice(-10)); // 只保留最近10条
    }
    
    messages.push({ role: 'user', content: message });
    
    const aiResponse = await callGeminiAPI(messages, 0.8);
    
    res.json({
      code: 200,
      data: {
        reply: aiResponse
      }
    });
    
  } catch (error) {
    console.error('[AI Agent] 对话失败:', error);
    res.json({ code: 500, message: error.message || '对话失败' });
  }
});

/**
 * GET /api/ai-agent/status
 * 检查 AI 服务状态
 */
router.get('/status', (req, res) => {
  res.json({
    code: 200,
    data: {
      available: !!AI_API_KEY,
      model: AI_MODEL,
      image_model: IMAGE_MODEL,
      base_url: AI_API_BASE
    }
  });
});

// ========== 图像生成功能 ==========

/**
 * 调用图像生成 API (Gemini Native API)
 * 使用 Gemini 原生 generateContent API 生成图像
 * 生成纯绿色背景的图像用于后续抠图
 * 支持宽高比和清晰度控制
 */
async function generateImage(prompt, size = '1024x1024') {
  if (!AI_API_KEY) {
    throw new Error('AI_API_KEY 未配置');
  }

  console.log('[AI Agent] 生成图像 (Gemini Native):', prompt.substring(0, 100));

  // 添加绿幕背景指令到 prompt，强调真实照片风格
  const greenScreenPrompt = `${prompt}, photorealistic, real person, real object, professional photography, high quality photo, realistic style, on a solid pure green background (#00FF00), the background must be completely flat solid green color with no shadows or gradients, studio lighting, 8k, ultra detailed`;

  // 解析尺寸参数，支持 1024x1024, 512x512 等格式
  let aspectRatio = '1:1';  // 默认 1:1
  if (size.includes('x')) {
    const [width, height] = size.split('x').map(Number);
    if (width && height) {
      // 计算宽高比
      const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
      const divisor = gcd(width, height);
      aspectRatio = `${width / divisor}:${height / divisor}`;
    }
  }

  // 使用 Gemini 原生 API 格式，添加 imageConfig 控制宽高比和清晰度
  const requestData = {
    contents: [{
      role: 'user',
      parts: [{ text: greenScreenPrompt }]
    }],
    generationConfig: {
      responseModalities: ['image']
    },
    imageConfig: {
      aspectRatio: aspectRatio,  // 宽高比：1:1, 16:9, 9:16, 4:3, 3:4
      quality: 'high'  // 清晰度：high 或 standard
    }
  };

  const response = await fetch(`${AI_API_BASE}/v1beta/models/${IMAGE_MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify(requestData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('图像生成 API 错误:', response.status, errorText);
    throw new Error(`图像生成失败: ${response.status}`);
  }

  const data = await response.json();
  
  // 解析 Gemini 原生 API 响应格式
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
    const parts = data.candidates[0].content.parts;
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return {
          b64_json: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
          url: null,
          revised_prompt: greenScreenPrompt
        };
      }
    }
  }
  
  console.error('[AI Agent] Gemini 响应格式异常:', JSON.stringify(data).substring(0, 500));
  throw new Error('图像生成返回数据格式错误');
}

/**
 * 绿幕抠图 - 将绿色背景转为透明
 * 使用纯 JavaScript 实现，无需额外依赖
 */
async function removeGreenScreen(base64Image) {
  // 将 base64 转为 Buffer
  const imageBuffer = Buffer.from(base64Image, 'base64');
  
  // 使用 PNG 解析
  // 注意：这里需要一个简单的 PNG 处理，我们使用 pngjs 库
  const PNG = require('pngjs').PNG;
  
  return new Promise((resolve, reject) => {
    const png = new PNG();
    
    png.parse(imageBuffer, (err, data) => {
      if (err) {
        // 如果不是 PNG，尝试转换
        console.log('[AI Agent] 图像可能不是 PNG 格式，尝试直接处理');
        // 直接返回原图（后续可以用 sharp 处理）
        resolve(imageBuffer);
        return;
      }
      
      // 遍历每个像素
      for (let y = 0; y < data.height; y++) {
        for (let x = 0; x < data.width; x++) {
          const idx = (data.width * y + x) << 2;  // RGBA 索引
          
          const r = data.data[idx];
          const g = data.data[idx + 1];
          const b = data.data[idx + 2];
          
          // 检测绿色像素（考虑容差）
          if (isGreenPixel(r, g, b)) {
            // 设置为完全透明
            data.data[idx + 3] = 0;
          }
        }
      }
      
      // 将处理后的 PNG 转为 Buffer
      const chunks = [];
      const stream = data.pack();
      
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
}

/**
 * 检测像素是否为绿色（绿幕）- 改进版算法
 * 使用 HSV 色彩空间进行更精确的绿色检测
 */
function isGreenPixel(r, g, b) {
  const tolerance = GREEN_SCREEN.tolerance;

  // 方法1: 纯绿色检测
  const isPureGreen =
    Math.abs(r - GREEN_SCREEN.r) < tolerance &&
    Math.abs(g - GREEN_SCREEN.g) < tolerance &&
    Math.abs(b - GREEN_SCREEN.b) < tolerance;

  if (isPureGreen) return true;

  // 方法2: 基于色相的绿色检测 (HSV色彩空间)
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) return false;  // 灰色像素

  // 计算色相 (0-360)
  let hue;
  if (max === r) {
    hue = 60 * (((g - b) / delta) % 6);
  } else if (max === g) {
    hue = 60 * (((b - r) / delta) + 2);
  } else {
    hue = 60 * (((r - g) / delta) + 4);
  }
  if (hue < 0) hue += 360;

  // 计算饱和度 (0-1)
  const saturation = max === 0 ? 0 : delta / max;

  // 计算亮度 (0-1)
  const value = max / 255;

  // 绿色范围: 色相 60-180, 饱和度 > 0.15 (降低阈值), 亮度 > 0.15 (降低阈值)
  const isGreenHue = hue >= 60 && hue <= 180;
  const hasSaturation = saturation > 0.15;  // 降低饱和度阈值
  const hasBrightness = value > 0.15;  // 降低亮度阈值

  // 绿色通道显著高于其他通道（降低阈值以检测更多绿色）
  const greenDominance = g - Math.max(r, b);
  const isGreenDominant = greenDominance > 10;  // 从20降低到10

  return (isGreenHue && hasSaturation && hasBrightness && isGreenDominant);
}

/**
 * 计算像素与绿幕颜色的相似度 (0-1)
 * 用于边缘羽化处理
 */
function getGreenSimilarity(r, g, b) {
  // 计算与纯绿色的欧氏距离
  const dr = r - GREEN_SCREEN.r;
  const dg = g - GREEN_SCREEN.g;
  const db = b - GREEN_SCREEN.b;
  const distance = Math.sqrt(dr*dr + dg*dg + db*db);

  // 最大距离约为 441 (白色到黑色)
  // 我们用较小的范围来做相似度映射
  const maxDistance = 200;
  const similarity = 1 - Math.min(distance / maxDistance, 1);

  return similarity;
}

/**
 * 使用 sharp 进行更精确的绿幕抠图（如果可用）
 * 改进版：支持边缘羽化，减少绿色残留
 */
async function removeGreenScreenWithSharp(base64Image) {
  try {
    const sharp = require('sharp');
    const imageBuffer = Buffer.from(base64Image, 'base64');

    // 获取图像元数据
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;

    // 获取原始像素数据
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 第一遍：标记绿色像素并计算相似度
    const alphaMap = new Uint8Array(info.width * info.height);

    for (let i = 0, pixelIndex = 0; i < data.length; i += 4, pixelIndex++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (isGreenPixel(r, g, b)) {
        // 完全透明
        alphaMap[pixelIndex] = 0;
      } else {
        // 计算与绿色的相似度，用于边缘羽化
        const similarity = getGreenSimilarity(r, g, b);

        // 如果相似度高（接近绿色），降低不透明度
        if (similarity > 0.5) {
          // 相似度 0.5-1.0 映射到 alpha 255-0
          alphaMap[pixelIndex] = Math.round((1 - similarity) * 255);
        } else {
          // 完全不透明
          alphaMap[pixelIndex] = 255;
        }
      }
    }

    // 第二遍：应用 alpha 值并去除绿色溢出
    for (let i = 0, pixelIndex = 0; i < data.length; i += 4, pixelIndex++) {
      const alpha = alphaMap[pixelIndex];
      data[i + 3] = alpha;

      // 如果是半透明像素（边缘），去除绿色溢出
      if (alpha > 0 && alpha < 255) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 减少绿色通道的影响
        if (g > r && g > b) {
          const greenSpill = g - Math.max(r, b);
          data[i + 1] = Math.max(0, g - greenSpill * 0.5);
        }
      }
    }

    // 重建图像
    const result = await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4
      }
    })
    .png()
    .toBuffer();

    return result;
  } catch (e) {
    console.log('[AI Agent] sharp 不可用，使用备用方案:', e.message);
    return removeGreenScreen(base64Image);
  }
}

// 占位图 URL（用于替代 AI 生成的图片）
const PLACEHOLDER_IMAGE_URL = 'https://via.placeholder.com/512x512/CCCCCC/666666?text=请上传图片';

/**
 * POST /api/ai-agent/generate-icon
 * 生成场景图标或步骤示意图
 * 【已禁用AI生成】返回占位图，用户需要通过素材管理上传图片
 */
router.post('/generate-icon', authMiddleware, async (req, res) => {
  try {
    const {
      description,     // 图标描述
      type = 'scene',  // 类型: scene(场景图标) 或 step(步骤示意图)
      scene_id,        // 场景ID（用于存储路径）
      step_key,        // 步骤key（用于存储路径）
      option_key       // 选项key（用于存储路径）
    } = req.body;
    
    console.log(`[AI Agent] 图标生成已禁用，返回占位图。描述: ${description}`);
    
    // AI图片生成已禁用，直接返回占位图URL
    // 用户需要通过素材管理上传图片，然后在场景配置中选择
    res.json({
      code: 200,
      message: 'AI图片生成已禁用，请通过素材管理上传图片',
      data: {
        url: PLACEHOLDER_IMAGE_URL,
        cos_key: null,
        base64: null,
        original_prompt: description,
        revised_prompt: null,
        disabled: true,  // 标记AI生成已禁用
        hint: '请前往素材管理上传图片，然后在场景配置中选择'
      }
    });
    
  } catch (error) {
    console.error('[AI Agent] 生成图标失败:', error);
    res.json({ code: 500, message: error.message || '生成失败' });
  }
});

/**
 * POST /api/ai-agent/batch-generate-icons
 * 批量生成步骤选项的示意图
 * 【已禁用AI生成】返回占位图列表，用户需要通过素材管理上传图片
 */
router.post('/batch-generate-icons', authMiddleware, async (req, res) => {
  try {
    const {
      scene_id,
      step_key,
      options  // [{option_key, label, description}]
    } = req.body;
    
    if (!options || !Array.isArray(options) || options.length === 0) {
      return res.json({ code: 400, message: '请提供选项列表' });
    }
    
    console.log(`[AI Agent] 批量图标生成已禁用，返回 ${options.length} 个占位图`);
    
    // AI图片生成已禁用，为每个选项返回占位图
    const results = options.map(opt => ({
      option_key: opt.option_key,
      label: opt.label,
      url: PLACEHOLDER_IMAGE_URL,
      cos_key: null,
      success: true,
      disabled: true  // 标记AI生成已禁用
    }));
    
    res.json({
      code: 200,
      message: 'AI图片生成已禁用，请通过素材管理上传图片',
      data: {
        success: results,
        failed: [],
        disabled: true,
        hint: '请前往素材管理上传图片，然后在场景配置中选择'
      }
    });
    
  } catch (error) {
    console.error('[AI Agent] 批量生成失败:', error);
    res.json({ code: 500, message: error.message || '批量生成失败' });
  }
});

/**
 * POST /api/ai-agent/process-image
 * 对已有图片进行绿幕抠图处理
 */
router.post('/process-image', authMiddleware, async (req, res) => {
  try {
    const { 
      image_url,      // 图片URL
      image_base64,   // 或 base64 图片数据
      output_key      // COS 存储路径
    } = req.body;
    
    if (!image_url && !image_base64) {
      return res.json({ code: 400, message: '请提供图片URL或base64数据' });
    }
    
    let imageBuffer;
    
    // 获取图片数据
    if (image_base64) {
      imageBuffer = Buffer.from(image_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    } else {
      const response = await fetch(image_url);
      if (!response.ok) {
        return res.json({ code: 400, message: '无法获取图片' });
      }
      imageBuffer = Buffer.from(await response.arrayBuffer());
    }
    
    console.log('[AI Agent] 处理图片, 大小:', imageBuffer.length);
    
    // 绿幕抠图
    let transparentBuffer;
    try {
      transparentBuffer = await removeGreenScreenWithSharp(imageBuffer.toString('base64'));
    } catch (e) {
      console.error('[AI Agent] 抠图失败:', e);
      return res.json({ code: 500, message: '图片处理失败: ' + e.message });
    }
    
    // 上传到 COS
    const cosKey = output_key || `ai-generated/processed/${Date.now()}.png`;
    const uploadResult = await uploadBufferToCOS(transparentBuffer, cosKey, 'image/png');
    
    res.json({
      code: 200,
      message: '图片处理成功',
      data: {
        url: uploadResult.url,
        cos_key: uploadResult.key
      }
    });
    
  } catch (error) {
    console.error('[AI Agent] 图片处理失败:', error);
    res.json({ code: 500, message: error.message || '处理失败' });
  }
});

module.exports = router;
