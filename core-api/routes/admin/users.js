/**
 * 后台用户管理路由
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb, dbRun, saveDatabase } = require('../../config/database');

// 批量删除用户（注销）
router.post('/batch-delete', (req, res) => {
  try {
    const db = getDb();
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ code: -1, msg: '请提供要注销的用户ID列表' });
    }

    if (userIds.length > 100) {
      return res.status(400).json({ code: -1, msg: '单次最多注销100个用户' });
    }

    let deletedCount = 0;

    for (const userId of userIds) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (user) {
        // 删除用户相关数据
        dbRun(db, 'DELETE FROM points_records WHERE user_id = ?', [userId]);
        dbRun(db, 'DELETE FROM photo_history WHERE user_id = ?', [userId]);
        dbRun(db, 'DELETE FROM orders WHERE user_id = ?', [userId]);
        dbRun(db, 'DELETE FROM invites WHERE inviter_id = ? OR invitee_id = ?', [userId, userId]);
        dbRun(db, 'DELETE FROM feedbacks WHERE user_id = ?', [userId]);
        dbRun(db, 'DELETE FROM users WHERE id = ?', [userId]);
        deletedCount++;
      }
    }

    saveDatabase();

    res.json({
      code: 0,
      msg: `成功注销 ${deletedCount} 个用户`,
      data: { deletedCount }
    });
  } catch (error) {
    console.error('批量删除用户错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取用户列表
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, pageSize = 20, keyword, status } = req.query;

    let sql = 'SELECT * FROM users WHERE 1=1';
    const params = [];

    if (keyword) {
      sql += ' AND (nickname LIKE ? OR openid LIKE ? OR email LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const users = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as count')).get(...params).count;

    res.json({
      code: 0,
      data: {
        list: users,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取单个用户详情
router.get('/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    // 获取用户统计
    const photoCount = db.prepare('SELECT COUNT(*) as count FROM photo_history WHERE user_id = ?').get(userId).count;
    const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_id = ?').get(userId).count;

    res.json({
      code: 0,
      data: {
        ...user,
        photoCount,
        orderCount
      }
    });
  } catch (error) {
    console.error('获取用户详情错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 调整用户积分
router.post('/:userId/adjust-points', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { amount, reason, operator } = req.body;

    if (!amount || amount === 0) {
      return res.status(400).json({ code: -1, msg: '调整数量不能为0' });
    }

    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const newBalance = user.points + amount;

    if (newBalance < 0) {
      return res.status(400).json({ code: -1, msg: '调整后余额不能为负数' });
    }

    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, userId]);
    dbRun(db,
      'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, operator) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), userId, 'admin_adjust', amount, newBalance, reason || '管理员调整', operator || 'admin']);

    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { newBalance }
    });
  } catch (error) {
    console.error('调整用户积分错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 禁用/启用用户
router.post('/:userId/toggle-status', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    const user = db.prepare('SELECT status FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    dbRun(db, 'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, userId]);
    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { newStatus }
    });
  } catch (error) {
    console.error('切换用户状态错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取用户积分记录
router.get('/:userId/points-records', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { page = 1, pageSize = 20, type } = req.query;

    let sql = 'SELECT * FROM points_records WHERE user_id = ?';
    const params = [userId];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const records = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as count')).get(...params).count;

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
    console.error('获取用户积分记录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取用户统计数据（用于详情页）
router.get('/:userId/stats', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    // 累计充值统计
    const rechargeStats = db.prepare(`
      SELECT
        COALESCE(SUM(amount), 0) as amount,
        COALESCE(SUM(points_amount + bonus_points), 0) as points,
        COUNT(*) as count
      FROM orders
      WHERE user_id = ? AND status = 'paid'
    `).get(userId);

    // 累计消费统计
    const consumeStats = db.prepare(`
      SELECT
        COALESCE(SUM(ABS(amount)), 0) as points,
        COUNT(*) as count
      FROM points_records
      WHERE user_id = ? AND type = 'consume'
    `).get(userId);

    // 分享奖励统计
    const shareStats = db.prepare(`
      SELECT
        COALESCE(SUM(amount), 0) as points,
        COUNT(*) as count
      FROM points_records
      WHERE user_id = ? AND type = 'share_photo'
    `).get(userId);

    // 邀请奖励统计
    const inviteStats = db.prepare(`
      SELECT
        COALESCE(SUM(reward_points), 0) as points,
        COUNT(*) as count
      FROM invites
      WHERE inviter_id = ? AND status = 'completed'
    `).get(userId);

    // 协议签署状态
    const agreements = {
      privacy: {
        signed: user.privacy_agreed === 1,
        signedAt: user.agreement_time
      },
      terms: {
        signed: user.terms_agreed === 1,
        signedAt: user.agreement_time
      }
    };

    res.json({
      code: 0,
      data: {
        totalRecharge: {
          amount: (rechargeStats.amount || 0) / 100, // 分转元
          points: rechargeStats.points || 0,
          count: rechargeStats.count || 0
        },
        totalConsume: {
          points: consumeStats.points || 0,
          count: consumeStats.count || 0
        },
        totalShare: {
          points: shareStats.points || 0,
          count: shareStats.count || 0
        },
        totalInvite: {
          points: inviteStats.points || 0,
          count: inviteStats.count || 0
        },
        agreements
      }
    });
  } catch (error) {
    console.error('获取用户统计错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取用户订单列表
router.get('/:userId/orders', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    const sql = 'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const orders = db.prepare(sql + ' LIMIT ? OFFSET ?').all(userId, parseInt(pageSize), offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_id = ?').get(userId).count;

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
    console.error('获取用户订单错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取用户照片列表
router.get('/:userId/photos', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    const sql = 'SELECT * FROM photo_history WHERE user_id = ? ORDER BY created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const photos = db.prepare(sql + ' LIMIT ? OFFSET ?').all(userId, parseInt(pageSize), offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM photo_history WHERE user_id = ?').get(userId).count;

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
    console.error('获取用户照片错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取用户操作记录（综合时间线）
router.get('/:userId/activities', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    // 获取积分记录
    const pointsRecords = db.prepare(`
      SELECT
        id, 'points' as activity_type, type as sub_type,
        amount, balance_after, description, created_at
      FROM points_records
      WHERE user_id = ?
    `).all(userId);

    // 获取照片生成记录
    const photoRecords = db.prepare(`
      SELECT
        id, 'photo' as activity_type, status as sub_type,
        spec, bg_color, created_at
      FROM photo_history
      WHERE user_id = ?
    `).all(userId);

    // 获取订单记录
    const orderRecords = db.prepare(`
      SELECT
        id, 'order' as activity_type, status as sub_type,
        amount, points_amount, bonus_points, created_at
      FROM orders
      WHERE user_id = ?
    `).all(userId);

    // 获取邀请记录（作为邀请者）
    const inviteRecords = db.prepare(`
      SELECT
        i.id, 'invite' as activity_type, i.status as sub_type,
        i.reward_points, i.created_at, u.nickname as invitee_nickname
      FROM invites i
      LEFT JOIN users u ON i.invitee_id = u.id
      WHERE i.inviter_id = ?
    `).all(userId);

    // 合并所有记录并按时间排序
    const allActivities = [
      ...pointsRecords.map(r => ({ ...r, activity_type: 'points' })),
      ...photoRecords.map(r => ({ ...r, activity_type: 'photo' })),
      ...orderRecords.map(r => ({ ...r, activity_type: 'order' })),
      ...inviteRecords.map(r => ({ ...r, activity_type: 'invite' }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // 分页
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const paginatedActivities = allActivities.slice(offset, offset + parseInt(pageSize));

    res.json({
      code: 0,
      data: {
        list: paginatedActivities,
        total: allActivities.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取用户操作记录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 删除用户（注销）
router.delete('/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    // 删除用户相关数据
    dbRun(db, 'DELETE FROM points_records WHERE user_id = ?', [userId]);
    dbRun(db, 'DELETE FROM photo_history WHERE user_id = ?', [userId]);
    dbRun(db, 'DELETE FROM orders WHERE user_id = ?', [userId]);
    dbRun(db, 'DELETE FROM invites WHERE inviter_id = ? OR invitee_id = ?', [userId, userId]);
    dbRun(db, 'DELETE FROM feedbacks WHERE user_id = ?', [userId]);
    dbRun(db, 'DELETE FROM users WHERE id = ?', [userId]);

    saveDatabase();

    res.json({
      code: 0,
      msg: '用户注销成功'
    });
  } catch (error) {
    console.error('删除用户错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
