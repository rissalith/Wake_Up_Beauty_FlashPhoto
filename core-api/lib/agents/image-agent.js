/**
 * 图片生成 Agent (Image Agent)
 * 职责: 生成参考图和封面图
 */

const BaseAgent = require('./base-agent');
const { uploadToAssetBucket } = require('../../config/cos');
const crypto = require('crypto');

// 内容安全约束 - 禁止生成的内容类型
const CONTENT_SAFETY_CONSTRAINTS = `
CRITICAL SAFETY REQUIREMENTS - You MUST follow these rules:
1. NO copyrighted characters (Disney, Marvel, DC, anime characters, celebrities, etc.)
2. NO real people's faces or likenesses (celebrities, politicians, public figures)
3. NO explicit, sexual, or suggestive content
4. NO violence, gore, or disturbing imagery
5. NO children in any inappropriate context
6. NO hate symbols, extremist content, or discriminatory imagery
7. NO weapons, drugs, or illegal activities
8. NO brand logos or trademarked content
9. Generate ONLY original, safe, professional content
10. If the request seems to violate these rules, generate a neutral professional portrait instead
`;

// 敏感词列表 - 用于输入检测
const SENSITIVE_KEYWORDS = [
  // 版权相关
  'disney', 'mickey', 'marvel', 'avengers', 'dc comics', 'batman', 'superman',
  'pokemon', 'pikachu', 'naruto', 'one piece', 'dragon ball', 'anime character',
  'celebrity', 'famous person', 'movie star', 'singer', 'politician',
  // 色情相关
  'nude', 'naked', 'sexy', 'erotic', 'porn', 'nsfw', 'adult content',
  '裸体', '色情', '性感', '成人', '暴露',
  // 暴力相关
  'gore', 'blood', 'violent', 'weapon', 'gun', 'knife', 'murder', 'kill',
  '暴力', '血腥', '武器', '枪', '刀', '杀',
  // 儿童相关敏感
  'child abuse', 'minor', 'underage',
  // 其他敏感
  'hate', 'racist', 'nazi', 'terrorist', 'drug', 'illegal',
  '仇恨', '种族', '恐怖', '毒品', '非法'
];

class ImageAgent extends BaseAgent {
  constructor(options = {}) {
    super('ImageAgent', {
      model: 'gemini-3-pro-image-preview', // 使用图片生成模型
      timeout: 120000,
      ...options
    });
  }

