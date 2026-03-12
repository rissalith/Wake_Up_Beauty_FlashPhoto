/**
 * 小程序虚拟支付路由
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb, dbRun, transaction } = require('../../config/database');
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

    // 事务 + 乐观锁：防止双重发货
    const newBalance = transaction(() => {
      // 乐观锁：只更新未发货的订单
      const result = db.prepare(`
        UPDATE virtual_pay_orders
        SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND status != 'delivered'
      `).run(orderId);

      if (result.changes === 0) {
        // 订单已被其他请求发货
        return null;
      }

      // 原子更新用户积分
      db.prepare('UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(points, userId);
      const updated = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);

      // 记录积分变动
      db.prepare(`
        INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id)
        VALUES (?, ?, 'virtual_recharge', ?, ?, '虚拟支付充值', ?)
      `).run(uuidv4(), userId, points, updated.points, orderId);

      return updated.points;
    });

    if (newBalance === null) {
      return res.json({ code: 200, message: '订单已发货', data: { orderId, status: 'delivered' } });
    }

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

    // 事务 + 乐观锁：防止双重发货
    transaction(() => {
      // 乐观锁：只更新未发货的订单
      const result = db.prepare(`
        UPDATE virtual_pay_orders
        SET status = 'delivered', wx_transaction_id = ?, delivered_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND status != 'delivered'
      `).run(transactionId, outTradeNo);

      if (result.changes === 0) {
        // 订单已被其他请求发货，跳过
        return;
      }

      // 原子更新用户积分
      db.prepare('UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(points, userId);
      const updated = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);

      db.prepare(`
        INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id)
        VALUES (?, ?, 'virtual_recharge', ?, ?, '虚拟支付充值', ?)
      `).run(uuidv4(), userId, points, updated.points, outTradeNo);

      console.log('[虚拟支付] 发货成功:', { orderId: outTradeNo, points, newBalance: updated.points });
    });

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

    // 只允许取消 pending 状态的订单，delivered/paid 状态不可取消
    if (order.status !== 'pending') {
      console.log(`[虚拟支付] 订单 ${orderId} 状态为 ${order.status}，不允许取消`);
      return res.json({ code: 200, message: '订单状态不允许取消', data: { status: order.status } });
    }

    // 使用乐观锁，只取消仍为 pending 的订单（防止并发情况下误取消）
    const result = db.prepare(
      "UPDATE virtual_pay_orders SET status = 'cancelled' WHERE order_id = ? AND status = 'pending'"
    ).run(orderId);

    if (result.changes === 0) {
      console.log(`[虚拟支付] 订单 ${orderId} 取消时状态已变更，跳过`);
      return res.json({ code: 200, message: '订单状态已变更' });
    }

    console.log(`[虚拟支付] 订单 ${orderId} 已取消`);
    res.json({ code: 200, message: '订单已取消' });
  } catch (error) {
    console.error('[虚拟支付] 取消订单失败:', error);
    res.status(500).json({ code: 500, message: '取消订单失败' });
  }
});

module.exports = router;
