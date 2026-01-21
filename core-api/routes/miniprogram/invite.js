/**
 * 小程序邀请路由
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../../config/database');

// 辅助函数
function findUserByIdOrOpenid(userId) {
  const db = getDb();
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE openid = ?').get(userId);
  }
  return user;
}

// 获取奖励配置
function getRewardConfig(type) {
  const db = getDb();
  try {
    const row = db.prepare('SELECT points, is_active, max_times FROM point_rewards WHERE type = ?').get(type);
    if (row) {
      return { points: row.points, isActive: row.is_active === 1, maxTimes: row.max_times };
    }
  } catch (e) {}
  return { points: 10, isActive: true, maxTimes: -1 };
}

// 获取邀请统计
router.get('/stats/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    const user = findUserByIdOrOpenid(userId);
    const realUserId = user ? user.id : userId;

    const invitedCount = db.prepare("SELECT COUNT(*) as count FROM invites WHERE inviter_id = ? AND status = 'completed'").get(realUserId).count;
    const earnedPoints = db.prepare("SELECT SUM(reward_points) as sum FROM invites WHERE inviter_id = ? AND status = 'completed'").get(realUserId).sum || 0;

    const inviteReward = getRewardConfig('invite_friend');

    res.json({
      code: 0,
      data: {
        invitedCount,
        earnedPoints,
        pointsPerInvite: inviteReward.points
      }
    });
  } catch (error) {
    console.error('获取邀请统计错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取邀请记录
router.get('/records/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    const records = db.prepare(`
      SELECT i.*, u.nickname, u.avatar_url
      FROM invites i
      LEFT JOIN users u ON i.invitee_id = u.id
      WHERE i.inviter_id = ?
      ORDER BY i.created_at DESC
    `).all(userId);

    res.json({
      code: 0,
      data: records
    });
  } catch (error) {
    console.error('获取邀请记录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
