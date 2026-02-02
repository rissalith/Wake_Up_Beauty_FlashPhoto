/**
 * AI 服务 - 独立微服务
 * 端口: 3002
 * 职责: AI 图片生成
 */
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.AI_SERVICE_PORT || 3002;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// AI 服务配置
const AI_API_KEY = process.env.AI_API_KEY || 'sk-GtmTU7PTpPmWTVurx2SPBdaRsJoDPaJDpkSgRIK8Xu6huLt8';
const AI_API_BASE = process.env.AI_API_BASE || 'https://api.vectorengine.ai';
const AI_MODEL = process.env.AI_MODEL || 'gemini-3-pro-image-preview';

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ai-service',
    port: PORT,
    timestamp: new Date().toISOString(),
    config: {
      apiKeyConfigured: !!AI_API_KEY,
      apiBase: AI_API_BASE
    }
  });
});

// AI 图片生成接口
app.post('/api/ai/generate-image', async (req, res) => {
  const startTime = Date.now();
  
  if (!AI_API_KEY) {
    console.error('[AI服务] AI_API_KEY 未配置');
    return res.status(500).json({ code: 500, message: 'AI服务未配置' });
  }

  const { prompt, imageBase64, mimeType } = req.body;

  if (!prompt) {
    return res.status(400).json({ code: 400, message: '缺少 prompt 参数' });
  }

  console.log('[AI服务] 收到请求, prompt长度:', prompt.length, ', 有图片:', !!imageBase64);
  console.log('========== AI生图调试信息 ==========');
  console.log('[AI服务] 调用模型:', AI_MODEL);
  console.log('[AI服务] API地址:', AI_API_BASE + '/v1beta/models/' + AI_MODEL + ':generateContent');
  console.log('[AI服务] 完整Prompt:');
  console.log(prompt);
  console.log('[AI服务] 图片类型:', mimeType || 'image/jpeg');
  console.log('[AI服务] 图片大小:', imageBase64 ? Math.round(imageBase64.length / 1024) + 'KB' : '无图片');
  console.log('====================================');

  try {
    const requestData = {
      contents: [{
        parts: []
      }],
      generationConfig: { responseModalities: ['image'] }
    };

    // 如果有图片，先添加图片
    if (imageBase64) {
      requestData.contents[0].parts.push({
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: imageBase64
        }
      });
    }

    // 添加文本提示
    requestData.contents[0].parts.push({ text: prompt });

    const response = await axios.post(
      AI_API_BASE + '/v1beta/models/' + AI_MODEL + ':generateContent',
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + AI_API_KEY
        },
        timeout: 120000, // 2分钟超时
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    const data = response.data;
    let imageData = null;
    let responseMimeType = 'image/png';

    // 解析响应
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData) {
          imageData = part.inlineData.data;
          responseMimeType = part.inlineData.mimeType || 'image/png';
          break;
        }
        if (part.inline_data) {
          imageData = part.inline_data.data;
          responseMimeType = part.inline_data.mime_type || 'image/png';
          break;
        }
      }
    }

    const duration = Date.now() - startTime;

    if (imageData) {
      console.log(`[AI服务] 成功生成图片, 耗时: ${duration}ms, 模型: ${AI_MODEL}`);
      return res.json({
        code: 200,
        data: { imageData, mimeType: responseMimeType }
      });
    } else {
      // 检查是否返回了文本
      const textPart = data.candidates?.[0]?.content?.parts?.find(p => p.text);
      if (textPart) {
        console.warn('[AI服务] 模型返回文本而非图片:', textPart.text.substring(0, 100));
        return res.status(400).json({
          code: 400,
          message: '模型返回文本而非图片: ' + textPart.text.substring(0, 100)
        });
      }
      return res.status(500).json({ code: 500, message: '未获取到图片' });
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[AI服务] 请求失败 (${duration}ms):`, error.message);
    
    if (error.response) {
      const errData = error.response.data;
      let errMsg = '服务器错误';
      if (errData?.error?.message) {
        errMsg = errData.error.message;
      } else if (typeof errData === 'string') {
        errMsg = errData;
      }
      return res.status(error.response.status).json({
        code: error.response.status,
        message: errMsg
      });
    }
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        code: 504,
        message: 'AI服务响应超时，请稍后重试'
      });
    }
    
    return res.status(500).json({
      code: 500,
      message: '网络请求失败: ' + error.message
    });
  }
});

// 参考图替换模式 - 双图输入接口
app.post('/api/ai/generate-with-reference', async (req, res) => {
  const startTime = Date.now();

  if (!AI_API_KEY) {
    console.error('[AI服务] AI_API_KEY 未配置');
    return res.status(500).json({ code: 500, message: 'AI服务未配置' });
  }

  const {
    prompt,
    referenceImageBase64,  // 参考样式图
    userImageBase64,       // 用户照片
    referenceMimeType,
    userMimeType,
    referenceWeight = 0.8, // 参考图权重
    faceSwapMode = 'replace' // replace: 完全替换, blend: 融合
  } = req.body;

  if (!prompt) {
    return res.status(400).json({ code: 400, message: '缺少 prompt 参数' });
  }

  if (!referenceImageBase64) {
    return res.status(400).json({ code: 400, message: '缺少参考图' });
  }

  if (!userImageBase64) {
    return res.status(400).json({ code: 400, message: '缺少用户照片' });
  }

  console.log('[AI服务] 参考图替换模式请求');
  console.log('========== 参考图替换调试信息 ==========');
  console.log('[AI服务] 调用模型:', AI_MODEL);
  console.log('[AI服务] 参考图权重:', referenceWeight);
  console.log('[AI服务] 替换模式:', faceSwapMode);
  console.log('[AI服务] 参考图大小:', Math.round(referenceImageBase64.length / 1024) + 'KB');
  console.log('[AI服务] 用户照片大小:', Math.round(userImageBase64.length / 1024) + 'KB');
  console.log('[AI服务] Prompt长度:', prompt.length);
  console.log('[AI服务] 完整Prompt:');
  console.log(prompt);
  console.log('=========================================');

  try {
    // 构建增强的 Prompt
    const enhancedPrompt = buildReferencePrompt(prompt, referenceWeight, faceSwapMode);

    const requestData = {
      contents: [{
        parts: [
          // 第一张图：参考样式图
          {
            inlineData: {
              mimeType: referenceMimeType || 'image/jpeg',
              data: referenceImageBase64
            }
          },
          // 第二张图：用户照片
          {
            inlineData: {
              mimeType: userMimeType || 'image/jpeg',
              data: userImageBase64
            }
          },
          // 增强后的 Prompt
          { text: enhancedPrompt }
        ]
      }],
      generationConfig: { responseModalities: ['image'] }
    };

    const response = await axios.post(
      AI_API_BASE + '/v1beta/models/' + AI_MODEL + ':generateContent',
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + AI_API_KEY
        },
        timeout: 180000, // 3分钟超时（双图处理可能更慢）
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    const data = response.data;
    let imageData = null;
    let responseMimeType = 'image/png';

    // 解析响应
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData) {
          imageData = part.inlineData.data;
          responseMimeType = part.inlineData.mimeType || 'image/png';
          break;
        }
        if (part.inline_data) {
          imageData = part.inline_data.data;
          responseMimeType = part.inline_data.mime_type || 'image/png';
          break;
        }
      }
    }

    const duration = Date.now() - startTime;

    if (imageData) {
      console.log(`[AI服务] 参考图替换成功, 耗时: ${duration}ms`);
      return res.json({
        code: 200,
        data: { imageData, mimeType: responseMimeType }
      });
    } else {
      const textPart = data.candidates?.[0]?.content?.parts?.find(p => p.text);
      if (textPart) {
        console.warn('[AI服务] 模型返回文本而非图片:', textPart.text.substring(0, 100));
        return res.status(400).json({
          code: 400,
          message: '模型返回文本而非图片: ' + textPart.text.substring(0, 100)
        });
      }
      return res.status(500).json({ code: 500, message: '未获取到图片' });
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[AI服务] 参考图替换失败 (${duration}ms):`, error.message);

    if (error.response) {
      const errData = error.response.data;
      let errMsg = '服务器错误';
      if (errData?.error?.message) {
        errMsg = errData.error.message;
      } else if (typeof errData === 'string') {
        errMsg = errData;
      }
      return res.status(error.response.status).json({
        code: error.response.status,
        message: errMsg
      });
    }

    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        code: 504,
        message: 'AI服务响应超时，请稍后重试'
      });
    }

    return res.status(500).json({
      code: 500,
      message: '网络请求失败: ' + error.message
    });
  }
});

