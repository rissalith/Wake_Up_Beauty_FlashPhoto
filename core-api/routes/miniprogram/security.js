/**
 * 内容安全审核路由
 * 调用微信内容安全 API 进行文本和图片审核
 */
const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');

// 获取 access_token 的缓存
let accessTokenCache = {
  token: null,
  expiresAt: 0
};

/**
 * 获取微信 access_token
 */
async function getAccessToken() {
  const now = Date.now();

  // 如果缓存有效，直接返回
  if (accessTokenCache.token && accessTokenCache.expiresAt > now + 60000) {
    return accessTokenCache.token;
  }

  const appid = process.env.WX_APPID;
  const secret = process.env.WX_SECRET;

  if (!appid || !secret) {
    throw new Error('微信配置缺失：WX_APPID 或 WX_SECRET 未配置');
  }

  return new Promise((resolve, reject) => {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.access_token) {
            accessTokenCache = {
              token: result.access_token,
              expiresAt: now + (result.expires_in * 1000)
            };
            resolve(result.access_token);
          } else {
            reject(new Error(result.errmsg || '获取 access_token 失败'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * 文本内容安全检查
 * POST /api/security/text-check
 *
 * 请求体:
 * - content: 要检查的文本内容
 * - openid: 用户 openid（可选）
 * - scene: 场景值 1-资料 2-评论 3-论坛 4-社交日志（默认2）
 */
router.post('/text-check', async (req, res) => {
  try {
    const { content, openid, scene = 2 } = req.body;

    if (!content || typeof content !== 'string') {
      return res.json({
        code: 200,
        data: { safe: true, message: '空内容' }
      });
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
      return res.json({
        code: 200,
        data: { safe: true, message: '空内容' }
      });
    }

    // 获取 access_token
    let accessToken;
    try {
      accessToken = await getAccessToken();
    } catch (tokenError) {
      console.error('[Security] 获取 access_token 失败:', tokenError.message);
      // access_token 获取失败时，为了安全起见，拒绝内容
      return res.json({
        code: 200,
        data: { safe: false, message: '安全服务暂时不可用，请稍后重试' }
      });
    }

    // 调用微信内容安全接口
    const result = await callWxMsgSecCheck(accessToken, trimmedContent, openid, scene);

    if (result.errcode === 0) {
      // 审核通过
      res.json({
        code: 200,
        data: { safe: true, message: '文本安全' }
      });
    } else if (result.errcode === 87014) {
      // 内容含有违法违规内容
      res.json({
        code: 200,
        data: { safe: false, message: '内容包含敏感信息，请修改后重试' }
      });
    } else {
      // 其他错误
      console.error('[Security] 微信审核接口返回错误:', result);
      res.json({
        code: 200,
        data: { safe: false, message: '内容审核失败，请重试' }
      });
    }
  } catch (error) {
    console.error('[Security] 文本审核异常:', error);
    res.json({
      code: 200,
      data: { safe: false, message: '审核服务异常，请稍后重试' }
    });
  }
});

/**
 * 调用微信 msg_sec_check 接口
 */
function callWxMsgSecCheck(accessToken, content, openid, scene) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      content: content,
      version: 2,
      scene: scene,
      openid: openid || ''
    });

    const options = {
      hostname: 'api.weixin.qq.com',
      port: 443,
      path: `/wxa/msg_sec_check?access_token=${accessToken}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 图片内容安全检查
 * POST /api/security/image-check
 *
 * 使用 multipart/form-data 上传图片
 * - image: 图片文件
 */
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 } // 1MB 限制
});

router.post('/image-check', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({
        code: 200,
        data: { safe: false, message: '未上传图片' }
      });
    }

    // 获取 access_token
    let accessToken;
    try {
      accessToken = await getAccessToken();
    } catch (tokenError) {
      console.error('[Security] 获取 access_token 失败:', tokenError.message);
      return res.json({
        code: 200,
        data: { safe: false, message: '安全服务暂时不可用，请稍后重试' }
      });
    }

    // 调用微信图片安全接口
    const result = await callWxImgSecCheck(accessToken, req.file.buffer);

    if (result.errcode === 0) {
      res.json({
        code: 200,
        data: { safe: true, message: '图片安全' }
      });
    } else if (result.errcode === 87014) {
      res.json({
        code: 200,
        data: { safe: false, message: '图片包含敏感内容，请更换' }
      });
    } else {
      console.error('[Security] 微信图片审核接口返回错误:', result);
      res.json({
        code: 200,
        data: { safe: false, message: '图片审核失败，请重试' }
      });
    }
  } catch (error) {
    console.error('[Security] 图片审核异常:', error);
    res.json({
      code: 200,
      data: { safe: false, message: '审核服务异常，请稍后重试' }
    });
  }
});

/**
 * 调用微信 img_sec_check 接口
 */
function callWxImgSecCheck(accessToken, imageBuffer) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2);

    // 构建 multipart/form-data 请求体
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="image.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const headerBuffer = Buffer.from(header, 'utf8');
    const footerBuffer = Buffer.from(footer, 'utf8');
    const body = Buffer.concat([headerBuffer, imageBuffer, footerBuffer]);

    const options = {
      hostname: 'api.weixin.qq.com',
      port: 443,
      path: `/wxa/img_sec_check?access_token=${accessToken}`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    req.write(body);
    req.end();
  });
}

module.exports = router;
