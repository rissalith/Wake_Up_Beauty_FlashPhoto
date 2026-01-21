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
      AI_API_BASE + '/v1beta/models/gemini-3-pro-image-preview:generateContent',
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
      console.log(`[AI服务] 成功生成图片, 耗时: ${duration}ms`);
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
  console.log(`  健康检查: http://localhost:${PORT}/health`);
  console.log(`  API: http://localhost:${PORT}/api/ai/generate-image`);
  console.log('==========================================');
});
