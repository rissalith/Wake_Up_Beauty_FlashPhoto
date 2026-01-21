const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 创建虚拟支付订单
router.post('/create-order', async (req, res) => {
  try {
    const { userId, openid, amount, points, platform = 'ios' } = req.body;
    const env = req.query.env || req.app.locals.currentEnv;
    const db = req.app.locals.getDb(env);
    const { signService, dbRun, saveDatabase } = req.app.locals;

    if (!userId || !openid || !amount || !points) {
      return res.status(400).json({ code: 400, message: '参数不完整' });
    }

    const user = db.prepare('SELECT session_key FROM users WHERE id = ?').get(userId);
    if (!user || !user.session_key) {
      return res.status(400).json({ code: 400, message: '用户会话无效，请重新登录' });
    }

    const orderId = signService.generateOrderId();
    const paymentParams = signService.generatePaymentParams({
      orderId, amount, points, userId,
      sessionKey: user.session_key, platform
    });

    dbRun(db, `
      INSERT INTO virtual_pay_orders (id, order_id, user_id, openid, amount, points, status, attach)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [uuidv4(), orderId, userId, openid, amount * 100, points, JSON.stringify({ userId, points })]);
    saveDatabase(env);

    console.log('[虚拟支付] 创建订单:', orderId, '金额:', amount, '元, 醒币:', points);

    res.json({
      code: 200,
      data: {
        orderId,
        signData: JSON.stringify(paymentParams.signData),
        paySig: paymentParams.paySig,
        signature: paymentParams.signature,
        sigMethod: paymentParams.sigMethod,
        mode: paymentParams.mode
      }
    });
  } catch (error) {
    console.error('[虚拟支付] 创建订单失败:', error);
    res.status(500).json({ code: 500, message: '创建订单失败', error: error.message });
  }
});

// 发货推送处理
router.post('/notify/deliver', async (req, res) => {
  console.log('[虚拟支付] 收到发货推送:', JSON.stringify(req.body));

  try {
    const env = req.query.env || req.app.locals.currentEnv;
    const db = req.app.locals.getDb(env);
    const { dbRun, saveDatabase } = req.app.locals;

    let notifyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const outTradeNo = notifyData.OutTradeNo || notifyData.out_trade_no;
    const transactionId = notifyData.WeChatPayInfo?.TransactionId || notifyData.transaction_id || '';
    const attachStr = notifyData.GoodsInfo?.Attach || notifyData.attach || '{}';

    if (!outTradeNo) {
      console.error('[虚拟支付] 订单号为空');
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    const order = db.prepare('SELECT * FROM virtual_pay_orders WHERE order_id = ?').get(outTradeNo);
    if (!order) {
      console.error('[虚拟支付] 订单不存在:', outTradeNo);
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    if (order.status === 'delivered') {
      console.log('[虚拟支付] 订单已发货，跳过:', outTradeNo);
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
      console.error('[虚拟支付] 用户不存在:', userId);
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    const currentPoints = user.points || 0;
    const newBalance = currentPoints + points;

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

    saveDatabase(env);
    console.log('[虚拟支付] 发货成功:', { orderId: outTradeNo, points, newBalance });

    res.json({ ErrCode: 0, ErrMsg: 'success' });
  } catch (error) {
    console.error('[虚拟支付] 发货处理失败:', error);
    res.json({ ErrCode: -1, ErrMsg: error.message });
  }
});

// 代币支付推送
router.post('/notify/coin-pay', async (req, res) => {
  console.log('[虚拟支付] 收到代币支付推送:', JSON.stringify(req.body));
  res.json({ ErrCode: 0, ErrMsg: 'success' });
});

// 查询虚拟支付订单状态
router.get('/order/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const env = req.query.env || req.app.locals.currentEnv;
    const db = req.app.locals.getDb(env);

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
    const { orderId } = req.params;
    const { reason } = req.body;
    const env = req.query.env || req.app.locals.currentEnv;
    const db = req.app.locals.getDb(env);
    const { dbRun, saveDatabase } = req.app.locals;

    if (!orderId) {
      return res.status(400).json({ code: 400, message: '缺少订单号' });
    }

    const order = db.prepare('SELECT * FROM virtual_pay_orders WHERE order_id = ?').get(orderId);
    if (!order) {
      return res.json({ code: 200, message: '订单不存在或已处理' });
    }

    if (order.status !== 'pending') {
      return res.json({ code: 200, message: '订单状态不允许取消' });
    }

    dbRun(db, 'UPDATE virtual_pay_orders SET status = ? WHERE order_id = ?', ['cancelled', orderId]);
    saveDatabase(env);

    console.log('[虚拟支付] 订单已取消:', orderId, '原因:', reason || '未知');
    res.json({ code: 200, message: '订单已取消' });
  } catch (error) {
    console.error('[虚拟支付] 取消订单失败:', error);
    res.status(500).json({ code: 500, message: '取消订单失败' });
  }
});

// 查询用户代币余额
router.get('/coin-balance', async (req, res) => {
  try {
    const { openid, env: envParam } = req.query;
    const env = envParam || req.app.locals.currentEnv;

    if (!openid) {
      return res.status(400).json({ code: 400, message: '缺少openid' });
    }

    res.json({
      code: 200,
      data: {
        balance: 0,
        present_balance: 0,
        message: '请在真机测试时调用微信API'
      }
    });
  } catch (error) {
    console.error('[虚拟支付] 查询余额失败:', error);
    res.status(500).json({ code: 500, message: error.message });
  }
});

module.exports = router;
