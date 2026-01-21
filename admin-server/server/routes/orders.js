const express = require('express');
const router = express.Router();
const { getOne, getAll } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// 判断是否使用共享数据库（小程序数据库）
const isSharedDb = !!process.env.SHARED_DB_PATH;

// 获取订单表名
const getOrderTable = () => isSharedDb ? 'orders' : 'recharge_orders';
// 获取用户ID关联字段
const getUserJoinField = () => isSharedDb ? 'id' : 'user_id';

// 获取订单列表
router.get('/', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, status = '', keyword = '', startDate = '', endDate = '' } = req.query;
  const offset = (page - 1) * pageSize;
  const orderTable = getOrderTable();
  const userJoinField = getUserJoinField();

  let conditions = [];
  let params = [];

  if (status) {
    conditions.push('ro.status = ?');
    params.push(status);
  }

  if (keyword) {
    if (isSharedDb) {
      conditions.push('(ro.id LIKE ? OR ro.user_id LIKE ?)');
    } else {
      conditions.push('(ro.order_id LIKE ? OR ro.user_id LIKE ?)');
    }
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (startDate) {
    conditions.push('DATE(ro.created_at) >= ?');
    params.push(startDate);
  }

  if (endDate) {
    conditions.push('DATE(ro.created_at) <= ?');
    params.push(endDate);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = getOne(`SELECT COUNT(*) as total FROM ${orderTable} ro ${whereClause}`, params);
  const total = countResult?.total || 0;

  let orders;
  if (isSharedDb) {
    // 小程序数据库结构
    orders = getAll(`
      SELECT
        ro.id,
        ro.id as order_id,
        ro.user_id,
        ro.amount,
        ro.points_amount as points,
        ro.bonus_points,
        ro.status,
        ro.created_at,
        ro.updated_at as paid_at,
        u.nickname,
        u.avatar_url
      FROM ${orderTable} ro
      LEFT JOIN users u ON ro.user_id = u.${userJoinField}
      ${whereClause}
      ORDER BY ro.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);
  } else {
    orders = getAll(`
      SELECT
        ro.id,
        ro.order_id,
        ro.user_id,
        ro.amount,
        ro.points,
        ro.status,
        ro.created_at,
        ro.paid_at,
        u.nickname,
        u.avatar_url
      FROM ${orderTable} ro
      LEFT JOIN users u ON ro.user_id = u.${userJoinField}
      ${whereClause}
      ORDER BY ro.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);
  }

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

// 订单统计 - 必须在 /:id 之前定义
router.get('/stats/summary', authMiddleware, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const orderTable = getOrderTable();

  // 今日已支付订单统计
  const todayOrders = getOne(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
    FROM ${orderTable} WHERE DATE(created_at) = ? AND status = 'paid'
  `, [today]) || { count: 0, amount: 0 };

  // 全部订单数量（所有状态）
  const totalOrdersCount = getOne(`
    SELECT COUNT(*) as count FROM ${orderTable}
  `) || { count: 0 };

  // 已支付订单统计
  const paidOrders = getOne(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
    FROM ${orderTable} WHERE status = 'paid'
  `) || { count: 0, amount: 0 };

  const monthStart = today.substring(0, 7) + '-01';
  // 本月已支付订单统计
  const monthOrders = getOne(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
    FROM ${orderTable} WHERE DATE(created_at) >= ? AND status = 'paid'
  `, [monthStart]) || { count: 0, amount: 0 };

  res.json({
    code: 200,
    data: {
      todayOrders: todayOrders.count,
      todayAmount: todayOrders.amount,
      totalOrders: totalOrdersCount.count,
      totalAmount: paidOrders.amount,  // 总金额只统计已支付订单
      paidOrders: paidOrders.count,
      paidAmount: paidOrders.amount,
      monthOrders: monthOrders.count,
      monthAmount: monthOrders.amount
    }
  });
});

// 获取订单详情
router.get('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const orderTable = getOrderTable();
  const userJoinField = getUserJoinField();

  let order;
  if (isSharedDb) {
    order = getOne(`
      SELECT
        ro.id,
        ro.id as order_id,
        ro.user_id,
        ro.amount,
        ro.points_amount as points,
        ro.bonus_points,
        ro.status,
        ro.payment_id,
        ro.payment_method,
        ro.created_at,
        ro.updated_at as paid_at,
        u.nickname,
        u.avatar_url,
        u.phone
      FROM ${orderTable} ro
      LEFT JOIN users u ON ro.user_id = u.${userJoinField}
      WHERE ro.id = ?
    `, [id]);
  } else {
    order = getOne(`
      SELECT
        ro.*,
        u.nickname,
        u.avatar_url,
        u.phone
      FROM ${orderTable} ro
      LEFT JOIN users u ON ro.user_id = u.${userJoinField}
      WHERE ro.order_id = ? OR ro.id = ?
    `, [id, id]);
  }

  if (!order) {
    return res.status(404).json({ code: 404, message: '订单不存在' });
  }

  res.json({
    code: 200,
    data: order
  });
});

module.exports = router;
