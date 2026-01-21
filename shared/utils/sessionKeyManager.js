/**
 * Session Key 管理工具
 * 使用 Redis 安全存储 session_key，设置过期时间
 *
 * session_key 是微信登录返回的会话密钥，用于：
 * 1. 解密用户敏感数据（如手机号）
 * 2. 虚拟支付签名验证
 *
 * 安全考虑：
 * - 不在数据库中长期存储
 * - 设置合理的过期时间（默认 2 小时）
 * - 每次登录更新
 */

// Redis 客户端（延迟初始化）
let redis = null;

// 默认过期时间（秒）
const DEFAULT_EXPIRE = 7200; // 2 小时

/**
 * 初始化 Redis 连接
 * @param {Object} redisClient - ioredis 客户端实例
 */
function initRedis(redisClient) {
  redis = redisClient;
}

/**
 * 获取 Redis 客户端
 * @returns {Object|null} Redis 客户端
 */
function getRedis() {
  return redis;
}

/**
 * 生成 session key 的 Redis 键名
 * @param {string} userId - 用户 ID
 * @returns {string} Redis 键名
 */
function getSessionKeyName(userId) {
  return `session:${userId}`;
}

/**
 * 存储 session_key 到 Redis
 * @param {string} userId - 用户 ID
 * @param {string} sessionKey - 微信 session_key
 * @param {number} expire - 过期时间（秒），默认 2 小时
 * @returns {Promise<boolean>} 是否成功
 */
async function storeSessionKey(userId, sessionKey, expire = DEFAULT_EXPIRE) {
  if (!redis) {
    console.warn('[SessionKey] Redis 未初始化，无法存储 session_key');
    return false;
  }

  if (!userId || !sessionKey) {
    return false;
  }

  try {
    const key = getSessionKeyName(userId);
    await redis.setex(key, expire, sessionKey);
    return true;
  } catch (error) {
    console.error('[SessionKey] 存储失败:', error.message);
    return false;
  }
}

/**
 * 从 Redis 获取 session_key
 * @param {string} userId - 用户 ID
 * @returns {Promise<string|null>} session_key 或 null
 */
async function getSessionKey(userId) {
  if (!redis) {
    console.warn('[SessionKey] Redis 未初始化，无法获取 session_key');
    return null;
  }

  if (!userId) {
    return null;
  }

  try {
    const key = getSessionKeyName(userId);
    return await redis.get(key);
  } catch (error) {
    console.error('[SessionKey] 获取失败:', error.message);
    return null;
  }
}

/**
 * 删除 session_key（用户登出时调用）
 * @param {string} userId - 用户 ID
 * @returns {Promise<boolean>} 是否成功
 */
async function deleteSessionKey(userId) {
  if (!redis) {
    return false;
  }

  if (!userId) {
    return false;
  }

  try {
    const key = getSessionKeyName(userId);
    await redis.del(key);
    return true;
  } catch (error) {
    console.error('[SessionKey] 删除失败:', error.message);
    return false;
  }
}

/**
 * 刷新 session_key 的过期时间
 * @param {string} userId - 用户 ID
 * @param {number} expire - 新的过期时间（秒）
 * @returns {Promise<boolean>} 是否成功
 */
async function refreshSessionKey(userId, expire = DEFAULT_EXPIRE) {
  if (!redis) {
    return false;
  }

  if (!userId) {
    return false;
  }

  try {
    const key = getSessionKeyName(userId);
    const exists = await redis.exists(key);
    if (exists) {
      await redis.expire(key, expire);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[SessionKey] 刷新失败:', error.message);
    return false;
  }
}

/**
 * 检查 session_key 是否存在且有效
 * @param {string} userId - 用户 ID
 * @returns {Promise<boolean>} 是否有效
 */
async function isSessionKeyValid(userId) {
  if (!redis) {
    return false;
  }

  if (!userId) {
    return false;
  }

  try {
    const key = getSessionKeyName(userId);
    const ttl = await redis.ttl(key);
    return ttl > 0;
  } catch (error) {
    console.error('[SessionKey] 检查失败:', error.message);
    return false;
  }
}

module.exports = {
  initRedis,
  getRedis,
  storeSessionKey,
  getSessionKey,
  deleteSessionKey,
  refreshSessionKey,
  isSessionKeyValid,
  DEFAULT_EXPIRE
};
