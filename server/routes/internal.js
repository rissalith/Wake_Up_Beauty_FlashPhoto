const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 内部服务认证中间件
function internalServiceAuth(req, res, next) {
  const authHeader = req.headers['x-internal-auth'];
  if (authHeader === 'flashphoto-internal-secret-2024') {
    return next();
  }
  return res.status(403).json({ code: 403, message: '禁止访问' });
}

// 创建订单（内部接口）
router.post('/orders/create', internalServiceAuth, (req, res) => {
  try {
    const { getDb, saveDatabase, dbRun } = req.app.locals;
    const { env } = req.query;
    const db = getDb(env);
    const { orderId, userId, amount, points, bonusPoints, paymentMethod } = req.body;

    if (!orderId || !userId || !amount || !points) {
      return res.status(400).json({ code: 400, message: '缺少必要参数' });
    }

    dbRun(db,
      `INSERT INTO orders (id, user_id, amount, points_amount, bonus_points, status, payment_method, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`,
      [orderId, userId, amount, points, bonusPoints || 0, paymentMethod || 'wxpay']);
    saveDatabase(env);

    console.log('[内部接口] 创建订单成功:', orderId);
    res.json({ code: 200, message: 'success', data: { orderId } });
  } catch (error) {
    console.error('[内部接口] 创建订单失败:', error);
    res.status(500).json({ code: 500, message: '创建订单失败' });
  }
});

// 完成支付（内部接口）
router.post('/orders/complete', internalServiceAuth, (req, res) => {
  try {
    const { getDb, saveDatabase, dbRun } = req.app.locals;
    const { env } = req.query;
    const db = getDb(env);
    const { orderId, userId, points, amount, bonusPoints } = req.body;

    if (!orderId || !userId || !points) {
      return res.status(400).json({ code: 400, message: '缺少必要参数' });
    }

    const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }

    if (order.status === 'paid') {
      return res.json({ code: 200, message: '订单已处理', data: { orderId } });
    }

    const totalPoints = points + (bonusPoints || 0);

    dbRun(db, "UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?", [orderId]);
    dbRun(db, "UPDATE users SET points = points + ?, updated_at = datetime('now') WHERE id = ?", [totalPoints, userId]);

    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
    const newBalance = user ? user.points : totalPoints;

    const description = `充值 ¥${amount}` + (bonusPoints > 0 ? ` (含赠送${bonusPoints})` : '');
    dbRun(db,
      `INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id, created_at)
       VALUES (?, ?, 'recharge', ?, ?, ?, ?, datetime('now'))`,
      [uuidv4(), userId, totalPoints, newBalance, description, orderId]);

    saveDatabase(env);

    console.log('[内部接口] 支付完成:', { orderId, userId, totalPoints, newBalance });
    res.json({ code: 200, message: 'success', data: { orderId, newBalance } });
  } catch (error) {
    console.error('[内部接口] 完成支付失败:', error);
    res.status(500).json({ code: 500, message: '完成支付失败' });
  }
});

// 查询订单（内部接口）
router.get('/orders/:orderId', internalServiceAuth, (req, res) => {
  try {
    const { getDb } = req.app.locals;
    const { env } = req.query;
    const db = getDb(env);
    const { orderId } = req.params;

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }

    res.json({ code: 200, data: order });
  } catch (error) {
    console.error('[内部接口] 查询订单失败:', error);
    res.status(500).json({ code: 500, message: '查询订单失败' });
  }
});

module.exports = router;
