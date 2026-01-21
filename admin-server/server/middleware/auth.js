const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, authConfig.jwtSecret);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ code: 401, message: '认证令牌无效或已过期' });
  }
}

module.exports = authMiddleware;
