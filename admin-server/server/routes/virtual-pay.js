/**
 * 虚拟支付路由 (admin-server)
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getOne, getAll, run, runBatch, commitBatch } = require('../config/database');
const virtualPayConfig = require('../config/virtualPay');
const signService = require('../services/signService');

// 判断是否使用共享数据库
const isSharedDb = !!process.env.SHARED_DB_PATH;
const getUserIdField = () => isSharedDb ? 'id' : 'user_id';

// 尝试加载 session_key 管理器（如果 Redis 可用）
let sessionKeyManager = null;
try {
  sessionKeyManager = require('../../../shared/utils/sessionKeyManager');
} catch (e) {
  console.log('[虚拟支付] sessionKeyManager 未加载，将使用数据库存储 session_key');
}

// 创建虚拟支付订单
router.post('/create-order', async (req, res) => {
  try {
    const { userId, openid, amount, points, sessionKey: clientSessionKey, platform = 'ios' } = req.body;

    if (!userId || !openid || !amount || !points) {
      return res.status(400).json({ code: 400, message: '参数不完整' });
    }

    // 获取 session_key 的优先级：
    // 1. 前端传来的 sessionKey（不推荐，但兼容旧版本）
    // 2. Redis 存储的 sessionKey（推荐）
    // 3. 数据库存储的 sessionKey（回退方案）
    let sessionKey = clientSessionKey;

    if (!sessionKey && sessionKeyManager) {
      // 尝试从 Redis 获取
      sessionKey = await sessionKeyManager.getSessionKey(userId);
    }

    if (!sessionKey) {
      // 回退到数据库获取
      let user;
      if (isSharedDb) {
        user = getOne('SELECT session_key FROM users WHERE id = ?', [userId]);
      } else {
        user = getOne('SELECT session_key FROM users WHERE user_id = ?', [userId]);
      }

      if (!user || !user.session_key) {
        return res.status(400).json({ code: 400, message: '用户会话无效，请重新登录' });
      }
      sessionKey = user.session_key;
    }

    // 生成订单号
    const orderId = signService.generateOrderId();

    // 生成支付参数
    const paymentParams = signService.generatePaymentParams({
      orderId,
      amount,
      points,
      userId,
      sessionKey: sessionKey,
      platform
    });

    // 创建订单记录
    run(`
      INSERT INTO virtual_pay_orders (id, order_id, user_id, openid, amount, points, status, attach)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [uuidv4(), orderId, userId, openid, amount * 100, points, JSON.stringify({ userId, points })]);

    console.log('[虚拟支付] 创建订单:', orderId, '金额:', amount, '元, 醒币:', points);

    res.json({
      code: 200,
      data: {
        orderId,
        ...paymentParams.signData,
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
    let notifyData = req.body;
    if (typeof notifyData === 'string') {
      notifyData = JSON.parse(notifyData);
    }

    const outTradeNo = notifyData.OutTradeNo || notifyData.out_trade_no;
    const transactionId = notifyData.WeChatPayInfo?.TransactionId || notifyData.transaction_id || '';
    const attachStr = notifyData.GoodsInfo?.Attach || notifyData.attach || '{}';

    if (!outTradeNo) {
      console.error('[虚拟支付] 订单号为空');
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    // 查询订单
    const order = getOne('SELECT * FROM virtual_pay_orders WHERE order_id = ?', [outTradeNo]);

    if (!order) {
      console.error('[虚拟支付] 订单不存在:', outTradeNo);
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    if (order.status === 'delivered') {
      console.log('[虚拟支付] 订单已发货，跳过:', outTradeNo);
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    // 解析透传参数
    let attach = {};
    try {
      attach = JSON.parse(attachStr);
    } catch (e) {
      attach = { userId: order.user_id, points: order.points };
    }

    const userId = attach.userId || order.user_id;
    const points = attach.points || order.points;

    // 获取用户当前余额
    let user;
    if (isSharedDb) {
      user = getOne('SELECT points FROM users WHERE id = ?', [userId]);
    } else {
      user = getOne('SELECT points FROM users WHERE user_id = ?', [userId]);
    }

    if (!user) {
      console.error('[虚拟支付] 用户不存在:', userId);
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    const currentPoints = user.points || 0;
    const newBalance = currentPoints + points;

    // 使用批量操作确保原子性
    try {
      // 1. 更新用户醒币
      if (isSharedDb) {
        runBatch('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, userId]);
      } else {
        runBatch('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [newBalance, userId]);
      }

      // 2. 记录醒币变动
      const recordTable = isSharedDb ? 'points_records' : 'point_records';
      const balanceField = isSharedDb ? 'balance_after' : 'balance';
      runBatch(`
        INSERT INTO ${recordTable} (id, user_id, type, amount, ${balanceField}, description, order_id, created_at)
        VALUES (?, ?, 'virtual_recharge', ?, ?, '虚拟支付充值', ?, CURRENT_TIMESTAMP)
      `, [uuidv4(), userId, points, newBalance, outTradeNo]);

      // 3. 更新订单状态
      runBatch(`
        UPDATE virtual_pay_orders
        SET status = 'delivered', wx_transaction_id = ?, delivered_at = CURRENT_TIMESTAMP
        WHERE order_id = ?
      `, [transactionId, outTradeNo]);

      // 统一提交
      commitBatch();
      console.log('[虚拟支付] 发货成功:', { orderId: outTradeNo, points, newBalance });
    } catch (batchError) {
      console.error('[虚拟支付] 批量操作失败:', batchError);
      throw batchError;
    }

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

// 查询订单状态
router.get('/order/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;

    const order = getOne(`
      SELECT order_id, user_id, amount, points, status, wx_transaction_id, created_at, delivered_at
      FROM virtual_pay_orders WHERE order_id = ?
    `, [orderId]);

    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }

    res.json({ code: 200, data: order });
  } catch (error) {
    console.error('[虚拟支付] 查询订单失败:', error);
    res.status(500).json({ code: 500, message: '查询订单失败' });
  }
});

// 手动发货接口（支付成功后主动调用）
const authMiddleware = require('../middleware/auth');
router.post('/deliver/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;

    // 查询订单
    const order = getOne('SELECT * FROM virtual_pay_orders WHERE order_id = ?', [orderId]);

    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }

    if (order.status === 'delivered') {
      return res.json({ code: 200, message: '订单已发货', data: order });
    }

    const userId = order.user_id;
    const points = order.points;

    // 获取用户当前余额
    let user;
    if (isSharedDb) {
      user = getOne('SELECT points FROM users WHERE id = ?', [userId]);
    } else {
      user = getOne('SELECT points FROM users WHERE user_id = ?', [userId]);
    }

    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    const currentPoints = user.points || 0;
    const newBalance = currentPoints + points;

    // 使用批量操作确保原子性
    try {
      // 1. 更新用户醒币
      if (isSharedDb) {
        runBatch('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, userId]);
      } else {
        runBatch('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [newBalance, userId]);
      }

      // 2. 记录醒币变动
      const recordTable = isSharedDb ? 'points_records' : 'point_records';
      const balanceField = isSharedDb ? 'balance_after' : 'balance';
      runBatch(`
        INSERT INTO ${recordTable} (id, user_id, type, amount, ${balanceField}, description, order_id, created_at)
        VALUES (?, ?, 'virtual_recharge', ?, ?, '虚拟支付充值', ?, CURRENT_TIMESTAMP)
      `, [uuidv4(), userId, points, newBalance, orderId]);

      // 3. 更新订单状态
      runBatch(`
        UPDATE virtual_pay_orders
        SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
        WHERE order_id = ?
      `, [orderId]);

      // 统一提交
      commitBatch();
      console.log('[虚拟支付] 手动发货成功:', { orderId, points, newBalance });
    } catch (batchError) {
      console.error('[虚拟支付] 手动发货批量操作失败:', batchError);
      throw batchError;
    }

    res.json({
      code: 200,
      message: '发货成功',
      data: { orderId, points, newBalance, status: 'delivered' }
    });
  } catch (error) {
    console.error('[虚拟支付] 手动发货失败:', error);
    res.status(500).json({ code: 500, message: '发货失败', error: error.message });
  }
});

// 取消订单（支付失败或用户取消时调用）
router.post('/cancel/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    // 查询订单
    const order = getOne('SELECT * FROM virtual_pay_orders WHERE order_id = ?', [orderId]);

    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }

    // 只能取消待支付的订单
    if (order.status !== 'pending') {
      return res.json({ code: 200, message: '订单状态已变更', data: order });
    }

    // 更新订单状态为已取消
    run(`
      UPDATE virtual_pay_orders
      SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancel_reason = ?
      WHERE order_id = ?
    `, [reason || '用户取消', orderId]);

    console.log('[虚拟支付] 订单已取消:', orderId, reason || '用户取消');

    res.json({
      code: 200,
      message: '订单已取消',
      data: { orderId, status: 'cancelled' }
    });
  } catch (error) {
    console.error('[虚拟支付] 取消订单失败:', error);
    res.status(500).json({ code: 500, message: '取消订单失败', error: error.message });
  }
});

module.exports = router;
