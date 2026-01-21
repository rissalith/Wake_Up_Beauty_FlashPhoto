const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 获取积分余额
router.get('/balance/:userId', (req, res) => {
  try {
    const { getDb, findUserByIdOrOpenid } = req.app.locals;
    const db = getDb();
    const { userId } = req.params;
    const user = findUserByIdOrOpenid(db, userId);

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
    const { getDb, saveDatabase, findUserByIdOrOpenid, dbRun } = req.app.locals;
    const db = getDb();
    const { userId, amount, description, orderId } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const user = findUserByIdOrOpenid(db, userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    if (user.points < amount) {
      return res.status(400).json({ code: -2, msg: '醒币不足', data: { balance: user.points } });
    }

    const newBalance = user.points - amount;
    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, user.id]);
    dbRun(db,
      'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), user.id, 'consume', -amount, newBalance, description || '消费', orderId || null]);

    saveDatabase();

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
    const { getDb, saveDatabase, findUserByIdOrOpenid, dbRun } = req.app.locals;
    const db = getDb();
    const { userId, amount, paymentId } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const user = findUserByIdOrOpenid(db, userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const newBalance = user.points + amount;
    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, user.id]);
    dbRun(db,
      'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), user.id, 'recharge', amount, newBalance, '充值', paymentId || null]);

    saveDatabase();

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
    const { getDb, saveDatabase, findUserByIdOrOpenid, dbRun } = req.app.locals;
    const db = getDb();
    const { userId, amount, description, orderId } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const user = findUserByIdOrOpenid(db, userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const newBalance = user.points + amount;
    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, user.id]);
    dbRun(db,
      'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), user.id, 'refund', amount, newBalance, description || '退还', orderId || null]);

    saveDatabase();

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
    const { getDb, findUserByIdOrOpenid } = req.app.locals;
    const db = getDb();
    const { userId } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    const user = findUserByIdOrOpenid(db, userId);
    const realUserId = user ? user.id : userId;

    const offset = (page - 1) * pageSize;
    const records = db.prepare(
      'SELECT * FROM points_records WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(realUserId, parseInt(pageSize), offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM points_records WHERE user_id = ?').get(realUserId).count;

    res.json({
      code: 0,
      data: {
        records,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    });
  } catch (error) {
    console.error('获取积分记录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
