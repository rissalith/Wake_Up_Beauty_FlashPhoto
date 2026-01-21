const express = require('express');
const router = express.Router();
const { getOne, getAll, run } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { getAllUserPhotos, getUserPhotos, getAllUserIds, isCOSConfigured, COS_CONFIG, getAssetImages, extractKeyFromUrl, deleteObject, cleanupExpiredTempFiles, getStorageStats } = require('../config/cos');

// 判断是否使用共享数据库（小程序数据库）
const isSharedDb = !!process.env.SHARED_DB_PATH;

// 获取照片表名
const getPhotoTable = () => isSharedDb ? 'photo_history' : 'photos';

// 获取照片列表
router.get('/', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, userId = '', status = '' } = req.query;
  const offset = (page - 1) * pageSize;
  const photoTable = getPhotoTable();

  let conditions = [];
  let params = [];

  if (userId) {
    conditions.push('user_id = ?');
    params.push(userId);
  }

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = getOne(`SELECT COUNT(*) as total FROM ${photoTable} ${whereClause}`, params);
  const total = countResult?.total || 0;

  let photos;
  if (isSharedDb) {
    photos = getAll(`
      SELECT id as photo_id, user_id, original_url as original_image, result_url as result_image,
             spec, bg_color, status, created_at
      FROM ${photoTable}
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);
  } else {
    photos = getAll(`
      SELECT * FROM ${photoTable}
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);
  }

  res.json({
    code: 200,
    data: {
      list: photos,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }
  });
});

// 获取COS素材图片列表（用于管理后台图片选择器）
// 注意：此路由必须在 /:id 之前，否则会被误匹配
router.get('/cos-images', authMiddleware, async (req, res) => {
  try {
    if (!isCOSConfigured()) {
      return res.status(503).json({
        code: 503,
        message: 'COS未配置'
      });
    }

    // 获取素材图片（扫描整个素材桶）
    const result = await getAssetImages();
    const { images, folders } = result;

    // 按时间排序（最新的在前）
    images.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    res.json({
      code: 200,
      data: images,
      folders: folders  // 返回文件夹列表供前端筛选
    });
  } catch (error) {
    console.error('获取COS素材图片失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取图片列表失败: ' + error.message
    });
  }
});

// 获取照片详情 (注意：此路由使用 :id 通配，必须放在其他具体路由之后)
router.get('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const photoTable = getPhotoTable();

  let photo;
  if (isSharedDb) {
    photo = getOne(`
      SELECT id as photo_id, user_id, original_url as original_image, result_url as result_image,
             spec, bg_color, status, created_at
      FROM ${photoTable} WHERE id = ?
    `, [id]);
  } else {
    photo = getOne(`SELECT * FROM ${photoTable} WHERE photo_id = ? OR id = ?`, [id, id]);
  }

  if (!photo) {
    return res.status(404).json({ code: 404, message: '照片不存在' });
  }

  let user;
  if (isSharedDb) {
    user = getOne('SELECT id as user_id, nickname, avatar_url FROM users WHERE id = ?', [photo.user_id]);
  } else {
    user = getOne('SELECT * FROM users WHERE user_id = ?', [photo.user_id]);
  }

  res.json({
    code: 200,
    data: { ...photo, user }
  });
});

// 删除照片
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const photoTable = getPhotoTable();

  let photo;
  if (isSharedDb) {
    photo = getOne(`SELECT id, original_url, result_url FROM ${photoTable} WHERE id = ?`, [id]);
  } else {
    photo = getOne(`SELECT * FROM ${photoTable} WHERE photo_id = ? OR id = ?`, [id, id]);
  }

  if (!photo) {
    return res.status(404).json({ code: 404, message: '照片不存在' });
  }

  // 删除COS文件
  const cosDeleteResults = { success: [], failed: [] };
  if (isCOSConfigured()) {
    const urlsToDelete = [
      photo.original_url || photo.original_image,
      photo.result_url || photo.result_image
    ].filter(Boolean);

    for (const url of urlsToDelete) {
      const key = extractKeyFromUrl(url);
      if (key) {
        try {
          await deleteObject(key);
          cosDeleteResults.success.push(key);
        } catch (err) {
          console.error(`[COS] 删除文件失败: ${key}`, err.message);
          cosDeleteResults.failed.push({ key, error: err.message });
        }
      }
    }
  }

  // 删除数据库记录
  run(`DELETE FROM ${photoTable} WHERE id = ?`, [photo.id]);

  res.json({
    code: 200,
    message: '删除成功',
    cosDeleted: cosDeleteResults.success.length,
    cosFailed: cosDeleteResults.failed.length
  });
});

// 照片统计
router.get('/stats/summary', authMiddleware, (req, res) => {
  const photoTable = getPhotoTable();
  const today = new Date().toISOString().split('T')[0];

  const todayPhotos = getOne(`
    SELECT COUNT(*) as count FROM ${photoTable} WHERE DATE(created_at) = ?
  `, [today]) || { count: 0 };

  const totalPhotos = getOne(`SELECT COUNT(*) as count FROM ${photoTable}`) || { count: 0 };

  const specStats = getAll(`
    SELECT spec, COUNT(*) as count FROM ${photoTable} GROUP BY spec
  `);

  res.json({
    code: 200,
    data: {
      today: todayPhotos.count,
      total: totalPhotos.count,
      bySpec: specStats
    }
  });
});

// ========== COS 照片接口 ==========

