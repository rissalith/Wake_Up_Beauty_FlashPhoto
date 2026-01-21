const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadBase64ToCOS, uploadBufferToCOS, isCOSConfigured, COS_CONFIG } = require('../config/cos');

// 配置 multer 内存存储
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 // 500KB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只能上传图片文件'), false);
    }
  }
});

// 上传场景图标（文件上传方式）
router.post('/icon', upload.single('file'), async (req, res) => {
  try {
    const { sceneId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ code: 400, message: '请选择图片文件' });
    }

    // 检查COS是否配置
    if (!isCOSConfigured()) {
      return res.status(500).json({ code: 500, message: 'COS未配置，无法上传图片' });
    }

    // 生成文件名
    const timestamp = Date.now();
    const ext = file.originalname.split('.').pop() || 'png';
    const fileName = sceneId ? `${sceneId}_${timestamp}.${ext}` : `icon_${timestamp}.${ext}`;

    // 存储路径：scenes/icons/
    const key = `scenes/icons/${fileName}`;

    // 上传到COS
    const result = await uploadBufferToCOS(file.buffer, key, file.mimetype);

    console.log(`[Upload] 场景图标上传成功: ${result.url}`);

    res.json({
      code: 200,
      message: '上传成功',
      data: {
        url: result.url,
        key: result.key
      }
    });

  } catch (error) {
    console.error('[Upload] 场景图标上传失败:', error);
    res.status(500).json({
      code: 500,
      message: '图片上传失败: ' + error.message
    });
  }
});

// 上传图片到COS（Base64方式）
router.post('/image', async (req, res) => {
  try {
    const { userId, imageData, type = 'feedback' } = req.body;

    if (!userId) {
      return res.status(400).json({ code: 400, message: '缺少userId参数' });
    }

    if (!imageData) {
      return res.status(400).json({ code: 400, message: '缺少imageData参数' });
    }

    // 检查COS是否配置
    if (!isCOSConfigured()) {
      return res.status(500).json({ code: 500, message: 'COS未配置，无法上传图片' });
    }

    // 生成文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const fileName = `${timestamp}_${random}.jpg`;

    // 根据类型确定存储路径
    let key;
    switch (type) {
      case 'feedback':
        key = `users/${userId}/feedback/${fileName}`;
        break;
      case 'avatar':
        key = `users/${userId}/avatar/${fileName}`;
        break;
      case 'temp':
        key = `users/${userId}/temp/${fileName}`;
        break;
      case 'output':
        key = `users/${userId}/output/${fileName}`;
        break;
      default:
        key = `users/${userId}/${type}/${fileName}`;
    }

    // 上传到COS
    const result = await uploadBase64ToCOS(imageData, key);

    console.log(`[Upload] 图片上传成功: ${result.url}`);

    res.json({
      code: 200,
      message: '上传成功',
      data: {
        url: result.url,
        key: result.key
      }
    });

  } catch (error) {
    console.error('[Upload] 图片上传失败:', error);
    res.status(500).json({
      code: 500,
      message: '图片上传失败: ' + error.message
    });
  }
});

// 获取COS上传凭证（供小程序直接上传使用）
router.get('/cos-credentials', async (req, res) => {
  try {
    const { userId, type = 'feedback' } = req.query;

    if (!userId) {
      return res.status(400).json({ code: 400, message: '缺少userId参数' });
    }

    if (!isCOSConfigured()) {
      return res.status(500).json({ code: 500, message: 'COS未配置' });
    }

    // 生成临时密钥（需要配置STS服务）
    // 这里简化处理，返回基本配置信息
    res.json({
      code: 200,
      data: {
        bucket: COS_CONFIG.bucket,
        region: COS_CONFIG.region,
        baseUrl: COS_CONFIG.baseUrl,
        prefix: `users/${userId}/${type}/`
      }
    });

  } catch (error) {
    console.error('[Upload] 获取COS凭证失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取COS凭证失败: ' + error.message
    });
  }
});

module.exports = router;