/**
 * 构建参考图替换的增强 Prompt
 */
function buildReferencePrompt(userPrompt, referenceWeight, faceSwapMode) {
  const baseInstruction = `You are given two images:
- Image 1 (Reference): This is the style reference image. Keep its overall composition, background, clothing style, pose, and artistic style.
- Image 2 (User Photo): This contains the person's face that should appear in the final image.

【Core Task】
Generate a new image that:
1. Maintains the exact composition, background, lighting, and overall style of Image 1 (Reference)
2. Replaces the face in Image 1 with the face from Image 2 (User Photo)
3. Ensures natural blending of the face with proper lighting, skin tone matching, and seamless edges
4. Preserves the user's facial features, expression characteristics, and identity

【Style Preservation (Weight: ${referenceWeight})】
- Keep ${Math.round(referenceWeight * 100)}% fidelity to the reference image's style
- Maintain the exact pose, clothing, and background from the reference
- Match the lighting direction and color temperature

【Face Replacement Mode: ${faceSwapMode}】
${faceSwapMode === 'replace' ?
  '- Completely replace the face while maintaining natural proportions\n- Adjust face size to match the reference image body proportions' :
  '- Blend facial features while keeping some reference characteristics\n- Create a harmonious fusion of both faces'}

【User Instructions】
${userPrompt}

【Quality Requirements】
- High resolution output
- Natural skin texture and lighting
- No visible seams or artifacts around the face
- Consistent color grading throughout the image`;

  return baseInstruction;
}

// 错误处理
app.use((err, req, res, next) => {
  console.error('[AI服务] 未捕获错误:', err);
  res.status(500).json({ code: 500, message: '服务器内部错误' });
});

// 启动服务
app.listen(PORT, () => {
  console.log('==========================================');
  console.log('  AI 服务已启动');
  console.log(`  端口: ${PORT}`);
  console.log(`  模型: ${AI_MODEL}`);
  console.log(`  API地址: ${AI_API_BASE}`);
  console.log(`  健康检查: http://localhost:${PORT}/health`);
  console.log(`  API: http://localhost:${PORT}/api/ai/generate-image`);
  console.log('==========================================');
});
