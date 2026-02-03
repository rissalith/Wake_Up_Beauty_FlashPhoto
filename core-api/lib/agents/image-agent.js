/**
 * 图片生成 Agent (Image Agent)
 * 职责: 生成参考图和封面图
 */

const BaseAgent = require('./base-agent');

class ImageAgent extends BaseAgent {
  constructor(options = {}) {
    super('ImageAgent', {
      model: 'gemini-3-pro-image-preview', // 使用图片生成模型
      timeout: 120000,
      ...options
    });
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

      // 1. 生成封面图
      console.log(`[${this.name}] 生成封面图...`);
      const coverPrompt = this.buildCoverPrompt(config, plan);
      const coverResult = await this.callImageLLM(coverPrompt);
      results.cover_image = coverResult;

      // 2. 生成参考图
      console.log(`[${this.name}] 生成参考图...`);
      const referencePrompt = this.buildReferencePrompt(config, plan);
      const referenceResult = await this.callImageLLM(referencePrompt);
      results.reference_image = referenceResult;

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
   * 构建封面图 Prompt
   * @param {Object} config - 场景配置
   * @param {Object} plan - 规划信息
   * @returns {string} Prompt
   */
  buildCoverPrompt(config, plan) {
    const sceneName = config.scene.name || plan.scene_name;
    const keywords = plan.style_keywords || [];

    let prompt = `Create a professional cover image for a photo generation app feature called "${sceneName}".

Requirements:
- The image should clearly represent the theme: ${sceneName}
- Style keywords: ${keywords.join(', ')}
- Professional, high-quality, visually appealing
- Suitable as a thumbnail/cover image
- Clean composition, eye-catching
- No text or watermarks
- Square format (1:1 aspect ratio)
- Modern, polished aesthetic

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

    let prompt = `Create a reference image for AI photo generation feature "${sceneName}".

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

  // 这些方法不需要实现，因为我们重写了 execute
  buildPrompt(context) {
    return '';
  }

  parseResponse(response, context) {
    return response;
  }
}

module.exports = ImageAgent;
