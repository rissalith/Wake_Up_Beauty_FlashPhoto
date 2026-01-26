/**
 * 后台统计路由
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../../config/database');
const { cacheManager, CACHE_TTL } = require('../../lib/cache');

// 获取仪表盘统计 (兼容 /overview 和 /dashboard)
router.get(['/overview', '/dashboard'], async (req, res) => {
  try {
    // 尝试从缓存获取
    const cacheKey = 'stats:dashboard';
    const cached = await cacheManager.get(cacheKey);
    if (cached) {
      return res.json({ code: 0, data: cached });
    }

    const db = getDb();

    // 使用单个查询获取多个统计值，减少数据库往返
    const userStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN DATE(created_at) = DATE('now') THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        COALESCE(SUM(points), 0) as totalPoints
      FROM users
    `).get();

    const pointsStats = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'recharge' AND DATE(created_at) = DATE('now') THEN amount ELSE 0 END), 0) as todayRecharge,
        COALESCE(SUM(CASE WHEN type = 'consume' AND DATE(created_at) = DATE('now') THEN ABS(amount) ELSE 0 END), 0) as todayConsume
      FROM points_records
    `).get();

    const photoStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN DATE(created_at) = DATE('now') THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM photo_history
    `).get();

    const orderStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as revenue
      FROM orders
    `).get();

    const inviteStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN DATE(created_at) = DATE('now') THEN 1 ELSE 0 END) as today
      FROM invites WHERE status = 'completed'
    `).get();

    const data = {
      users: { total: userStats.total, today: userStats.today, active: userStats.active },
      points: { total: userStats.totalPoints, todayRecharge: pointsStats.todayRecharge, todayConsume: pointsStats.todayConsume },
      photos: { total: photoStats.total, today: photoStats.today, success: photoStats.success, failed: photoStats.failed },
      orders: { total: orderStats.total, paid: orderStats.paid, revenue: orderStats.revenue },
      invites: { total: inviteStats.total, today: inviteStats.today }
    };

    // 缓存结果
    await cacheManager.set(cacheKey, data, CACHE_TTL.STATS_DASHBOARD);

    res.json({ code: 0, data });
  } catch (error) {
    console.error('获取仪表盘统计错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取趋势数据 (兼容 /daily, /revenue 和 /trends)
router.get(['/daily', '/revenue', '/trends'], async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const daysNum = parseInt(days);

    // 尝试从缓存获取
    const cacheKey = `stats:trends:${daysNum}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) {
      return res.json({ code: 0, data: cached });
    }

    const db = getDb();

    // 使用单个查询获取所有日期的数据，避免循环查询
    const trends = db.prepare(`
      WITH RECURSIVE dates(date) AS (
        SELECT DATE('now', '-' || (? - 1) || ' days')
        UNION ALL
        SELECT DATE(date, '+1 day')
        FROM dates
        WHERE date < DATE('now')
      )
      SELECT
        d.date,
        COALESCE(u.users, 0) as users,
        COALESCE(p.photos, 0) as photos,
        COALESCE(o.orders, 0) as orders,
        COALESCE(o.revenue, 0) as revenue
      FROM dates d
      LEFT JOIN (
        SELECT DATE(created_at) as date, COUNT(*) as users
        FROM users
        WHERE DATE(created_at) >= DATE('now', '-' || ? || ' days')
        GROUP BY DATE(created_at)
      ) u ON d.date = u.date
      LEFT JOIN (
        SELECT DATE(created_at) as date, COUNT(*) as photos
        FROM photo_history
        WHERE DATE(created_at) >= DATE('now', '-' || ? || ' days')
        GROUP BY DATE(created_at)
      ) p ON d.date = p.date
      LEFT JOIN (
        SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as revenue
        FROM orders
        WHERE DATE(created_at) >= DATE('now', '-' || ? || ' days')
        GROUP BY DATE(created_at)
      ) o ON d.date = o.date
      ORDER BY d.date ASC
    `).all(daysNum, daysNum, daysNum, daysNum);

    // 缓存结果
    await cacheManager.set(cacheKey, trends, CACHE_TTL.STATS_TRENDS);

    res.json({ code: 0, data: trends });
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
