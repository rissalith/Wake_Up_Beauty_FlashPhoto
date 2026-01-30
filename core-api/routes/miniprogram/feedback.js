/**
 * 小程序反馈路由
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb, dbRun, saveDatabase } = require('../../config/database');

// 提交反馈
router.post('/submit', (req, res) => {
  try {
    const db = getDb();
    const { userId, content, images, contact } = req.body;

    if (!userId || !content) {
      return res.status(400).json({ code: -1, msg: '缺少必要参数' });
    }

    const feedbackId = uuidv4();
    const imagesJson = images ? JSON.stringify(images) : null;

    dbRun(db, `
      INSERT INTO feedbacks (id, user_id, content, images, contact, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `, [feedbackId, userId, content, imagesJson, contact || null]);

    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { feedbackId }
    });
  } catch (error) {
    console.error('提交反馈错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取用户反馈列表
router.get('/user/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    const feedbacks = db.prepare(`
      SELECT * FROM feedbacks
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId);

    // 解析 images JSON
    const result = feedbacks.map(f => ({
      ...f,
      images: f.images ? JSON.parse(f.images) : []
    }));

    res.json({
      code: 0,
      data: result
    });
  } catch (error) {
    console.error('获取用户反馈错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新反馈
router.put('/:feedbackId', (req, res) => {
  try {
    const db = getDb();
    const { feedbackId } = req.params;
    const { content, images, contact } = req.body;

    const imagesJson = images ? JSON.stringify(images) : null;

    dbRun(db, `
      UPDATE feedbacks
      SET content = COALESCE(?, content),
          images = COALESCE(?, images),
          contact = COALESCE(?, contact)
      WHERE id = ?
    `, [content || null, imagesJson, contact || null, feedbackId]);

    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新反馈错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 删除反馈
router.delete('/:feedbackId', (req, res) => {
  try {
    const db = getDb();
    const { feedbackId } = req.params;

    dbRun(db, 'DELETE FROM feedbacks WHERE id = ?', [feedbackId]);
    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('删除反馈错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
