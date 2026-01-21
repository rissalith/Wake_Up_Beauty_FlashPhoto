/**
 * 统一用户查找和ID生成工具
 * 所有服务共用，确保用户查找逻辑一致
 */
const { v4: uuidv4 } = require('uuid');

/**
 * 统一用户查找函数
 * 查找顺序：id -> unionid -> openid
 * @param {Object} db - better-sqlite3 数据库实例
 * @param {string} identifier - 用户标识（可以是 id、unionid 或 openid）
 * @returns {Object|null} 用户对象或 null
 */
function findUser(db, identifier) {
  if (!identifier) return null;

  // 1. 尝试用内部 id 查找
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(identifier);
  if (user) return user;

  // 2. 尝试用 unionid 查找
  user = db.prepare('SELECT * FROM users WHERE unionid = ?').get(identifier);
  if (user) return user;

  // 3. 尝试用 openid 查找
  user = db.prepare('SELECT * FROM users WHERE openid = ?').get(identifier);
  return user;
}

/**
 * 通过 unionid 或 openid 查找用户（用于登录场景）
 * 优先使用 unionid，没有则用 openid
 * @param {Object} db - better-sqlite3 数据库实例
 * @param {string} unionid - 用户 unionid（可选）
 * @param {string} openid - 用户 openid
 * @returns {Object|null} 用户对象或 null
 */
function findUserByWxId(db, unionid, openid) {
  let user = null;

  // 优先使用 unionid 查找
  if (unionid) {
    user = db.prepare('SELECT * FROM users WHERE unionid = ?').get(unionid);
  }

  // 如果没找到，使用 openid 查找
  if (!user && openid) {
    user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
  }

  return user;
}

/**
 * 通过 app_id 和 openid 在 user_bindings 表中查找用户
 * 用于跨小程序场景
 * @param {Object} db - better-sqlite3 数据库实例
 * @param {string} appId - 小程序 AppID
 * @param {string} openid - 用户在该小程序的 openid
 * @returns {Object|null} 用户对象或 null
 */
function findUserByBinding(db, appId, openid) {
  if (!appId || !openid) return null;

  const binding = db.prepare('SELECT user_id FROM user_bindings WHERE app_id = ? AND openid = ?').get(appId, openid);
  if (binding) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(binding.user_id);
  }
  return null;
}

/**
 * 创建或更新用户绑定记录
 * @param {Object} db - better-sqlite3 数据库实例
 * @param {string} userId - 用户 ID
 * @param {string} appId - 小程序 AppID
 * @param {string} openid - 用户在该小程序的 openid
 * @param {string} sessionKey - 会话密钥（可选）
 */
function upsertUserBinding(db, userId, appId, openid, sessionKey = null) {
  if (!userId || !appId || !openid) return;

  const existing = db.prepare('SELECT id FROM user_bindings WHERE app_id = ? AND openid = ?').get(appId, openid);

  if (existing) {
    // 更新现有记录
    if (sessionKey) {
      db.prepare('UPDATE user_bindings SET user_id = ?, session_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(userId, sessionKey, existing.id);
    } else {
      db.prepare('UPDATE user_bindings SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(userId, existing.id);
    }
  } else {
    // 插入新记录
    db.prepare('INSERT INTO user_bindings (user_id, app_id, openid, session_key) VALUES (?, ?, ?, ?)')
      .run(userId, appId, openid, sessionKey);
  }
}

/**
 * 通过 id 或 openid 查找用户（兼容旧代码）
 * @param {Object} db - better-sqlite3 数据库实例
 * @param {string} userId - 用户 id 或 openid
 * @returns {Object|null} 用户对象或 null
 */
function findUserByIdOrOpenid(db, userId) {
  if (!userId) return null;

  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE openid = ?').get(userId);
  }
  return user;
}

/**
 * 生成用户 ID（统一使用 UUID v4）
 * @returns {string} UUID 格式的用户 ID
 */
function generateUserId() {
  return uuidv4();
}

/**
 * 生成订单 ID
 * @param {string} prefix - 订单前缀，默认 'ORD'
 * @returns {string} 订单 ID
 */
function generateOrderId(prefix = 'ORD') {
  return prefix + Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).substr(2, 6).toUpperCase();
}

/**
 * 生成记录 ID（用于积分记录等）
 * @param {string} prefix - 前缀
 * @returns {string} 记录 ID
 */
function generateRecordId(prefix = 'REC') {
  return prefix + Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).substr(2, 4).toUpperCase();
}

module.exports = {
  findUser,
  findUserByWxId,
  findUserByBinding,
  upsertUserBinding,
  findUserByIdOrOpenid,
  generateUserId,
  generateOrderId,
  generateRecordId
};