  /**
   * 检查输入内容是否包含敏感词
   * @param {string} text - 要检查的文本
   * @returns {Object} { safe: boolean, reason: string }
   */
  checkContentSafety(text) {
    if (!text) return { safe: true };

    const lowerText = text.toLowerCase();

    for (const keyword of SENSITIVE_KEYWORDS) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return {
          safe: false,
          reason: `内容包含敏感词: ${keyword}`
        };
      }
    }

    return { safe: true };
  }

  /**
   * 执行图片生成
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 生成结果
   */
  async execute(context) {
    const startTime = Date.now();
    console.log(`[${this.name}] 开始生成图片`);

    const results = {
      cover_image: null,
      reference_image: null,
      option_previews: []
    };

    try {
      const { config, plan } = context;

      // 内容安全检查
      const sceneName = config.scene?.name || plan?.scene_name || '';
      const safetyCheck = this.checkContentSafety(sceneName);
      if (!safetyCheck.safe) {
        throw new Error(`内容安全检查未通过: ${safetyCheck.reason}`);
      }

      // 1. 生成封面图
      console.log(`[${this.name}] 生成封面图...`);
      const coverPrompt = this.buildCoverPrompt(config, plan);
      const coverResult = await this.callImageLLM(coverPrompt);
      // 上传到 COS
      const coverUrl = await this.uploadImageToCOS(coverResult, 'cover');
      results.cover_image = coverUrl;

      // 2. 生成参考图
      console.log(`[${this.name}] 生成参考图...`);
      const referencePrompt = this.buildReferencePrompt(config, plan);
      const referenceResult = await this.callImageLLM(referencePrompt);
      // 上传到 COS
      const referenceUrl = await this.uploadImageToCOS(referenceResult, 'reference');
      results.reference_image = referenceUrl;

      const duration = Date.now() - startTime;
      console.log(`[${this.name}] 图片生成完成, 耗时: ${duration}ms`);

      return {
        success: true,
        data: results,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${this.name}] 图片生成失败 (${duration}ms):`, error.message);

      return {
        success: false,
        error: error.message,
        data: results, // 返回已生成的部分
        duration
      };
    }
  }

  /**
   * 上传图片到 COS
   * @param {Object} imageData - 图片数据 { imageData: base64, mimeType }
   * @param {string} type - 图片类型 (cover/reference)
   * @returns {Promise<string>} 图片 URL
   */
  async uploadImageToCOS(imageData, type) {
    if (!imageData || !imageData.imageData) {
      throw new Error('图片数据为空');
    }

    const buffer = Buffer.from(imageData.imageData, 'base64');
    const ext = imageData.mimeType === 'image/png' ? 'png' : 'jpg';
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const key = `ai-generated/${type}_${timestamp}_${random}.${ext}`;

    console.log(`[${this.name}] 上传图片到 COS: ${key}`);

    const result = await uploadToAssetBucket(buffer, key, imageData.mimeType);
    console.log(`[${this.name}] 图片上传成功: ${result.url}`);

    return result.url;
  }

  /**
   * 构建封面图 Prompt
   * @param {Object} config - 场景配置
   * @param {Object} plan - 规划信息
   * @returns {string} Prompt
   */
  buildCoverPrompt(config, plan) {
    const sceneName = config.scene.name || plan.scene_name;
    const keywords = plan.style_keywords || [];

    let prompt = `${CONTENT_SAFETY_CONSTRAINTS}

Create a professional cover image for a photo generation app feature called "${sceneName}".

Requirements:
- The image should clearly represent the theme: ${sceneName}
- Style keywords: ${keywords.join(', ')}
- Professional, high-quality, visually appealing
- Suitable as a thumbnail/cover image
- Clean composition, eye-catching
- No text or watermarks
- Square format (1:1 aspect ratio)
- Modern, polished aesthetic
- MUST be original content, no copyrighted characters or real celebrities

The image should make users want to try this photo generation feature.`;

    // 根据场景类型添加特定指令
    const sceneType = plan.scene_type;
    if (sceneType === 'idphoto') {
      prompt += '\nShow a professional ID photo example with clean background.';
    } else if (sceneType === 'professional') {
      prompt += '\nShow a confident business professional portrait.';
    } else if (sceneType === 'festival') {
      prompt += '\nInclude festive decorations and warm atmosphere.';
    } else if (sceneType === 'wedding') {
      prompt += '\nShow romantic, elegant wedding photography style.';
    }

    return prompt;
  }

  /**
   * 构建参考图 Prompt
   * @param {Object} config - 场景配置
   * @param {Object} plan - 规划信息
   * @returns {string} Prompt
   */
  buildReferencePrompt(config, plan) {
    const sceneName = config.scene.name || plan.scene_name;
    const keywords = plan.style_keywords || [];

    // 从配置中提取默认选项的 prompt_text
    const defaultOptions = [];
    for (const step of config.steps) {
      if (step.options && step.options.length > 0) {
        const defaultOpt = step.options.find(o => o.is_default) || step.options[0];
        if (defaultOpt.prompt_text) {
          defaultOptions.push(defaultOpt.prompt_text);
        }
      }
    }

    let prompt = `${CONTENT_SAFETY_CONSTRAINTS}

Create a reference image for AI photo generation feature "${sceneName}".

This image will be used as a style reference for generating user photos.

Requirements:
- Professional portrait photography
- Clear, high-quality image
- ${defaultOptions.join('. ')}
- Style: ${keywords.join(', ')}
- The face should be clearly visible and well-lit
- Natural, flattering lighting
- Clean, appropriate background
- Portrait orientation (3:4 aspect ratio)
- MUST be original content, use a fictional/generic person, no real celebrities

This reference image will guide the AI to generate similar style photos for users.`;

    return prompt;
  }

  /**
   * 生成选项预览图 (可选功能)
   * @param {Object} step - 步骤配置
   * @param {Object} option - 选项配置
   * @returns {Promise<Object>} 图片数据
   */
  async generateOptionPreview(step, option) {
    const prompt = `Create a small preview image showing: ${option.prompt_text}.
Style: clean, simple, icon-like, suitable as a selection thumbnail.
Square format, minimal design.`;

    return await this.callImageLLM(prompt);
  }

  /**
   * 生成单张图片（用于模板封面图/参考图）
   * @param {Object} options - 生成选项
   * @param {string} options.description - 图片描述
   * @param {string} options.type - 图片类型 (cover/reference)
   * @param {number} options.width - 图片宽度
   * @param {number} options.height - 图片高度
   * @param {string} options.style - 风格类型
   * @returns {Promise<Object>} 生成结果
   */
  async generateSingleImage(options) {
    const { description, type, width = 1024, height = 1024, style } = options;
    const startTime = Date.now();

    console.log(`[${this.name}] 生成单张图片: ${type}, ${width}x${height}`);

    try {
      // 内容安全检查
      const safetyCheck = this.checkContentSafety(description);
      if (!safetyCheck.safe) {
        throw new Error(`内容安全检查未通过: ${safetyCheck.reason}`);
      }

      let prompt = '';

      if (type === 'cover') {
        // 封面图 Prompt
        prompt = `${CONTENT_SAFETY_CONSTRAINTS}

Create a professional cover image for a photo template called "${description}".

Requirements:
- The image should clearly represent the theme
- Professional, high-quality, visually appealing
- Suitable as a thumbnail/cover image
- Clean composition, eye-catching
- No text or watermarks
- Modern, polished aesthetic
- Aspect ratio: ${width}:${height}
- MUST be original content, no copyrighted characters or real celebrities

The image should make users want to try this photo generation feature.`;
      } else {
        // 参考图 Prompt
        prompt = `${CONTENT_SAFETY_CONSTRAINTS}

Create a reference image for AI photo generation template "${description}".

This image will be used as a style reference for generating user photos.

Requirements:
- Professional portrait photography style
- Clear, high-quality image
- The face area should be clearly visible and well-lit (this is where user's face will be placed)
- Natural, flattering lighting
- Clean, appropriate background matching the theme
- Aspect ratio: ${width}:${height}
- Show a person in the scene that matches the template theme
- MUST be original content, use a fictional/generic person, no real celebrities

This reference image will guide the AI to generate similar style photos for users.`;
      }

      const result = await this.callImageLLM(prompt, { width, height });

      // 上传到 COS
      const url = await this.uploadImageToCOS(result, type);

      const duration = Date.now() - startTime;
      console.log(`[${this.name}] 单张图片生成完成, 耗时: ${duration}ms`);

      return {
        success: true,
        url: url,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${this.name}] 单张图片生成失败 (${duration}ms):`, error.message);

      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  // 这些方法不需要实现，因为我们重写了 execute
  buildPrompt(context) {
    return '';
  }

  parseResponse(response, context) {
    return response;
  }
}

module.exports = ImageAgent;
