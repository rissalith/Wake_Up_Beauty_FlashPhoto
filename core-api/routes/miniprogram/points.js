/**
 * 小程序积分路由
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb, dbRun, saveDatabase, transaction } = require('../../config/database');
const { findUserByIdOrOpenid } = require('../../lib/helpers');

// 获取积分余额
router.get('/balance/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const user = findUserByIdOrOpenid(userId);

    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    res.json({
      code: 0,
      data: { balance: user.points }
    });
  } catch (error) {
    console.error('获取积分余额错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 消费积分
router.post('/consume', (req, res) => {
  try {
    const db = getDb();
    const { userId, amount, description, orderId } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const user = findUserByIdOrOpenid(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    if (user.points < amount) {
      return res.status(400).json({ code: -2, msg: '醒币不足', data: { balance: user.points } });
    }

    const newBalance = transaction(() => {
      // 原子扣减 + 防超扣
      const result = db.prepare('UPDATE users SET points = points - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND points >= ?').run(amount, user.id, amount);
      if (result.changes === 0) {
        throw new Error('积分不足或用户不存在');
      }
      const updated = db.prepare('SELECT points FROM users WHERE id = ?').get(user.id);
      db.prepare(
        'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uuidv4(), user.id, 'consume', -amount, updated.points, description || '消费', orderId || null);
      return updated.points;
    });

    res.json({
      code: 0,
      msg: 'success',
      data: { balance: newBalance }
    });
  } catch (error) {
    console.error('消费积分错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 充值积分
router.post('/recharge', (req, res) => {
  try {
    const db = getDb();
    const { userId, amount, paymentId } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const user = findUserByIdOrOpenid(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const newBalance = transaction(() => {
      db.prepare('UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(amount, user.id);
      const updated = db.prepare('SELECT points FROM users WHERE id = ?').get(user.id);
      db.prepare(
        'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uuidv4(), user.id, 'recharge', amount, updated.points, '充值', paymentId || null);
      return updated.points;
    });

    res.json({
      code: 0,
      msg: 'success',
      data: { balance: newBalance }
    });
  } catch (error) {
    console.error('充值积分错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 退还积分
router.post('/refund', (req, res) => {
  try {
    const db = getDb();
    const { userId, amount, description, orderId } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const user = findUserByIdOrOpenid(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const newBalance = transaction(() => {
      db.prepare('UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(amount, user.id);
      const updated = db.prepare('SELECT points FROM users WHERE id = ?').get(user.id);
      db.prepare(
        'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uuidv4(), user.id, 'refund', amount, updated.points, description || '退还', orderId || null);
      return updated.points;
    });

    res.json({
      code: 0,
      msg: 'success',
      data: { balance: newBalance }
    });
  } catch (error) {
    console.error('退还积分错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取积分记录
router.get('/records/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    const user = findUserByIdOrOpenid(userId);
    const realUserId = user ? user.id : userId;

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const records = db.prepare(
      'SELECT * FROM points_records WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(realUserId, parseInt(pageSize), offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM points_records WHERE user_id = ?').get(realUserId).count;

    res.json({
      code: 0,
      data: {
        list: records,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取积分记录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 发放醒币奖励（分享、邀请等）
router.post('/grant', (req, res) => {
  try {
    const db = getDb();
    const { userId, type, relatedId } = req.body;

    if (!userId || !type) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const user = findUserByIdOrOpenid(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    // 获取奖励配置
    const rewardConfig = db.prepare('SELECT * FROM point_rewards WHERE type = ?').get(type);
    if (!rewardConfig || !rewardConfig.is_active) {
      return res.json({ code: 0, data: { alreadyGranted: true, points: 0 } });
    }

    // 检查是否已经领取过（针对分享照片，每张照片只能领取一次）
    if (type === 'share_image' || type === 'share_photo') {
      if (relatedId) {
        const existing = db.prepare(
          "SELECT * FROM points_records WHERE user_id = ? AND type = ? AND order_id = ?"
        ).get(user.id, type, relatedId);

        if (existing) {
          return res.json({ code: 0, data: { alreadyGranted: true, points: 0 } });
        }
      }

      // 检查今日分享次数是否达到上限
      const today = new Date().toISOString().split('T')[0];
      const todayCount = db.prepare(
        "SELECT COUNT(*) as count FROM points_records WHERE user_id = ? AND type = ? AND DATE(created_at) = ?"
      ).get(user.id, type, today).count;

      if (rewardConfig.max_times > 0 && todayCount >= rewardConfig.max_times) {
        return res.json({ code: 0, data: { alreadyGranted: true, points: 0, reason: '今日分享奖励已达上限' } });
      }
    }

    // 发放奖励（事务 + 原子更新）
    const points = rewardConfig.points || 10;

    const newBalance = transaction(() => {
      db.prepare('UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(points, user.id);
      const updated = db.prepare('SELECT points FROM users WHERE id = ?').get(user.id);
      db.prepare(
        'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uuidv4(), user.id, type, points, updated.points, rewardConfig.description || '分享奖励', relatedId || null);
      return updated.points;
    });

    console.log(`[积分] 发放分享奖励: userId=${user.id}, type=${type}, points=${points}, newBalance=${newBalance}`);

    res.json({
      code: 0,
      data: {
        alreadyGranted: false,
        points: points,
        balance: newBalance
      }
    });
  } catch (error) {
    console.error('发放奖励错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
