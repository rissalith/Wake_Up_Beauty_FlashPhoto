/**
 * 小程序虚拟支付路由
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb, dbRun, saveDatabase } = require('../../config/database');

// 创建虚拟支付订单
router.post('/create-order', async (req, res) => {
  try {
    const db = getDb();
    const { userId, openid, amount, points } = req.body;

    if (!userId || !openid || !amount || !points) {
      return res.status(400).json({ code: 400, message: '参数不完整' });
    }

    const orderId = 'VP' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();

    dbRun(db, `
      INSERT INTO virtual_pay_orders (id, order_id, user_id, openid, amount, points, status, attach)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [uuidv4(), orderId, userId, openid, amount * 100, points, JSON.stringify({ userId, points })]);
    
    saveDatabase();

    console.log('[虚拟支付] 创建订单:', orderId);

    res.json({
      code: 200,
      data: { orderId, amount, points, status: 'pending' }
    });
  } catch (error) {
    console.error('[虚拟支付] 创建订单失败:', error);
    res.status(500).json({ code: 500, message: '创建订单失败' });
  }
});

// 虚拟支付发货通知
router.post('/notify/deliver', async (req, res) => {
  console.log('[虚拟支付] 收到发货通知:', JSON.stringify(req.body));

  try {
    const db = getDb();

    const outTradeNo = req.body.OutTradeNo || req.body.out_trade_no;
    const transactionId = req.body.WeChatPayInfo?.TransactionId || req.body.transaction_id || '';
    const attachStr = req.body.GoodsInfo?.Attach || req.body.attach || '{}';

    if (!outTradeNo) {
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    const order = db.prepare('SELECT * FROM virtual_pay_orders WHERE order_id = ?').get(outTradeNo);

    if (!order) {
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    if (order.status === 'delivered') {
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    let attach = {};
    try {
      attach = JSON.parse(attachStr);
    } catch (e) {
      attach = { userId: order.user_id, points: order.points };
    }

    const userId = attach.userId || order.user_id;
    const points = attach.points || order.points;

    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    const newBalance = (user.points || 0) + points;

    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, userId]);

    dbRun(db, `
      INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id)
      VALUES (?, ?, 'virtual_recharge', ?, ?, '虚拟支付充值', ?)
    `, [uuidv4(), userId, points, newBalance, outTradeNo]);

    dbRun(db, `
      UPDATE virtual_pay_orders
      SET status = 'delivered', wx_transaction_id = ?, delivered_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `, [transactionId, outTradeNo]);

    saveDatabase();

    console.log('[虚拟支付] 发货成功:', { orderId: outTradeNo, points, newBalance });

    res.json({ ErrCode: 0, ErrMsg: 'success' });
  } catch (error) {
    console.error('[虚拟支付] 发货处理失败:', error);
    res.json({ ErrCode: -1, ErrMsg: error.message });
  }
});

// 查询虚拟支付订单状态
router.get('/order/:orderId', (req, res) => {
  try {
    const db = getDb();
    const { orderId } = req.params;

    const order = db.prepare(`
      SELECT order_id, user_id, amount, points, status, wx_transaction_id, created_at, delivered_at
      FROM virtual_pay_orders WHERE order_id = ?
    `).get(orderId);

    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }

    res.json({ code: 200, data: order });
  } catch (error) {
    console.error('[虚拟支付] 查询订单失败:', error);
    res.status(500).json({ code: 500, message: '查询订单失败' });
  }
});

// 取消虚拟支付订单
router.post('/cancel/:orderId', async (req, res) => {
  try {
    const db = getDb();
    const { orderId } = req.params;

    const order = db.prepare('SELECT * FROM virtual_pay_orders WHERE order_id = ?').get(orderId);

    if (!order) {
      return res.json({ code: 200, message: '订单不存在或已处理' });
    }

    if (order.status !== 'pending') {
      return res.json({ code: 200, message: '订单状态不允许取消' });
    }

    dbRun(db, "UPDATE virtual_pay_orders SET status = 'cancelled' WHERE order_id = ?", [orderId]);
    saveDatabase();

    res.json({ code: 200, message: '订单已取消' });
  } catch (error) {
    console.error('[虚拟支付] 取消订单失败:', error);
    res.status(500).json({ code: 500, message: '取消订单失败' });
  }
});

module.exports = router;
