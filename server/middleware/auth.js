/**
 * 认证中间件 - 管理端接口认证
 */
module.exports = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ code: 401, message: '未授权' });
  }
  // 简化验证，实际应验证 JWT
  next();
};