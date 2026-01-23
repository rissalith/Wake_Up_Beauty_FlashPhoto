/**
 * 小程序虚拟支付路由
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb, dbRun, saveDatabase } = require('../../config/database');
const signService = require('../../services/signService');

// 创建虚拟支付订单
router.post('/create-order', async (req, res) => {
  try {
    const db = getDb();
    const { userId, openid, amount, points, sessionKey, platform = 'ios' } = req.body;

    if (!userId || !openid || !amount || !points) {
      return res.status(400).json({ code: 400, message: '参数不完整' });
    }

    // 获取用户的 sessionKey（如果前端没传，从数据库获取）
    let userSessionKey = sessionKey;
    if (!userSessionKey) {
      const user = db.prepare('SELECT session_key FROM users WHERE id = ?').get(userId);
      if (user && user.session_key) {
        userSessionKey = user.session_key;
      }
    }

    if (!userSessionKey) {
      return res.status(400).json({ code: 400, message: '缺少 sessionKey，请重新登录' });
    }

    const orderId = signService.generateOrderId();

    // 保存订单到数据库
    dbRun(db, `
      INSERT INTO virtual_pay_orders (id, order_id, user_id, openid, amount, points, status, attach)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [uuidv4(), orderId, userId, openid, amount * 100, points, JSON.stringify({ userId, points })]);

    saveDatabase();

    console.log('[虚拟支付] 创建订单:', orderId);

    // 生成签名参数
    const payParams = signService.generatePaymentParams({
      orderId,
      amount,
      points,
      userId,
      sessionKey: userSessionKey,
      platform
    });

    res.json({
      code: 200,
      data: {
        orderId,
        amount,
        points,
        status: 'pending',
        // 虚拟支付签名参数 - signData 必须是 JSON 字符串
        signData: JSON.stringify(payParams.signData),
        paySig: payParams.paySig,
        signature: payParams.signature,
        sigMethod: payParams.sigMethod,
        mode: payParams.mode
      }
    });
  } catch (error) {
    console.error('[虚拟支付] 创建订单失败:', error);
    res.status(500).json({ code: 500, message: '创建订单失败: ' + error.message });
  }
});

// 主动发货接口（小程序端支付成功后调用）
router.post('/deliver/:orderId', async (req, res) => {
  try {
    const db = getDb();
    const { orderId } = req.params;

    console.log('[虚拟支付] 主动发货请求:', orderId);

    const order = db.prepare('SELECT * FROM virtual_pay_orders WHERE order_id = ?').get(orderId);

    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }

    if (order.status === 'delivered') {
      return res.json({ code: 200, message: '订单已发货', data: { orderId, status: 'delivered' } });
    }

    // 解析 attach 获取用户信息
    let attach = {};
    try {
      attach = JSON.parse(order.attach || '{}');
    } catch (e) {
      attach = { userId: order.user_id, points: order.points };
    }

    const userId = attach.userId || order.user_id;
    const points = attach.points || order.points;

    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    const newBalance = (user.points || 0) + points;

    // 更新用户积分
    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, userId]);

    // 记录积分变动
    dbRun(db, `
      INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id)
      VALUES (?, ?, 'virtual_recharge', ?, ?, '虚拟支付充值', ?)
    `, [uuidv4(), userId, points, newBalance, orderId]);

    // 更新订单状态
    dbRun(db, `
      UPDATE virtual_pay_orders
      SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `, [orderId]);

    saveDatabase();

    console.log('[虚拟支付] 发货成功:', { orderId, points, newBalance });

    res.json({
      code: 200,
      message: '发货成功',
      data: {
        orderId,
        points,
        newBalance,
        status: 'delivered'
      }
    });
  } catch (error) {
    console.error('[虚拟支付] 发货失败:', error);
    res.status(500).json({ code: 500, message: '发货失败: ' + error.message });
  }
});

// 虚拟支付发货通知（微信服务器回调）
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
