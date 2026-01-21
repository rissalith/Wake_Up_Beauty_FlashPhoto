/**
 * Token 生成和验证工具
 * 使用 JWT 替代简单的时间戳 token
 */
const jwt = require('jsonwebtoken');

// JWT 密钥（从环境变量获取）
const JWT_SECRET = process.env.JWT_SECRET || 'flashphoto-default-secret-change-in-production';

// Token 过期时间配置
const TOKEN_EXPIRES = {
  access: '7d',      // 访问 token 7 天
  refresh: '30d'     // 刷新 token 30 天
};

/**
 * 生成用户访问 Token
 * @param {string} userId - 用户 ID
 * @param {Object} extra - 额外的 payload 数据
 * @returns {string} JWT token
 */
function generateToken(userId, extra = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const payload = {
    userId,
    type: 'access',
    ...extra
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRES.access
  });
}

/**
 * 生成刷新 Token
 * @param {string} userId - 用户 ID
 * @returns {string} JWT refresh token
 */
function generateRefreshToken(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const payload = {
    userId,
    type: 'refresh'
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRES.refresh
  });
}

/**
 * 验证 Token
 * @param {string} token - JWT token
 * @returns {Object|null} 解码后的 payload 或 null（验证失败）
 */
function verifyToken(token) {
  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    // Token 无效或已过期
    return null;
  }
}

/**
 * 解码 Token（不验证签名，仅解析）
 * @param {string} token - JWT token
 * @returns {Object|null} 解码后的 payload 或 null
 */
function decodeToken(token) {
  if (!token) {
    return null;
  }

  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
}

/**
 * 从请求头中提取 Token
 * @param {Object} req - Express 请求对象
 * @returns {string|null} Token 或 null
 */
function extractTokenFromHeader(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  // 支持 "Bearer <token>" 格式
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 也支持直接传 token
  return authHeader;
}

/**
 * 用户认证中间件（用于小程序端接口）
 * 验证请求中的 token 并将用户信息附加到 req.user
 */
function userAuthMiddleware(req, res, next) {
  // 尝试从多个位置获取 token
  const token = extractTokenFromHeader(req) ||
                req.headers['x-token'] ||
                req.query.token;

  if (!token) {
    return res.status(401).json({
      code: 401,
      message: '未提供认证信息'
    });
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      code: 401,
      message: 'Token 无效或已过期'
    });
  }

  // 将用户信息附加到请求对象
  req.user = {
    userId: decoded.userId,
    tokenType: decoded.type
  };

  next();
}

/**
 * 可选认证中间件
 * 如果提供了 token 则验证，否则继续（用于可选登录的接口）
 */
function optionalAuthMiddleware(req, res, next) {
  const token = extractTokenFromHeader(req) ||
                req.headers['x-token'] ||
                req.query.token;

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = {
        userId: decoded.userId,
        tokenType: decoded.type
      };
    }
  }

  next();
}

/**
 * 验证请求者是否有权操作目标用户
 * @param {Object} req - Express 请求对象
 * @param {string} targetUserId - 目标用户 ID
 * @returns {boolean} 是否有权限
 */
function canAccessUser(req, targetUserId) {
  // 如果没有认证信息，检查请求头中的 x-user-id
  if (!req.user) {
    const headerUserId = req.headers['x-user-id'];
    return headerUserId === targetUserId;
  }

  // 已认证用户只能操作自己的数据
  return req.user.userId === targetUserId;
}

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  decodeToken,
  extractTokenFromHeader,
  userAuthMiddleware,
  optionalAuthMiddleware,
  canAccessUser,
  JWT_SECRET,
  TOKEN_EXPIRES
};
