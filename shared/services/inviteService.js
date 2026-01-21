/**
 * 统一邀请服务模块
 * 所有服务共用，确保邀请处理逻辑一致
 */
const { v4: uuidv4 } = require('uuid');

/**
 * 邀请服务类
 * 处理邀请关系、发放奖励、统计查询
 */
class InviteService {
  /**
   * @param {Object} db - better-sqlite3 数据库实例
   * @param {Function} getRewardConfig - 获取奖励配置的函数
   */
  constructor(db, getRewardConfig) {
    this.db = db;
    this.getRewardConfig = getRewardConfig;
  }

  /**
   * 处理邀请关系
   * @param {string} inviterId - 邀请者ID
   * @param {string} inviteeId - 被邀请者ID
   * @param {Object} options - 可选参数
   * @returns {Object} 处理结果
   */
  processInvite(inviterId, inviteeId, options = {}) {
    const { source = 'link', campaignId = null, inviteCode = null } = options;

    // 1. 基本验证
    if (!inviterId || !inviteeId) {
      return { success: false, reason: 'missing_params' };
    }

    if (inviterId === inviteeId) {
      console.log('[Invite] 不能邀请自己');
      return { success: false, reason: 'self_invite' };
    }

    // 2. 验证邀请者存在
    const inviter = this.db.prepare('SELECT id, points FROM users WHERE id = ?').get(inviterId);
    if (!inviter) {
      console.log('[Invite] 邀请者不存在:', inviterId);
      return { success: false, reason: 'inviter_not_found' };
    }

    // 3. 检查是否已存在邀请关系
    const existingInvite = this.db.prepare(
      'SELECT id FROM invites WHERE inviter_id = ? AND invitee_id = ?'
    ).get(inviterId, inviteeId);
    if (existingInvite) {
      console.log('[Invite] 邀请关系已存在');
      return { success: false, reason: 'already_invited' };
    }

    // 4. 获取奖励配置
    let inviteReward = { points: 10, is_active: true, invitee_points: 0 };
    try {
      if (typeof this.getRewardConfig === 'function') {
        const config = this.getRewardConfig('invite_friend');
        if (config) {
          inviteReward = {
            points: config.points || 10,
            is_active: config.is_active !== false && config.isActive !== false,
            invitee_points: config.invitee_points || 0
          };
        }
      }
    } catch (e) {
      console.log('[Invite] 获取奖励配置失败，使用默认值:', e.message);
    }

    if (!inviteReward.is_active) {
      console.log('[Invite] 邀请奖励未启用');
      return { success: false, reason: 'reward_disabled' };
    }

    const inviterRewardPoints = inviteReward.points;
    const inviteeRewardPoints = inviteReward.invitee_points || 0;

    // 5. 使用事务处理
    try {
      const result = this.db.transaction(() => {
        // 创建邀请记录
        const inviteId = uuidv4();
        this.db.prepare(`
          INSERT INTO invites (id, inviter_id, invitee_id, status, reward_points, created_at)
          VALUES (?, ?, ?, 'completed', ?, CURRENT_TIMESTAMP)
        `).run(inviteId, inviterId, inviteeId, inviterRewardPoints);

        // 发放邀请者奖励
        const newInviterBalance = (inviter.points || 0) + inviterRewardPoints;
        this.db.prepare('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(newInviterBalance, inviterId);

        this.db.prepare(`
          INSERT INTO points_records (id, user_id, type, amount, balance_after, description, created_at)
          VALUES (?, ?, 'invite_friend', ?, ?, '邀请好友奖励', CURRENT_TIMESTAMP)
        `).run(uuidv4(), inviterId, inviterRewardPoints, newInviterBalance);

        // 发放被邀请者奖励（如果有）
        let newInviteeBalance = 0;
        if (inviteeRewardPoints > 0) {
          const invitee = this.db.prepare('SELECT points FROM users WHERE id = ?').get(inviteeId);
          newInviteeBalance = (invitee?.points || 0) + inviteeRewardPoints;

          this.db.prepare('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newInviteeBalance, inviteeId);

          this.db.prepare(`
            INSERT INTO points_records (id, user_id, type, amount, balance_after, description, created_at)
            VALUES (?, ?, 'invite_bonus', ?, ?, '被邀请奖励', CURRENT_TIMESTAMP)
          `).run(uuidv4(), inviteeId, inviteeRewardPoints, newInviteeBalance);
        }

        console.log('[Invite] 邀请处理成功:', {
          inviteId,
          inviterId,
          inviteeId,
          inviterReward: inviterRewardPoints,
          inviteeReward: inviteeRewardPoints
        });

        return {
          success: true,
          inviteId,
          inviterReward: inviterRewardPoints,
          inviteeReward: inviteeRewardPoints,
          newInviterBalance,
          newInviteeBalance
        };
      })();

      return result;
    } catch (error) {
      console.error('[Invite] 处理失败:', error);
      return { success: false, reason: 'transaction_failed', error: error.message };
    }
  }

  /**
   * 获取邀请统计
   * @param {string} userId - 用户ID
   * @returns {Object} 统计数据
   */
  getInviteStats(userId) {
    if (!userId) {
      return { invitedCount: 0, earnedPoints: 0, todayCount: 0 };
    }

    try {
      const stats = this.db.prepare(`
        SELECT
          COUNT(*) as invited_count,
          COALESCE(SUM(reward_points), 0) as earned_points,
          COUNT(CASE WHEN DATE(created_at) = DATE('now') THEN 1 END) as today_count,
          COUNT(CASE WHEN DATE(created_at) >= DATE('now', '-7 days') THEN 1 END) as week_count
        FROM invites
        WHERE inviter_id = ? AND status = 'completed'
      `).get(userId);

      return {
        invitedCount: stats?.invited_count || 0,
        earnedPoints: stats?.earned_points || 0,
        todayCount: stats?.today_count || 0,
        weekCount: stats?.week_count || 0
      };
    } catch (error) {
      console.error('[Invite] 获取统计失败:', error);
      return { invitedCount: 0, earnedPoints: 0, todayCount: 0, weekCount: 0 };
    }
  }

  /**
   * 获取邀请记录列表
   * @param {string} userId - 用户ID
   * @param {number} page - 页码
   * @param {number} pageSize - 每页数量
   * @returns {Object} 分页数据
   */
  getInviteRecords(userId, page = 1, pageSize = 20) {
    if (!userId) {
      return { list: [], total: 0, page, pageSize };
    }

    const offset = (page - 1) * pageSize;

    try {
      const total = this.db.prepare(
        'SELECT COUNT(*) as count FROM invites WHERE inviter_id = ?'
      ).get(userId)?.count || 0;

      const records = this.db.prepare(`
        SELECT i.id, i.invitee_id, i.status, i.reward_points, i.created_at,
               u.nickname, u.avatar_url
        FROM invites i
        LEFT JOIN users u ON i.invitee_id = u.id
        WHERE i.inviter_id = ?
        ORDER BY i.created_at DESC
        LIMIT ? OFFSET ?
      `).all(userId, pageSize, offset);

      return { list: records, total, page, pageSize };
    } catch (error) {
      console.error('[Invite] 获取记录失败:', error);
      return { list: [], total: 0, page, pageSize };
    }
  }

  /**
   * 检查用户是否已被邀请
   * @param {string} inviteeId - 被邀请者ID
   * @returns {boolean} 是否已被邀请
   */
  isAlreadyInvited(inviteeId) {
    if (!inviteeId) return false;

    try {
      const existing = this.db.prepare(
        'SELECT id FROM invites WHERE invitee_id = ?'
      ).get(inviteeId);
      return !!existing;
    } catch (error) {
      return false;
    }
  }
}

/**
 * 创建邀请服务实例的工厂函数
 * @param {Object} db - 数据库实例
 * @param {Function} getRewardConfig - 获取奖励配置的函数
 * @returns {InviteService} 邀请服务实例
 */
function createInviteService(db, getRewardConfig) {
  return new InviteService(db, getRewardConfig);
}

module.exports = {
  InviteService,
  createInviteService
};
