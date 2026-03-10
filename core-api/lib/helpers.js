/**
 * 公共辅助函数
 * 统一 findUserByIdOrOpenid 和 getRewardConfig，避免各路由文件重复定义
 */
const { getDb } = require('../config/database');

/**
 * 通过 id 或 openid 查找用户
 * @param {string} userId - 用户 ID 或 openid
 * @returns {object|null} 用户对象
 */
function findUserByIdOrOpenid(userId) {
  const db = getDb();
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE openid = ?').get(userId);
  }
  return user;
}

/**
 * 获取奖励配置
 * @param {string} type - 奖励类型
 * @returns {{ points: number, isActive: boolean, maxTimes: number }}
 */
function getRewardConfig(type) {
  const db = getDb();
  try {
    const row = db.prepare('SELECT points, is_active, max_times FROM point_rewards WHERE type = ?').get(type);
    if (row) {
      return { points: row.points, isActive: row.is_active === 1, maxTimes: row.max_times };
    }
  } catch (e) {
    console.error('获取奖励配置失败:', e.message);
  }
  const defaults = {
    new_user: { points: 50, isActive: true, maxTimes: 1 },
    daily_login: { points: 2, isActive: true, maxTimes: 1 },
    invite_friend: { points: 10, isActive: true, maxTimes: -1 }
  };
  return defaults[type] || { points: 0, isActive: false, maxTimes: 0 };
}

module.exports = {
  findUserByIdOrOpenid,
  getRewardConfig
};