// 获取COS配置状态
router.get('/cos/status', authMiddleware, (req, res) => {
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

// 从COS获取所有照片
router.get('/cos/list', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, userId = '', type = '' } = req.query;

    if (!isCOSConfigured()) {
      return res.status(503).json({
        code: 503,
        message: 'COS未配置，请在.env文件中设置COS_SECRET_ID和COS_SECRET_KEY'
      });
    }

    let photos = [];

    if (userId) {
      photos = await getUserPhotos(userId);
    } else {
      photos = await getAllUserPhotos();
    }

    // 按类型筛选
    if (type) {
      photos = photos.filter(p => p.type === type);
    }

    // 按时间排序（最新的在前）
    photos.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    // 分页
    const total = photos.length;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const pagedPhotos = photos.slice(offset, offset + parseInt(pageSize));

    // 组织照片数据，将同一用户的temp和output配对
    const organizedPhotos = pagedPhotos.map(photo => {
      // 从数据库查找用户信息（兼容两种数据库结构）
      let user;
      if (isSharedDb) {
        user = getOne('SELECT id as user_id, nickname, avatar_url FROM users WHERE id = ?', [photo.userId]);
      } else {
        user = getOne('SELECT * FROM users WHERE user_id = ?', [photo.userId]);
      }

      return {
        ...photo,
        user: user || { user_id: photo.userId, nickname: photo.userId }
      };
    });

    res.json({
      code: 200,
      data: {
        list: organizedPhotos,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取COS照片失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取COS照片失败: ' + error.message
    });
  }
});

// 获取COS中所有用户列表
router.get('/cos/users', authMiddleware, async (req, res) => {
  try {
    if (!isCOSConfigured()) {
      return res.status(503).json({
        code: 503,
        message: 'COS未配置'
      });
    }

    const userIds = await getAllUserIds();

    // 获取用户详情（兼容两种数据库结构）
    const users = userIds.map(userId => {
      let user;
      if (isSharedDb) {
        user = getOne('SELECT id as user_id, nickname, avatar_url FROM users WHERE id = ?', [userId]);
      } else {
        user = getOne('SELECT * FROM users WHERE user_id = ?', [userId]);
      }
      return user || { user_id: userId, nickname: userId, fromCOS: true };
    });

    res.json({
      code: 200,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取用户列表失败: ' + error.message
    });
  }
});

// 获取指定用户在COS中的照片（带配对）
router.get('/cos/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isCOSConfigured()) {
      return res.status(503).json({
        code: 503,
        message: 'COS未配置'
      });
    }

    const photos = await getUserPhotos(userId);

    // 将temp和output照片配对（基于相似的时间戳）
    const tempPhotos = photos.filter(p => p.type === 'temp');
    const outputPhotos = photos.filter(p => p.type === 'output');

    // 按时间组织成记录
    const records = [];

    for (const output of outputPhotos) {
      // 从文件名提取时间戳
      const outputTime = extractTimestamp(output.fileName);

      // 查找最近的temp照片
      let matchedTemp = null;
      let minDiff = Infinity;

      for (const temp of tempPhotos) {
        const tempTime = extractTimestamp(temp.fileName);
        const diff = Math.abs(outputTime - tempTime);

        // 5分钟内的配对
        if (diff < 5 * 60 * 1000 && diff < minDiff) {
          minDiff = diff;
          matchedTemp = temp;
        }
      }

      records.push({
        id: output.key,
        userId: userId,
        originalImage: matchedTemp ? matchedTemp.url : null,
        resultImage: output.url,
        createdAt: output.lastModified,
        size: output.size,
        fileName: output.fileName
      });
    }

    // 添加没有配对的temp照片
    for (const temp of tempPhotos) {
      const hasMatch = records.some(r => r.originalImage === temp.url);
      if (!hasMatch) {
        records.push({
          id: temp.key,
          userId: userId,
          originalImage: temp.url,
          resultImage: null,
          createdAt: temp.lastModified,
          size: temp.size,
          fileName: temp.fileName
        });
      }
    }

    // 按时间排序
    records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 获取用户信息（兼容两种数据库结构）
    let user;
    if (isSharedDb) {
      user = getOne('SELECT id as user_id, nickname, avatar_url FROM users WHERE id = ?', [userId]);
    } else {
      user = getOne('SELECT * FROM users WHERE user_id = ?', [userId]);
    }

    res.json({
      code: 200,
      data: {
        user: user || { user_id: userId, nickname: userId },
        records: records,
        stats: {
          total: records.length,
          temp: tempPhotos.length,
          output: outputPhotos.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取用户照片失败: ' + error.message
    });
  }
});

// 从文件名提取时间戳
function extractTimestamp(fileName) {
  // 文件名格式: {timestamp}_{random}.jpg
  const match = fileName.match(/^(\d+)_/);
  if (match) {
    return parseInt(match[1]);
  }
  return 0;
}

// ========== COS 存储管理接口 ==========

// 获取 COS 存储统计
router.get('/cos/storage-stats', authMiddleware, async (req, res) => {
  try {
    if (!isCOSConfigured()) {
      return res.status(503).json({
        code: 503,
        message: 'COS未配置'
      });
    }

    const stats = await getStorageStats();
    res.json({
      code: 200,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取存储统计失败: ' + error.message
    });
  }
});

// 手动触发临时文件清理
router.post('/cos/cleanup', authMiddleware, async (req, res) => {
  try {
    if (!isCOSConfigured()) {
      return res.status(503).json({
        code: 503,
        message: 'COS未配置'
      });
    }

    const { maxAgeHours = 24 } = req.body;
    console.log(`[手动清理] 管理员触发临时文件清理，过期时间: ${maxAgeHours} 小时`);

    const result = await cleanupExpiredTempFiles(maxAgeHours);

    res.json({
      code: 200,
      message: '清理完成',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '清理失败: ' + error.message
    });
  }
});

module.exports = router;
