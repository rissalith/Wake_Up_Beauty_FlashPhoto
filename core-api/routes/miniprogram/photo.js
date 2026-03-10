/**
 * 小程序照片路由
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { getDb, dbRun, saveDatabase } = require('../../config/database');
const { isCOSConfigured, extractKeyFromUrl, deleteObject, deleteObjects, uploadToUserBucket } = require('../../config/cos');

// AI 服务内网地址（Docker 网络内部通信）
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:3002';

// 创建照片任务
router.post('/create', (req, res) => {
  try {
    const db = getDb();
    const { userId, taskId, scene, spec, beauty, clothing, bgColor, originalUrl, pointsCost } = req.body;

    if (!userId) {
      return res.status(400).json({ code: -1, msg: '缺少用户ID' });
    }

    const photoId = uuidv4();

    dbRun(db, `
      INSERT INTO photo_history (id, user_id, task_id, scene, spec, beauty, clothing, bg_color, original_url, status, points_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating', ?)
    `, [photoId, userId, taskId || null, scene || null, spec || null, beauty || null, clothing || null, bgColor || null, originalUrl || null, pointsCost || 50]);

    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { photoId }
    });
  } catch (error) {
    console.error('创建照片任务错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新照片状态
router.put('/:photoId', (req, res) => {
  try {
    const db = getDb();
    const { photoId } = req.params;
    const { status, resultUrl, errorMsg } = req.body;

    dbRun(db, `
      UPDATE photo_history
      SET status = COALESCE(?, status),
          result_url = COALESCE(?, result_url),
          error_msg = COALESCE(?, error_msg),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status || null, resultUrl || null, errorMsg || null, photoId]);

    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新照片状态错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取照片历史
router.get('/history/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { status, page = 1, pageSize = 20 } = req.query;

    let sql = 'SELECT * FROM photo_history WHERE user_id = ?';
    const params = [userId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const photos = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);

    let countSql = 'SELECT COUNT(*) as count FROM photo_history WHERE user_id = ?';
    const countParams = [userId];
    if (status) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }
    const total = db.prepare(countSql).get(...countParams).count;

    res.json({
      code: 0,
      data: {
        list: photos,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取照片历史错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 删除照片
router.delete('/:photoId', async (req, res) => {
  try {
    const db = getDb();
    const { photoId } = req.params;

    // 先查询照片信息以获取 COS URL
    const photo = db.prepare('SELECT original_url, result_url FROM photo_history WHERE id = ?').get(photoId);

    // 删除 COS 文件
    const cosDeleteResults = { success: [], failed: [] };
    if (photo && isCOSConfigured()) {
      const urlsToDelete = [photo.original_url, photo.result_url].filter(Boolean);

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
    dbRun(db, 'DELETE FROM photo_history WHERE id = ?', [photoId]);
    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      cosDeleted: cosDeleteResults.success.length,
      cosFailed: cosDeleteResults.failed.length
    });
  } catch (error) {
    console.error('删除照片错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 批量删除照片
router.post('/batch-delete', async (req, res) => {
  try {
    const db = getDb();
    const { photoIds } = req.body;

    if (!photoIds || !photoIds.length) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    // 查询所有照片的 COS URL
    const placeholders = photoIds.map(() => '?').join(',');
    const photos = db.prepare(`SELECT original_url, result_url FROM photo_history WHERE id IN (${placeholders})`).all(...photoIds);

    // 收集所有需要删除的 COS key
    const keysToDelete = [];
    for (const photo of photos) {
      if (photo.original_url) {
        const key = extractKeyFromUrl(photo.original_url);
        if (key) keysToDelete.push(key);
      }
      if (photo.result_url) {
        const key = extractKeyFromUrl(photo.result_url);
        if (key) keysToDelete.push(key);
      }
    }

    // 批量删除 COS 文件
    let cosDeleteResult = { deleted: [], errors: [] };
    if (keysToDelete.length > 0 && isCOSConfigured()) {
      try {
        cosDeleteResult = await deleteObjects(keysToDelete);
      } catch (err) {
        console.error('[COS] 批量删除失败:', err.message);
      }
    }

    // 删除数据库记录
    dbRun(db, `DELETE FROM photo_history WHERE id IN (${placeholders})`, photoIds);
    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: {
        deletedCount: photoIds.length,
        cosDeleted: cosDeleteResult.deleted.length,
        cosFailed: cosDeleteResult.errors.length
      }
    });
  } catch (error) {
    console.error('批量删除照片错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ========== 异步生图接口 ==========

// 辅助函数：根据 userId 或 openid 查找用户
function findUserByIdOrOpenid(db, userId) {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE openid = ?').get(userId);
  }
  return user;
}

// 异步生成图片 - 提交任务后立即返回
router.post('/generate', (req, res) => {
  try {
    const db = getDb();
    const {
      userId, prompt, imageBase64, mimeType,
      // 参考图模式参数
      referenceImageBase64, referenceMimeType, referenceWeight, faceSwapMode,
      // 元数据
      scene, spec, beauty, clothing, bgColor, originalUrl, pointsCost = 50
    } = req.body;

    if (!userId) {
      return res.status(400).json({ code: -1, msg: '缺少用户ID' });
    }
    if (!prompt) {
      return res.status(400).json({ code: -1, msg: '缺少提示词' });
    }
    if (!imageBase64 && !referenceImageBase64) {
      return res.status(400).json({ code: -1, msg: '缺少图片数据' });
    }

    // 1. 查找用户并检查积分
    const user = findUserByIdOrOpenid(db, userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }
    if (user.points < pointsCost) {
      return res.status(400).json({ code: -1, msg: '醒币不足', data: { balance: user.points, required: pointsCost } });
    }

    // 2. 扣积分
    const newBalance = user.points - pointsCost;
    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, user.id]);
    dbRun(db,
      'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), user.id, 'consume', -pointsCost, newBalance, 'AI生图消费', null]);

    // 3. 创建 photo_history 记录
    const photoId = uuidv4();
    const taskId = uuidv4();
    dbRun(db, `
      INSERT INTO photo_history (id, user_id, task_id, scene, spec, beauty, clothing, bg_color, original_url, status, points_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating', ?)
    `, [photoId, user.id, taskId, scene || null, spec || null, beauty || null, clothing || null, bgColor || null, originalUrl || null, pointsCost]);

    saveDatabase();

    // 4. 立即返回 taskId 给前端
    res.json({
      code: 0,
      msg: 'success',
      data: { photoId, taskId, balance: newBalance }
    });

    // 5. 后台异步调用 AI 服务
    setImmediate(async () => {
      try {
        console.log(`[异步生图] 开始任务 ${taskId}, photoId=${photoId}`);
        const startTime = Date.now();

        let aiResponse;
        if (referenceImageBase64) {
          // 参考图替换模式
          console.log(`[异步生图] 使用参考图模式, 权重=${referenceWeight}, 模式=${faceSwapMode}`);
          aiResponse = await axios.post(`${AI_SERVICE_URL}/api/ai/generate-with-reference`, {
            prompt,
            referenceImageBase64,
            userImageBase64: imageBase64,
            referenceMimeType: referenceMimeType || 'image/jpeg',
            userMimeType: mimeType || 'image/jpeg',
            referenceWeight: referenceWeight || 0.8,
            faceSwapMode: faceSwapMode || 'replace'
          }, {
            timeout: 180000,
            maxContentLength: 100 * 1024 * 1024,
            maxBodyLength: 100 * 1024 * 1024
          });
        } else {
          // 普通模式
          aiResponse = await axios.post(`${AI_SERVICE_URL}/api/ai/generate-image`, {
            prompt,
            imageBase64,
            mimeType: mimeType || 'image/jpeg'
          }, {
            timeout: 180000,
            maxContentLength: 100 * 1024 * 1024,
            maxBodyLength: 100 * 1024 * 1024
          });
        }

        const duration = Date.now() - startTime;
        console.log(`[异步生图] AI 生成完成, 耗时: ${duration}ms, taskId=${taskId}`);

        if (aiResponse.data && aiResponse.data.code === 200 && aiResponse.data.data && aiResponse.data.data.imageData) {
          const { imageData, mimeType: resMimeType } = aiResponse.data.data;

          // 将 base64 图片上传到 COS
          const imageBuffer = Buffer.from(imageData, 'base64');
          const ext = (resMimeType || 'image/jpeg').includes('png') ? 'png' : 'jpg';
          const cosKey = `users/${user.id}/output/${taskId}.${ext}`;

          const uploadResult = await uploadToUserBucket(imageBuffer, cosKey, resMimeType || 'image/jpeg');
          console.log(`[异步生图] 图片已上传到 COS: ${uploadResult.url}, taskId=${taskId}`);

          // 更新数据库记录
          const dbNow = getDb();
          dbRun(dbNow, `
            UPDATE photo_history
            SET status = 'completed', result_url = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [uploadResult.url, photoId]);
          saveDatabase();

          console.log(`[异步生图] 任务完成 taskId=${taskId}`);
        } else {
          throw new Error('AI 服务未返回有效图片数据');
        }
      } catch (err) {
        console.error(`[异步生图] 任务失败 taskId=${taskId}:`, err.message);

        // 更新状态为失败
        try {
          const dbNow = getDb();
          dbRun(dbNow, `
            UPDATE photo_history
            SET status = 'failed', error_msg = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [err.message || '生成失败', photoId]);

          // 退还积分
          const currentUser = dbNow.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
          if (currentUser) {
            const refundBalance = currentUser.points + pointsCost;
            dbRun(dbNow, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [refundBalance, user.id]);
            dbRun(dbNow,
              'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [uuidv4(), user.id, 'refund', pointsCost, refundBalance, 'AI生图失败退还', null]);
          }

          saveDatabase();
          console.log(`[异步生图] 已退还 ${pointsCost} 醒币给用户 ${user.id}`);
        } catch (dbErr) {
          console.error(`[异步生图] 更新失败状态或退还积分出错:`, dbErr.message);
        }
      }
    });

  } catch (error) {
    console.error('异步生图接口错误:', {
      message: error.message,
      stack: error.stack,
      type: error.constructor?.name,
      code: error.code,
      userId: req.body?.userId,
      hasImageData: !!req.body?.imageBase64,
      bodySize: req.headers?.['content-length'] || 'unknown'
    });
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 查询任务状态
router.get('/task/:taskId', (req, res) => {
  try {
    const db = getDb();
    const { taskId } = req.params;

    const photo = db.prepare('SELECT id, user_id, task_id, scene, status, result_url, error_msg, points_cost, created_at, updated_at FROM photo_history WHERE task_id = ?').get(taskId);

    if (!photo) {
      return res.status(404).json({ code: -1, msg: '任务不存在' });
    }

    res.json({
      code: 0,
      data: photo
    });
  } catch (error) {
    console.error('查询任务状态错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
