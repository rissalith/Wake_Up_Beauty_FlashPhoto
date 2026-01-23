/**
 * 后台统计路由
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../../config/database');

// 获取仪表盘统计 (兼容 /overview 和 /dashboard)
router.get(['/overview', '/dashboard'], (req, res) => {
  try {
    const db = getDb();

    // 用户统计
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const todayUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = DATE('now')").get().count;
    const activeUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").get().count;

    // 积分统计
    const totalPoints = db.prepare('SELECT SUM(points) as sum FROM users').get().sum || 0;
    const todayRecharge = db.prepare("SELECT SUM(amount) as sum FROM points_records WHERE type = 'recharge' AND DATE(created_at) = DATE('now')").get().sum || 0;
    const todayConsume = db.prepare("SELECT SUM(ABS(amount)) as sum FROM points_records WHERE type = 'consume' AND DATE(created_at) = DATE('now')").get().sum || 0;

    // 照片统计
    const totalPhotos = db.prepare('SELECT COUNT(*) as count FROM photo_history').get().count;
    const todayPhotos = db.prepare("SELECT COUNT(*) as count FROM photo_history WHERE DATE(created_at) = DATE('now')").get().count;
    const successPhotos = db.prepare("SELECT COUNT(*) as count FROM photo_history WHERE status = 'done'").get().count;
    const failedPhotos = db.prepare("SELECT COUNT(*) as count FROM photo_history WHERE status = 'failed'").get().count;

    // 订单统计
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    const paidOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'paid'").get().count;
    const totalRevenue = db.prepare("SELECT SUM(amount) as sum FROM orders WHERE status = 'paid'").get().sum || 0;

    // 邀请统计
    const totalInvites = db.prepare("SELECT COUNT(*) as count FROM invites WHERE status = 'completed'").get().count;
    const todayInvites = db.prepare("SELECT COUNT(*) as count FROM invites WHERE status = 'completed' AND DATE(created_at) = DATE('now')").get().count;

    res.json({
      code: 0,
      data: {
        users: { total: totalUsers, today: todayUsers, active: activeUsers },
        points: { total: totalPoints, todayRecharge, todayConsume },
        photos: { total: totalPhotos, today: todayPhotos, success: successPhotos, failed: failedPhotos },
        orders: { total: totalOrders, paid: paidOrders, revenue: totalRevenue },
        invites: { total: totalInvites, today: todayInvites }
      }
    });
  } catch (error) {
    console.error('获取仪表盘统计错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取趋势数据 (兼容 /daily, /revenue 和 /trends)
router.get(['/daily', '/revenue', '/trends'], (req, res) => {
  try {
    const db = getDb();
    const { days = 7 } = req.query;

    const trends = [];
    for (let i = parseInt(days) - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const users = db.prepare("SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = ?").get(dateStr).count;
      const photos = db.prepare("SELECT COUNT(*) as count FROM photo_history WHERE DATE(created_at) = ?").get(dateStr).count;
      const orders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = ?").get(dateStr).count;
      const revenue = db.prepare("SELECT SUM(amount) as sum FROM orders WHERE status = 'paid' AND DATE(created_at) = ?").get(dateStr).sum || 0;

      trends.push({ date: dateStr, users, photos, orders, revenue });
    }

    res.json({
      code: 0,
      data: trends
    });
  } catch (error) {
    console.error('获取趋势数据错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取积分流水记录
router.get('/points-records', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, pageSize = 20, userId, type, startDate, endDate } = req.query;

    let sql = `
      SELECT pr.*, u.nickname, u.openid
      FROM points_records pr
      LEFT JOIN users u ON pr.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      sql += ' AND pr.user_id = ?';
      params.push(userId);
    }

    if (type) {
      sql += ' AND pr.type = ?';
      params.push(type);
    }

    if (startDate) {
      sql += ' AND DATE(pr.created_at) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND DATE(pr.created_at) <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY pr.created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const records = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace(/SELECT pr\.\*, u\.nickname, u\.openid/i, 'SELECT COUNT(*) as count')).get(...params).count;

    res.json({
      code: 0,
      data: {
        list: records,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取积分流水错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取照片记录
router.get('/photos', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, pageSize = 20, userId, status, startDate, endDate } = req.query;

    let sql = `
      SELECT ph.*, u.nickname, u.openid
      FROM photo_history ph
      LEFT JOIN users u ON ph.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      sql += ' AND ph.user_id = ?';
      params.push(userId);
    }

    if (status) {
      sql += ' AND ph.status = ?';
      params.push(status);
    }

    if (startDate) {
      sql += ' AND DATE(ph.created_at) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND DATE(ph.created_at) <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY ph.created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const photos = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace(/SELECT ph\.\*, u\.nickname, u\.openid/i, 'SELECT COUNT(*) as count')).get(...params).count;

    res.json({
      code: 0,
      data: {
        list: photos,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取照片记录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 订单相关路由 ====================

// 获取订单列表
router.get('/orders', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, pageSize = 20, status, userId, startDate, endDate } = req.query;

    let sql = `
      SELECT o.id as order_id, o.*, u.nickname, u.openid, u.avatar_url
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND o.status = ?';
      params.push(status);
    }

    if (userId) {
      sql += ' AND o.user_id = ?';
      params.push(userId);
    }

    if (startDate) {
      sql += ' AND DATE(o.created_at) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND DATE(o.created_at) <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY o.created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const orders = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace(/SELECT o\.\*, u\.nickname, u\.openid/i, 'SELECT COUNT(*) as count')).get(...params).count;

    res.json({
      code: 0,
      data: {
        list: orders,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取订单列表错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取订单详情
router.get('/orders/:orderId', (req, res) => {
  try {
    const db = getDb();
    const { orderId } = req.params;

    const order = db.prepare(`
      SELECT o.*, u.nickname, u.openid, u.avatar_url
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `).get(orderId);

    if (!order) {
      return res.status(404).json({ code: -1, msg: '订单不存在' });
    }

    res.json({ code: 0, data: order });
  } catch (error) {
    console.error('获取订单详情错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取订单统计
router.get('/orders/stats/summary', (req, res) => {
  try {
    const db = getDb();

    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    const paidOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'paid'").get().count;
    const totalRevenue = db.prepare("SELECT SUM(amount) as sum FROM orders WHERE status = 'paid'").get().sum || 0;
    const todayOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = DATE('now')").get().count;
    const todayRevenue = db.prepare("SELECT SUM(amount) as sum FROM orders WHERE status = 'paid' AND DATE(created_at) = DATE('now')").get().sum || 0;

    res.json({
      code: 0,
      data: {
        total: totalOrders,
        paid: paidOrders,
        revenue: totalRevenue,
        todayOrders,
        todayRevenue
      }
    });
  } catch (error) {
    console.error('获取订单统计错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
