/**
 * 后台管理 - 照片/素材管理路由
 */
const express = require('express');
const router = express.Router();
const { isCOSConfigured, getAssetImages, COS_CONFIG } = require('../../config/cos');

// 获取COS素材图片列表（用于管理后台图片选择器）
router.get('/cos-images', async (req, res) => {
  try {
    if (!isCOSConfigured()) {
      return res.status(503).json({
        code: 503,
        message: 'COS未配置'
      });
    }

    const result = await getAssetImages();
    const { images, folders } = result;

    // 按时间排序（最新的在前）
    images.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    res.json({
      code: 200,
      data: images,
      folders: folders
    });
  } catch (error) {
    console.error('获取COS素材图片失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取图片列表失败: ' + error.message
    });
  }
});

// 获取COS配置状态
router.get('/cos/status', (req, res) => {
  res.json({
    code: 200,
    data: {
      configured: isCOSConfigured(),
      bucket: COS_CONFIG.bucket,
      region: COS_CONFIG.region,
      baseUrl: COS_CONFIG.baseUrl
    }
  });
});

module.exports = router;
