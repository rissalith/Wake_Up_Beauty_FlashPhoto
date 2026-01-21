const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getOne, getAll, run } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// 生成订单ID
function generateOrderId() {
  return 'RO' + Date.now().toString() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

// 获取充值订单列表（管理后台）
router.get('/', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, userId = '', status = '' } = req.query;
  const offset = (page - 1) * pageSize;

  let conditions = [];
  let params = [];

  if (userId) {
    conditions.push('user_id = ?');
    params.push(userId);
  }

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = getOne(`SELECT COUNT(*) as total FROM recharge_orders ${whereClause}`, params);
  const total = countResult?.total || 0;

  const orders = getAll(`
    SELECT ro.*, u.nickname, u.avatar_url
    FROM recharge_orders ro
    LEFT JOIN users u ON ro.user_id = u.user_id
    ${whereClause}
    ORDER BY ro.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, parseInt(pageSize), offset]);

  res.json({
    code: 200,
    data: {
      list: orders,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }
  });
});

// 创建充值订单（小程序调用）
router.post('/create', (req, res) => {
  const { userId, packageId, customAmount } = req.body;

  if (!userId) {
    return res.status(400).json({ code: 400, message: '用户ID不能为空' });
  }

  let amount, points, bonusPoints = 0;

  if (packageId) {
    // 使用套餐充值
    const pkg = getOne('SELECT * FROM recharge_packages WHERE id = ? AND is_active = 1', [packageId]);
    if (!pkg) {
      return res.status(400).json({ code: 400, message: '套餐不存在或已下架' });
    }
    amount = pkg.amount;
    points = pkg.points;
    bonusPoints = pkg.bonus_points || 0;
  } else if (customAmount) {
    // 自定义金额充值
    const numAmount = parseInt(customAmount);
    if (isNaN(numAmount) || numAmount < 1 || numAmount > 10000) {
      return res.status(400).json({ code: 400, message: '自定义金额必须是1-10000之间的整数' });
    }
    amount = numAmount;
    points = numAmount * 10; // 1元 = 10醒币
  } else {
    return res.status(400).json({ code: 400, message: '请选择充值套餐或输入自定义金额' });
  }

  const orderId = generateOrderId();
  const totalPoints = points + bonusPoints;

  run(`
    INSERT INTO recharge_orders (order_id, user_id, amount, points, status)
    VALUES (?, ?, ?, ?, 'pending')
  `, [orderId, userId, amount, totalPoints]);

  // 返回订单信息，用于发起微信支付
  res.json({
    code: 200,
    data: {
      orderId,
      amount,
      points: totalPoints,
      bonusPoints,
      // 以下字段用于实际接入微信支付时使用
      // 目前返回模拟数据，实际使用时需要调用微信支付API
      payParams: {
        timeStamp: Date.now().toString(),
        nonceStr: crypto.randomBytes(16).toString('hex'),
        package: `prepay_id=mock_${orderId}`,
        signType: 'MD5',
        paySign: 'mock_sign'
      }
    }
  });
});

// 模拟支付成功（开发测试用）
router.post('/mock-pay', (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ code: 400, message: '订单ID不能为空' });
  }

  const order = getOne('SELECT * FROM recharge_orders WHERE order_id = ?', [orderId]);
  if (!order) {
    return res.status(404).json({ code: 404, message: '订单不存在' });
  }

  if (order.status === 'paid') {
    return res.json({ code: 200, message: '订单已支付' });
  }

  // 更新订单状态
  run(`
    UPDATE recharge_orders
    SET status = 'paid', payment_id = ?, paid_at = CURRENT_TIMESTAMP
    WHERE order_id = ?
  `, ['mock_payment_' + Date.now(), orderId]);

  // 给用户增加醒币
  const { addPoints } = require('./points');
  const result = addPoints(order.user_id, order.points, 'recharge', `充值${order.amount}元`, orderId);

  res.json({
    code: 200,
    message: '支付成功',
    data: {
      points: order.points,
      balance: result.balance
    }
  });
});

// 微信支付回调（实际接入时使用）
router.post('/wx-notify', (req, res) => {
  // TODO: 验证微信签名
  // TODO: 解析回调数据
  // TODO: 更新订单状态并发放醒币

  const { out_trade_no, transaction_id, result_code } = req.body;

  if (result_code !== 'SUCCESS') {
    return res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');
  }

  const order = getOne('SELECT * FROM recharge_orders WHERE order_id = ?', [out_trade_no]);
  if (!order || order.status === 'paid') {
    return res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');
  }

  // 更新订单状态
  run(`
    UPDATE recharge_orders
    SET status = 'paid', payment_id = ?, paid_at = CURRENT_TIMESTAMP
    WHERE order_id = ?
  `, [transaction_id, out_trade_no]);

  // 给用户增加醒币
  const { addPoints } = require('./points');
  addPoints(order.user_id, order.points, 'recharge', `充值${order.amount}元`, out_trade_no);

  res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');
});

// 查询充值订单状态（小程序调用）
router.get('/status/:orderId', (req, res) => {
  const { orderId } = req.params;

  const order = getOne('SELECT * FROM recharge_orders WHERE order_id = ?', [orderId]);
  if (!order) {
    return res.status(404).json({ code: 404, message: '订单不存在' });
  }

  res.json({
    code: 200,
    data: {
      orderId: order.order_id,
      status: order.status,
      amount: order.amount,
      points: order.points,
      paidAt: order.paid_at
    }
  });
});

// 获取用户充值记录（小程序调用）
router.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;

  const countResult = getOne('SELECT COUNT(*) as total FROM recharge_orders WHERE user_id = ?', [userId]);
  const total = countResult?.total || 0;

  const orders = getAll(`
    SELECT * FROM recharge_orders
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [userId, parseInt(pageSize), offset]);

  res.json({
    code: 200,
    data: {
      list: orders,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }
  });
});

// 充值统计
router.get('/stats', authMiddleware, (req, res) => {
  // 今日充值
  const today = new Date().toISOString().split('T')[0];
  const todayStats = getOne(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount, COALESCE(SUM(points), 0) as points
    FROM recharge_orders WHERE status = 'paid' AND DATE(paid_at) = ?
  `, [today]) || { count: 0, amount: 0, points: 0 };

  // 本月充值
  const thisMonth = today.substring(0, 7);
  const monthStats = getOne(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount, COALESCE(SUM(points), 0) as points
    FROM recharge_orders WHERE status = 'paid' AND strftime('%Y-%m', paid_at) = ?
  `, [thisMonth]) || { count: 0, amount: 0, points: 0 };

  // 总计
  const totalStats = getOne(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount, COALESCE(SUM(points), 0) as points
    FROM recharge_orders WHERE status = 'paid'
  `) || { count: 0, amount: 0, points: 0 };

  res.json({
    code: 200,
    data: {
      today: todayStats,
      thisMonth: monthStats,
      total: totalStats
    }
  });
});

module.exports = router;
