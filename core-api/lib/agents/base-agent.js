/**
 * Agent 基类
 * 所有 Agent 的父类，提供通用功能
 */

const axios = require('axios');

// AI 服务配置
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_API_BASE = process.env.AI_API_BASE || 'https://api.vectorengine.ai';
const DEFAULT_MODEL = process.env.AI_CONFIG_MODEL || 'gemini-3-flash-preview';

class BaseAgent {
  /**
   * @param {string} name - Agent 名称
   * @param {Object} options - 配置选项
   */
  constructor(name, options = {}) {
    this.name = name;
    this.model = options.model || DEFAULT_MODEL;
    this.temperature = options.temperature || 0.7;
    this.maxTokens = options.maxTokens || 4096;
    this.timeout = options.timeout || 60000;
    this.systemPrompt = '';
    this.retryCount = options.retryCount || 2;
  }

  /**
   * 执行 Agent 任务
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async execute(context) {
    const startTime = Date.now();
    console.log(`[${this.name}] 开始执行`);

    try {
      // 构建 Prompt
      const prompt = this.buildPrompt(context);

      // 调用 LLM
      const response = await this.callLLM(prompt);

      // 解析响应
      const result = this.parseResponse(response, context);

      const duration = Date.now() - startTime;
      console.log(`[${this.name}] 执行完成, 耗时: ${duration}ms`);

      return {
        success: true,
        data: result,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${this.name}] 执行失败 (${duration}ms):`, error.message);

      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * 构建 Prompt - 子类必须实现
   * @param {Object} context - 执行上下文
   * @returns {string} Prompt 文本
   */
  buildPrompt(context) {
    throw new Error(`${this.name}: buildPrompt 方法必须由子类实现`);
  }

  /**
   * 解析响应 - 子类必须实现
   * @param {string} response - LLM 响应
   * @param {Object} context - 执行上下文
   * @returns {Object} 解析结果
   */
  parseResponse(response, context) {
    throw new Error(`${this.name}: parseResponse 方法必须由子类实现`);
  }

  /**
   * 调用 LLM API
   * @param {string} prompt - Prompt 文本
   * @returns {Promise<string>} LLM 响应文本
   */
  async callLLM(prompt) {
    if (!AI_API_KEY) {
      throw new Error('AI_API_KEY 未配置');
    }

    let lastError = null;

    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[${this.name}] 重试第 ${attempt} 次`);
          await this.sleep(1000 * attempt); // 递增延迟
        }

        const requestData = {
          contents: [{
            parts: []
          }],
          generationConfig: {
            temperature: this.temperature,
            maxOutputTokens: this.maxTokens
          }
        };

        // 添加 System Prompt
        if (this.systemPrompt) {
          requestData.contents[0].parts.push({ text: this.systemPrompt });
        }

        // 添加用户 Prompt
        requestData.contents[0].parts.push({ text: prompt });

        const response = await axios.post(
          `${AI_API_BASE}/v1beta/models/${this.model}:generateContent`,
          requestData,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${AI_API_KEY}`
            },
            timeout: this.timeout
          }
        );

        // 提取文本响应 - 取最后一个 text part（跳过思考过程）
        const parts = response.data.candidates?.[0]?.content?.parts || [];
        const textParts = parts.filter(p => p.text && !p.thought);

        if (textParts.length === 0) {
          throw new Error('LLM 返回内容为空');
        }

        // 返回最后一个 text part（通常是最终结果）
        return textParts[textParts.length - 1].text;

      } catch (error) {
        lastError = error;

        // 如果是不可重试的错误，直接抛出
        if (error.response?.status === 400 || error.response?.status === 401) {
          throw error;
        }

        console.warn(`[${this.name}] API 调用失败:`, error.message);
      }
    }

    throw lastError || new Error('LLM 调用失败');
  }

  /**
   * 调用 LLM 生成图片
   * @param {string} prompt - 图片生成 Prompt
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 图片数据
   */
  async callImageLLM(prompt, options = {}) {
    if (!AI_API_KEY) {
      throw new Error('AI_API_KEY 未配置');
    }

    const imageModel = options.model || 'gemini-3-pro-image-preview';

    const requestData = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseModalities: ['image']
      }
    };

    // 如果有参考图片
    if (options.referenceImage) {
      requestData.contents[0].parts.unshift({
        inlineData: {
          mimeType: options.referenceMimeType || 'image/jpeg',
          data: options.referenceImage
        }
      });
    }

    const response = await axios.post(
      `${AI_API_BASE}/v1beta/models/${imageModel}:generateContent`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`
        },
        timeout: options.timeout || 120000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    // 提取图片数据
    const data = response.data;
    let imageData = null;
    let mimeType = 'image/png';

    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData) {
          imageData = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
          break;
        }
        if (part.inline_data) {
          imageData = part.inline_data.data;
          mimeType = part.inline_data.mime_type || 'image/png';
          break;
        }
      }
    }

    if (!imageData) {
      // 检查是否返回了文本错误
      const textPart = data.candidates?.[0]?.content?.parts?.find(p => p.text);
      if (textPart) {
        throw new Error(`图片生成失败: ${textPart.text.substring(0, 100)}`);
      }
      throw new Error('未获取到图片数据');
    }

    return { imageData, mimeType };
  }

  /**
   * 解析 JSON 响应
   * @param {string} text - 响应文本
   * @returns {Object} 解析后的 JSON
   */
  parseJSON(text) {
    // 尝试直接解析
    try {
      return JSON.parse(text);
    } catch (e) {
      // 尝试提取 JSON 块
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // 尝试提取 { } 之间的内容
      const braceMatch = text.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        return JSON.parse(braceMatch[0]);
      }

      throw new Error('无法解析 JSON 响应');
    }
  }

  /**
   * 延迟函数
   * @param {number} ms - 毫秒数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 记录日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  log(message, data = null) {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[${timestamp}] [${this.name}] ${message}`, data);
    } else {
      console.log(`[${timestamp}] [${this.name}] ${message}`);
    }
  }
}

module.exports = BaseAgent;
