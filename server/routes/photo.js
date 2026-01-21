const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 创建照片任务
router.post('/create', (req, res) => {
  try {
    const { getDb, saveDatabase, dbRun } = req.app.locals;
    const db = getDb();
    const { userId, taskId, scene, spec, beauty, clothing, bgColor, originalUrl, pointsCost } = req.body;

    if (!userId) {
      return res.status(400).json({ code: -1, msg: '缺少用户ID' });
    }

    const photoId = uuidv4();
    dbRun(db, `
      INSERT INTO photo_history (id, user_id, task_id, scene, spec, beauty, clothing, bg_color, original_url, status, points_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating', ?)
    `, [photoId, userId, taskId || null, scene || null, spec || null, beauty || null, clothing || null, bgColor || null, originalUrl || null, pointsCost || 500]);

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
    const { getDb, saveDatabase, dbRun } = req.app.locals;
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
    const { getDb } = req.app.locals;
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

    const photos = db.prepare(sql + ` LIMIT ? OFFSET ?`).all(...params, parseInt(pageSize), offset);

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
router.delete('/:photoId', (req, res) => {
  try {
    const { getDb, saveDatabase, dbRun } = req.app.locals;
    const db = getDb();
    const { photoId } = req.params;

    dbRun(db, 'DELETE FROM photo_history WHERE id = ?', [photoId]);
    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('删除照片错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 批量删除照片
router.post('/batch-delete', (req, res) => {
  try {
    const { getDb, saveDatabase, dbRun } = req.app.locals;
    const db = getDb();
    const { photoIds } = req.body;

    if (!photoIds || !photoIds.length) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const placeholders = photoIds.map(() => '?').join(',');
    dbRun(db, `DELETE FROM photo_history WHERE id IN (${placeholders})`, photoIds);
    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { deletedCount: photoIds.length }
    });
  } catch (error) {
    console.error('批量删除照片错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
