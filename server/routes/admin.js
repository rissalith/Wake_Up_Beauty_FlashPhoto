const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// 管理员登录
router.post('/login', (req, res) => {
  try {
    const { getDb, saveDatabase, dbRun } = req.app.locals;
    const db = getDb();
    const { username, password } = req.body;

    const admin = db.prepare('SELECT * FROM admins WHERE username = ? AND password = ?').get(username, password);

    if (!admin) {
      return res.status(401).json({ code: -1, msg: '用户名或密码错误' });
    }

    dbRun(db, 'UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
    saveDatabase();

    res.json({
      code: 0,
      data: {
        adminId: admin.id,
        username: admin.username,
        role: admin.role,
        token: Buffer.from(`${admin.id}:${Date.now()}`).toString('base64')
      }
    });
  } catch (error) {
    console.error('管理员登录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取仪表盘统计
router.get('/dashboard', (req, res) => {
  try {
    const { getDb } = req.app.locals;
    const { env } = req.query;
    const db = getDb(env);

    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const todayUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = DATE('now')").get().count;

    const totalPoints = db.prepare('SELECT SUM(points) as sum FROM users').get().sum || 0;
    const todayRecharge = db.prepare("SELECT SUM(amount) as sum FROM points_records WHERE type = 'recharge' AND DATE(created_at) = DATE('now')").get().sum || 0;
    const todayConsume = db.prepare("SELECT SUM(ABS(amount)) as sum FROM points_records WHERE type = 'consume' AND DATE(created_at) = DATE('now')").get().sum || 0;

    const totalPhotos = db.prepare('SELECT COUNT(*) as count FROM photo_history').get().count;
    const todayPhotos = db.prepare("SELECT COUNT(*) as count FROM photo_history WHERE DATE(created_at) = DATE('now')").get().count;

    const totalInvites = db.prepare("SELECT COUNT(*) as count FROM invites WHERE status = 'completed'").get().count;

    res.json({
      code: 0,
      data: {
        users: { total: totalUsers, today: todayUsers },
        points: { total: totalPoints, todayRecharge, todayConsume },
        photos: { total: totalPhotos, today: todayPhotos },
        invites: { total: totalInvites }
      }
    });
  } catch (error) {
    console.error('获取仪表盘统计错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取用户列表
router.get('/users', (req, res) => {
  try {
    const { getDb } = req.app.locals;
    const { env, page = 1, pageSize = 20, keyword, status } = req.query;
    const db = getDb(env);

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

    const users = db.prepare(sql + ` LIMIT ? OFFSET ?`).all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as count')).get(...params).count;

    res.json({
      code: 0,
      data: { list: users, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 调整用户醒币
router.post('/users/:userId/adjust-points', (req, res) => {
  try {
    const { getDb, saveDatabase, dbRun } = req.app.locals;
    const { env } = req.query;
    const db = getDb(env);
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

    saveDatabase(env);

    res.json({ code: 0, msg: 'success', data: { newBalance } });
  } catch (error) {
    console.error('调整用户醒币错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 禁用/启用用户
router.post('/users/:userId/toggle-status', (req, res) => {
  try {
    const { getDb, saveDatabase, dbRun } = req.app.locals;
    const { env } = req.query;
    const db = getDb(env);
    const { userId } = req.params;

    const user = db.prepare('SELECT status FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const newStatus = user.status === 'active' ? 'disabled' : 'active';

    dbRun(db, 'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, userId]);
    saveDatabase(env);

    res.json({ code: 0, msg: 'success', data: { newStatus } });
  } catch (error) {
    console.error('切换用户状态错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
