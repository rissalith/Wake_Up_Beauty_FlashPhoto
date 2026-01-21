const express = require('express');
const router = express.Router();
const { getOne, getAll } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { getAllUserPhotos, isCOSConfigured } = require('../config/cos');

// 判断是否使用共享数据库（小程序数据库）
const isSharedDb = !!process.env.SHARED_DB_PATH;

// 获取表名
const getPhotoTable = () => isSharedDb ? 'photo_history' : 'photos';
const getPointsRecordTable = () => isSharedDb ? 'points_records' : 'point_records';

// 数据总览
router.get('/overview', authMiddleware, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.substring(0, 7) + '-01';
  const photoTable = getPhotoTable();
  const pointsTable = getPointsRecordTable();

  // 用户统计
  const totalUsers = getOne('SELECT COUNT(*) as count FROM users') || { count: 0 };
  const todayUsers = getOne('SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = ?', [today]) || { count: 0 };
  const monthUsers = getOne('SELECT COUNT(*) as count FROM users WHERE DATE(created_at) >= ?', [monthStart]) || { count: 0 };

  // 订单统计 - 只统计已支付订单的金额
  const totalOrders = getOne('SELECT COUNT(*) as count FROM orders') || { count: 0 };
  const paidOrdersAmount = getOne('SELECT COALESCE(SUM(amount), 0) as amount FROM orders WHERE status = \'paid\'') || { amount: 0 };
  const todayOrders = getOne('SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount FROM orders WHERE DATE(created_at) = ? AND status = \'paid\'', [today]) || { count: 0, amount: 0 };
  const monthOrders = getOne('SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount FROM orders WHERE DATE(created_at) >= ? AND status = \'paid\'', [monthStart]) || { count: 0, amount: 0 };

  // 照片统计 - 优先从COS获取，否则从数据库获取
  let totalPhotosCount = 0;
  let todayPhotosCount = 0;

  if (isCOSConfigured()) {
    try {
      const cosPhotos = await getAllUserPhotos();
      // 只统计output类型的照片（生成的证件照）
      const outputPhotos = cosPhotos.filter(p => p.type === 'output');
      totalPhotosCount = outputPhotos.length;

      // 统计今日生成的照片
      const todayStart = new Date(today + 'T00:00:00.000Z');
      const todayEnd = new Date(today + 'T23:59:59.999Z');
      todayPhotosCount = outputPhotos.filter(p => {
        const photoDate = new Date(p.lastModified);
        return photoDate >= todayStart && photoDate <= todayEnd;
      }).length;
    } catch (e) {
      console.error('[Stats] COS照片统计失败:', e.message);
      // 降级到数据库统计
      const dbPhotos = getOne(`SELECT COUNT(*) as count FROM ${photoTable}`) || { count: 0 };
      const dbTodayPhotos = getOne(`SELECT COUNT(*) as count FROM ${photoTable} WHERE DATE(created_at) = ?`, [today]) || { count: 0 };
      totalPhotosCount = dbPhotos.count;
      todayPhotosCount = dbTodayPhotos.count;
    }
  } else {
    const dbPhotos = getOne(`SELECT COUNT(*) as count FROM ${photoTable}`) || { count: 0 };
    const dbTodayPhotos = getOne(`SELECT COUNT(*) as count FROM ${photoTable} WHERE DATE(created_at) = ?`, [today]) || { count: 0 };
    totalPhotosCount = dbPhotos.count;
    todayPhotosCount = dbTodayPhotos.count;
  }

  // 醒币获取来源统计（排除管理员调整，避免占比过大）
  const pointsSources = getAll(`
    SELECT type, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
    FROM ${pointsTable}
    WHERE amount > 0
      AND type NOT IN ('admin_add', 'admin_adjust')
    GROUP BY type
    ORDER BY total DESC
  `) || [];

  // 邀请统计
  const totalInvites = getOne("SELECT COUNT(*) as count FROM users WHERE inviter_id IS NOT NULL AND inviter_id != ''") || { count: 0 };
  const todayInvites = getOne("SELECT COUNT(*) as count FROM users WHERE inviter_id IS NOT NULL AND inviter_id != '' AND DATE(created_at) = ?", [today]) || { count: 0 };

  // 积分统计
  const totalPoints = getOne('SELECT COALESCE(SUM(points), 0) as total FROM users') || { total: 0 };
  const todayRecharge = getOne(`SELECT COALESCE(SUM(amount), 0) as total FROM ${pointsTable} WHERE type = 'recharge' AND DATE(created_at) = ?`, [today]) || { total: 0 };

  res.json({
    code: 200,
    data: {
      users: {
        total: totalUsers.count,
        today: todayUsers.count,
        month: monthUsers.count
      },
      orders: {
        total: totalOrders.count,
        totalAmount: paidOrdersAmount.amount,  // 只统计已支付订单金额
        today: todayOrders.count,
        todayAmount: todayOrders.amount,
        month: monthOrders.count,
        monthAmount: monthOrders.amount
      },
      photos: {
        total: totalPhotosCount,
        today: todayPhotosCount
      },
      pointsSources: pointsSources,
      invites: {
        total: totalInvites.count,
        today: todayInvites.count
      },
      points: {
        total: totalPoints.total,
        todayRecharge: todayRecharge.total
      }
    }
  });
});

