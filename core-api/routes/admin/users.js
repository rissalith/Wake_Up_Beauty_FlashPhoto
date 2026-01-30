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

    // 使用事务和批量删除优化性能
    const transaction = db.transaction(() => {
      // 先验证哪些用户存在
      const placeholders = userIds.map(() => '?').join(',');
      const existingUsers = db.prepare(`SELECT id FROM users WHERE id IN (${placeholders})`).all(...userIds);
      const existingIds = existingUsers.map(u => u.id);

      if (existingIds.length === 0) {
        return 0;
      }

      const existingPlaceholders = existingIds.map(() => '?').join(',');

      // 批量删除相关数据
      db.prepare(`DELETE FROM points_records WHERE user_id IN (${existingPlaceholders})`).run(...existingIds);
      db.prepare(`DELETE FROM photo_history WHERE user_id IN (${existingPlaceholders})`).run(...existingIds);
      db.prepare(`DELETE FROM orders WHERE user_id IN (${existingPlaceholders})`).run(...existingIds);
      db.prepare(`DELETE FROM feedbacks WHERE user_id IN (${existingPlaceholders})`).run(...existingIds);

      // 邀请表需要特殊处理（两个字段）
      const invitePlaceholders = [...existingIds, ...existingIds].map(() => '?').join(',');
      db.prepare(`DELETE FROM invites WHERE inviter_id IN (${existingPlaceholders}) OR invitee_id IN (${existingPlaceholders})`).run(...existingIds, ...existingIds);

      // 最后删除用户
      db.prepare(`DELETE FROM users WHERE id IN (${existingPlaceholders})`).run(...existingIds);

      return existingIds.length;
    });

    const deletedCount = transaction();
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

    // 确保 amount 是数字
    const adjustAmount = parseInt(amount, 10);
    if (isNaN(adjustAmount) || adjustAmount === 0) {
      return res.status(400).json({ code: -1, msg: '调整数量不能为0' });
    }

    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    // 处理 points 为 NULL 的情况
    const currentPoints = user.points || 0;
    const newBalance = currentPoints + adjustAmount;

    if (newBalance < 0) {
      return res.status(400).json({ code: -1, msg: '调整后余额不能为负数' });
    }

    dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, userId]);
    dbRun(db,
      'INSERT INTO points_records (id, user_id, type, amount, balance_after, description, operator) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), userId, 'admin_adjust', adjustAmount, newBalance, reason || '管理员调整', operator || 'admin']);

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
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 使用 UNION ALL 在数据库层面合并和分页，避免内存中处理大量数据
    const activities = db.prepare(`
      SELECT * FROM (
        SELECT
          id, 'points' as activity_type, type as sub_type,
          amount, balance_after, description, NULL as scene, NULL as spec, NULL as bg_color,
          NULL as points_amount, NULL as bonus_points, NULL as invitee_nickname,
          NULL as reward_points, created_at
        FROM points_records
        WHERE user_id = ?

        UNION ALL

        SELECT
          id, 'photo' as activity_type, status as sub_type,
          NULL as amount, NULL as balance_after, NULL as description, scene, spec, bg_color,
          NULL as points_amount, NULL as bonus_points, NULL as invitee_nickname,
          NULL as reward_points, created_at
        FROM photo_history
        WHERE user_id = ?

        UNION ALL

        SELECT
          id, 'order' as activity_type, status as sub_type,
          amount, NULL as balance_after, NULL as description, NULL as scene, NULL as spec, NULL as bg_color,
          points_amount, bonus_points, NULL as invitee_nickname,
          NULL as reward_points, created_at
        FROM orders
        WHERE user_id = ?

        UNION ALL

        SELECT
          i.id, 'invite' as activity_type, i.status as sub_type,
          NULL as amount, NULL as balance_after, NULL as description, NULL as scene, NULL as spec, NULL as bg_color,
          NULL as points_amount, NULL as bonus_points, u.nickname as invitee_nickname,
          i.reward_points, i.created_at
        FROM invites i
        LEFT JOIN users u ON i.invitee_id = u.id
        WHERE i.inviter_id = ?
      ) AS activities
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, userId, userId, userId, limit, offset);

    // 获取总数
    const totalResult = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM points_records WHERE user_id = ?) +
        (SELECT COUNT(*) FROM photo_history WHERE user_id = ?) +
        (SELECT COUNT(*) FROM orders WHERE user_id = ?) +
        (SELECT COUNT(*) FROM invites WHERE inviter_id = ?) as total
    `).get(userId, userId, userId, userId);

    res.json({
      code: 0,
      data: {
        list: activities,
        total: totalResult.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取用户操作记录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取用户行为记录
router.get('/:userId/behaviors', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const {
      page = 1,
      pageSize = 20,
      behavior_type,
      start_date,
      end_date
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 构建查询条件
    let whereClause = 'WHERE user_id = ?';
    const params = [userId];

    if (behavior_type) {
      whereClause += ' AND behavior_type = ?';
      params.push(behavior_type);
    }

    if (start_date) {
      whereClause += ' AND created_at >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND created_at <= ?';
      params.push(end_date);
    }

    // 查询数据
    const behaviors = db.prepare(`
      SELECT
        id, session_id, behavior_type, behavior_name,
        page_path, page_query, element_id, element_type, element_text,
        extra_data, device_brand, device_model, network_type,
        duration, client_time, created_at
      FROM user_behaviors
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // 查询总数
    const totalResult = db.prepare(`
      SELECT COUNT(*) as total FROM user_behaviors ${whereClause}
    `).get(...params);

    res.json({
      code: 0,
      data: {
        list: behaviors,
        total: totalResult.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });

  } catch (error) {
    console.error('获取用户行为记录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取用户行为统计
router.get('/:userId/behavior-stats', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    // 行为类型统计
    const typeStats = db.prepare(`
      SELECT behavior_type, COUNT(*) as count
      FROM user_behaviors
      WHERE user_id = ?
      GROUP BY behavior_type
    `).all(userId);

    // 最常访问的页面
    const topPages = db.prepare(`
      SELECT page_path, COUNT(*) as count
      FROM user_behaviors
      WHERE user_id = ? AND behavior_type = 'page_view'
      GROUP BY page_path
      ORDER BY count DESC
      LIMIT 10
    `).all(userId);

    // 最近7天活跃度
    const dailyActivity = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM user_behaviors
      WHERE user_id = ? AND created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all(userId);

    // 总行为数
    const totalBehaviors = db.prepare(`
      SELECT COUNT(*) as total FROM user_behaviors WHERE user_id = ?
    `).get(userId);

    res.json({
      code: 0,
      data: {
        typeStats,
        topPages,
        dailyActivity,
        totalBehaviors: totalBehaviors.total
      }
    });

  } catch (error) {
    console.error('获取用户行为统计错误:', error);
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

    // 使用事务删除用户相关数据
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM points_records WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM photo_history WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM orders WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM invites WHERE inviter_id = ? OR invitee_id = ?').run(userId, userId);
      db.prepare('DELETE FROM feedbacks WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });

    transaction();
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
