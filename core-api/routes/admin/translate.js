/**
 * 腾讯云机器翻译 API 路由
 * 支持中英文翻译
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const https = require('https');

// 腾讯云 API 签名
function sign(secretKey, signStr) {
  return crypto.createHmac('sha256', secretKey).update(signStr).digest('hex');
}

function getHash(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

function getDate(timestamp) {
  const date = new Date(timestamp * 1000);
  const year = date.getUTCFullYear();
  const month = ('0' + (date.getUTCMonth() + 1)).slice(-2);
  const day = ('0' + date.getUTCDate()).slice(-2);
  return `${year}-${month}-${day}`;
}

// 调用腾讯云翻译 API
async function translateText(text, source = 'zh', target = 'en') {
  const secretId = process.env.COS_SECRET_ID;
  const secretKey = process.env.COS_SECRET_KEY;

  if (!secretId || !secretKey) {
    throw new Error('腾讯云密钥未配置');
  }

  const service = 'tmt';
  const host = 'tmt.tencentcloudapi.com';
  const action = 'TextTranslate';
  const version = '2018-03-21';
  const region = 'ap-guangzhou';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = getDate(timestamp);

  // 请求体
  const payload = JSON.stringify({
    SourceText: text,
    Source: source,
    Target: target,
    ProjectId: 0
  });

  // 签名过程
  const hashedRequestPayload = getHash(payload);
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';

  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload
  ].join('\n');

  const algorithm = 'TC3-HMAC-SHA256';
  const hashedCanonicalRequest = getHash(canonicalRequest);
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    hashedCanonicalRequest
  ].join('\n');

  // 计算签名
  const secretDate = sign('TC3' + secretKey, date);
  const secretService = sign(secretDate, service);
  const secretSigning = sign(secretService, 'tc3_request');
  const signature = sign(secretSigning, stringToSign);

  const authorization = [
    `${algorithm} Credential=${secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(', ');

  // 发送请求
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Version': version,
        'X-TC-Region': region,
        'Authorization': authorization
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.Response && result.Response.TargetText) {
            resolve(result.Response.TargetText);
          } else if (result.Response && result.Response.Error) {
            reject(new Error(result.Response.Error.Message));
          } else {
            reject(new Error('翻译失败：未知响应'));
          }
        } catch (e) {
          reject(new Error('解析响应失败'));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// 翻译接口 - 中文翻译成英文
router.post('/to-english', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.json({ code: -1, message: '请提供需要翻译的文本' });
    }

    if (text.length > 2000) {
      return res.json({ code: -1, message: '文本长度不能超过2000字符' });
    }

    const translatedText = await translateText(text, 'zh', 'en');

    res.json({
      code: 0,
      data: {
        original: text,
        translated: translatedText
      }
    });
  } catch (error) {
    console.error('翻译失败:', error.message);
    res.json({ code: -1, message: '翻译失败: ' + error.message });
  }
});

// 批量翻译接口 - 支持中英文
router.post('/batch', async (req, res) => {
  try {
    const { texts } = req.body;

    if (!Array.isArray(texts) || texts.length === 0) {
      return res.json({ code: -1, message: '请提供需要翻译的文本数组' });
    }

    if (texts.length > 20) {
      return res.json({ code: -1, message: '单次最多翻译20条' });
    }

    const results = [];
    for (const text of texts) {
      if (text && typeof text === 'string') {
        try {
          const translated = await translateText(text, 'zh', 'en');
          results.push({ original: text, translated });
        } catch (e) {
          results.push({ original: text, translated: text, error: e.message });
        }
      } else {
        results.push({ original: text, translated: text });
      }
    }

    res.json({
      code: 0,
      data: results
    });
  } catch (error) {
    console.error('批量翻译失败:', error.message);
    res.json({ code: -1, message: '批量翻译失败: ' + error.message });
  }
});

module.exports = router;
