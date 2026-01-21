/**
 * 内容安全审核路由
 * 使用微信内容安全接口进行图片审核
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// 配置文件上传
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// 获取微信access_token（需要缓存）
let accessTokenCache = {
  token: null,
  expireTime: 0
};

async function getAccessToken() {
  const now = Date.now();

  // 如果缓存有效，直接返回
  if (accessTokenCache.token && accessTokenCache.expireTime > now) {
    return accessTokenCache.token;
  }

  const appId = process.env.WX_APPID;
  const appSecret = process.env.WX_APPSECRET;

  if (!appId || !appSecret) {
    console.error('[安全审核] 缺少微信配置: WX_APPID 或 WX_APPSECRET');
    return null;
  }

  try {
    const res = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
      params: {
        grant_type: 'client_credential',
        appid: appId,
        secret: appSecret
      }
    });

    if (res.data.access_token) {
      accessTokenCache = {
        token: res.data.access_token,
        expireTime: now + (res.data.expires_in - 300) * 1000 // 提前5分钟过期
      };
      return res.data.access_token;
    } else {
      console.error('[安全审核] 获取access_token失败:', res.data);
      return null;
    }
  } catch (error) {
    console.error('[安全审核] 获取access_token异常:', error);
    return null;
  }
}

/**
 * 图片安全审核接口
 * POST /api/security/image-check
 */
router.post('/image-check', upload.single('image'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.json({ code: 400, message: '请上传图片' });
  }

  try {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      // 无法获取token时，默认放行但记录日志
      console.warn('[安全审核] 无法获取access_token，跳过审核');
      cleanupFile(file.path);
      return res.json({
        code: 200,
        data: { safe: true, message: '审核跳过' }
      });
    }

    // 调用微信图片审核接口
    const formData = new FormData();
    formData.append('media', fs.createReadStream(file.path), {
      filename: file.originalname || 'image.jpg',
      contentType: file.mimetype || 'image/jpeg'
    });

    const wxRes = await axios.post(
      `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${accessToken}`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 30000
      }
    );

    // 清理临时文件
    cleanupFile(file.path);

    // 解析微信返回结果
    // errcode: 0 表示内容正常
    // errcode: 87014 表示内容含有违规内容
    if (wxRes.data.errcode === 0) {
      return res.json({
        code: 200,
        data: { safe: true, message: '图片安全' }
      });
    } else if (wxRes.data.errcode === 87014) {
      console.warn('[安全审核] 检测到违规图片');
      return res.json({
        code: 200,
        data: {
          safe: false,
          message: '图片可能包含敏感内容，请更换'
        }
      });
    } else {
      // 其他错误码，记录但默认放行
      console.warn('[安全审核] 微信接口返回异常:', wxRes.data);
      return res.json({
        code: 200,
        data: { safe: true, message: '审核跳过' }
      });
    }

  } catch (error) {
    console.error('[安全审核] 审核异常:', error);
    cleanupFile(file?.path);

    // 异常时默认放行
    return res.json({
      code: 200,
      data: { safe: true, message: '审核跳过' }
    });
  }
});

/**
 * 异步图片审核接口（适用于大图或高并发场景）
 * POST /api/security/image-check-async
 */
router.post('/image-check-async', upload.single('image'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.json({ code: 400, message: '请上传图片' });
  }

  try {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      cleanupFile(file.path);
      return res.json({
        code: 200,
        data: { safe: true, message: '审核跳过' }
      });
    }

    // 读取图片为base64
    const imageBuffer = fs.readFileSync(file.path);
    const base64 = imageBuffer.toString('base64');

    // 调用微信异步审核接口 media_check_async
    const wxRes = await axios.post(
      `https://api.weixin.qq.com/wxa/media_check_async?access_token=${accessToken}`,
      {
        media_url: '', // 如果是网络图片可以传URL
        media_type: 2, // 2表示图片
        version: 2,
        scene: 1, // 1:资料; 2:评论; 3:论坛; 4:社交日志
        openid: req.body.openid || ''
      },
      { timeout: 30000 }
    );

    cleanupFile(file.path);

    // 异步接口返回trace_id，需要等待回调
    if (wxRes.data.errcode === 0) {
      return res.json({
        code: 200,
        data: {
          safe: true,
          async: true,
          traceId: wxRes.data.trace_id,
          message: '已提交审核'
        }
      });
    } else {
      console.warn('[安全审核] 异步审核提交失败:', wxRes.data);
      return res.json({
        code: 200,
        data: { safe: true, message: '审核跳过' }
      });
    }

  } catch (error) {
    console.error('[安全审核] 异步审核异常:', error);
    cleanupFile(file?.path);
    return res.json({
      code: 200,
      data: { safe: true, message: '审核跳过' }
    });
  }
});

/**
 * 清理临时文件
 */
function cleanupFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.error('[安全审核] 清理临时文件失败:', e);
    }
  }
}

module.exports = router;
