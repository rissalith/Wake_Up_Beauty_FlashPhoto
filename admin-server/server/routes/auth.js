const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getOne, run } = require('../config/database');
const authConfig = require('../config/auth');
const authMiddleware = require('../middleware/auth');

// 判断是否使用共享数据库
const isSharedDb = !!process.env.SHARED_DB_PATH;

// 管理员登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
  }

  const admin = getOne('SELECT * FROM admins WHERE username = ?', [username]);

  if (!admin) {
    return res.status(401).json({ code: 401, message: '用户名或密码错误' });
  }

  // 检查密码 - 支持明文密码（小程序数据库）和加密密码
  let isPasswordValid = false;

  // 首先尝试 bcrypt 比对（加密密码）
  try {
    if (admin.password.startsWith('$2')) {
      // 密码是 bcrypt 加密的
      isPasswordValid = bcrypt.compareSync(password, admin.password);
    } else {
      // 密码是明文的（小程序数据库）
      isPasswordValid = (password === admin.password);
    }
  } catch (e) {
    // bcrypt 比对失败，尝试明文比对
    isPasswordValid = (password === admin.password);
  }

  if (!isPasswordValid) {
    return res.status(401).json({ code: 401, message: '用户名或密码错误' });
  }

  const token = jwt.sign(
    { id: admin.id, username: admin.username },
    authConfig.jwtSecret,
    { expiresIn: authConfig.jwtExpiresIn }
  );

  res.json({
    code: 200,
    message: '登录成功',
    data: {
      token,
      admin: {
        id: admin.id,
        username: admin.username
      }
    }
  });
});

// 获取当前管理员信息
router.get('/info', authMiddleware, (req, res) => {
  const admin = getOne('SELECT id, username, created_at FROM admins WHERE id = ?', [req.admin.id]);

  if (!admin) {
    return res.status(404).json({ code: 404, message: '管理员不存在' });
  }

  res.json({
    code: 200,
    data: admin
  });
});

// 退出登录
router.post('/logout', authMiddleware, (req, res) => {
  res.json({ code: 200, message: '退出成功' });
});

// 修改密码
router.post('/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ code: 400, message: '旧密码和新密码不能为空' });
  }

  const admin = getOne('SELECT * FROM admins WHERE id = ?', [req.admin.id]);

  const isPasswordValid = bcrypt.compareSync(oldPassword, admin.password);
  if (!isPasswordValid) {
    return res.status(400).json({ code: 400, message: '旧密码错误' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  run('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, req.admin.id]);

  res.json({ code: 200, message: '密码修改成功' });
});

module.exports = router;
