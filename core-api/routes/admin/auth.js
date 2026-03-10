/**
 * 后台管理认证路由
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb, dbRun } = require('../../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'flashphoto-admin-jwt-secret-2024';

if (!process.env.JWT_SECRET) {
  console.warn('[Admin Auth] 警告: JWT_SECRET 环境变量未配置，正在使用不安全的默认值！请在生产环境中配置 JWT_SECRET');
}

// Admin JWT 鉴权中间件（供其他 admin 路由使用）
function adminAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: -1, msg: '未提供认证信息' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    req.admin = {
      adminId: decoded.adminId,
      username: decoded.username,
      role: decoded.role
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ code: -1, msg: 'Token已过期' });
    }
    res.status(401).json({ code: -1, msg: 'Token无效' });
  }
}

// 管理员登录
router.post('/login', async (req, res) => {
  try {
    const db = getDb();
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ code: -1, msg: '用户名和密码不能为空' });
    }

    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

    if (!admin) {
      return res.status(401).json({ code: -1, msg: '用户名或密码错误' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ code: -1, msg: '用户名或密码错误' });
    }

    // 更新最后登录时间
    dbRun(db, 'UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);

    // 生成 JWT
    const token = jwt.sign(
      { adminId: admin.id, username: admin.username, role: admin.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      code: 0,
      data: {
        adminId: admin.id,
        username: admin.username,
        role: admin.role,
        token
      }
    });
  } catch (error) {
    console.error('管理员登录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 验证 token（复用中间件）
router.get('/verify', adminAuthMiddleware, (req, res) => {
  res.json({ code: 0, data: req.admin });
});

// 修改密码（复用中间件）
router.post('/change-password', adminAuthMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ code: -1, msg: '参数不完整' });
    }

    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.adminId);
    if (!admin) {
      return res.status(404).json({ code: -1, msg: '管理员不存在' });
    }

    const isMatch = await bcrypt.compare(oldPassword, admin.password);
    if (!isMatch) {
      return res.status(400).json({ code: -1, msg: '原密码错误' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    dbRun(db, 'UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, req.admin.adminId]);

    res.json({ code: 0, msg: '密码修改成功' });
  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
module.exports.adminAuthMiddleware = adminAuthMiddleware;
