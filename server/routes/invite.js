const express = require('express');
const router = express.Router();

// 获取邀请统计
router.get('/stats/:userId', (req, res) => {
  try {
    const { getDb, findUserByIdOrOpenid, getRewardConfig } = req.app.locals;
    const db = getDb();
    const { userId } = req.params;

    const user = findUserByIdOrOpenid(db, userId);
    const realUserId = user ? user.id : userId;

    const invitedCount = db.prepare("SELECT COUNT(*) as count FROM invites WHERE inviter_id = ? AND status = 'completed'").get(realUserId).count;
    const earnedPoints = db.prepare("SELECT SUM(reward_points) as sum FROM invites WHERE inviter_id = ? AND status = 'completed'").get(realUserId).sum || 0;

    const inviteReward = getRewardConfig(db, 'invite_friend');

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
    const { getDb } = req.app.locals;
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