// 每日统计（最近30天）
router.get('/daily', authMiddleware, (req, res) => {
  const { days = 30 } = req.query;
  const photoTable = getPhotoTable();

  const dailyStats = getAll(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as orders,
      COALESCE(SUM(amount), 0) as amount
    FROM orders
    WHERE created_at >= DATE('now', '-${parseInt(days)} days')
      AND status = 'paid'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);

  const dailyUsers = getAll(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as users
    FROM users
    WHERE created_at >= DATE('now', '-${parseInt(days)} days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);

  const dailyPhotos = getAll(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as photos
    FROM ${photoTable}
    WHERE created_at >= DATE('now', '-${parseInt(days)} days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);

  res.json({
    code: 200,
    data: {
      orders: dailyStats,
      users: dailyUsers,
      photos: dailyPhotos
    }
  });
});

// 收入统计
router.get('/revenue', authMiddleware, (req, res) => {
  const { period = 'month' } = req.query;

  let groupBy, dateFormat, limit;
  if (period === 'day') {
    groupBy = "DATE(created_at)";
    dateFormat = 'date';
    limit = 7;
  } else if (period === 'week') {
    groupBy = "strftime('%Y-%W', created_at)";
    dateFormat = 'week';
    limit = 12;
  } else {
    groupBy = "strftime('%Y-%m', created_at)";
    dateFormat = 'month';
    limit = 12;
  }

  // 小程序数据库的orders表没有original_amount和coupon_amount字段
  // 只统计已支付订单的收入
  let revenue;
  if (isSharedDb) {
    revenue = getAll(`
      SELECT
        ${groupBy} as ${dateFormat},
        COUNT(*) as orders,
        COALESCE(SUM(amount), 0) as revenue,
        0 as original_revenue,
        0 as coupon_discount
      FROM orders
      WHERE status = 'paid'
      GROUP BY ${groupBy}
      ORDER BY ${dateFormat} DESC
      LIMIT ${limit}
    `);
  } else {
    revenue = getAll(`
      SELECT
        ${groupBy} as ${dateFormat},
        COUNT(*) as orders,
        COALESCE(SUM(amount), 0) as revenue,
        COALESCE(SUM(original_amount), 0) as original_revenue,
        COALESCE(SUM(coupon_amount), 0) as coupon_discount
      FROM orders
      WHERE status = 'paid'
      GROUP BY ${groupBy}
      ORDER BY ${dateFormat} DESC
      LIMIT ${limit}
    `);
  }

  // 填充缺失的日期（仅对按天统计有效）
  if (period === 'day') {
    const revenueMap = new Map(revenue.map(r => [r.date, r]));
    const filledRevenue = [];
    const today = new Date();
    
    for (let i = limit - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      if (revenueMap.has(dateStr)) {
        filledRevenue.push(revenueMap.get(dateStr));
      } else {
        filledRevenue.push({
          date: dateStr,
          orders: 0,
          revenue: 0,
          original_revenue: 0,
          coupon_discount: 0
        });
      }
    }
    
    return res.json({
      code: 200,
      data: filledRevenue
    });
  }

  res.json({
    code: 200,
    data: revenue.reverse()
  });
});

module.exports = router;
