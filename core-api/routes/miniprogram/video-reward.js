/**
 * 视频奖励 API
 * 用户观看视频获得醒币奖励
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/video-reward/claim - 领取视频奖励
 * @body {string} userId - 用户ID
 * @body {string} videoId - 视频ID（预留广告位）
 * @body {number} watchDuration - 观看时长（秒）
 */
router.post('/claim', async (req, res) => {
  try {
    const { userId, videoId, watchDuration } = req.body;

    if (!userId) {
      return res.status(400).json({ code: -1, msg: '用户ID不能为空' });
    }

    const db = getDb();

    // 检查用户是否存在
    const user = db.prepare('SELECT * FROM users WHERE id = ? OR user_id = ?').get(userId, userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }
    const realUserId = user.id;

    // 验证观看时长（至少15秒）
    const minDuration = 15;
    if (!watchDuration || watchDuration < minDuration) {
      return res.status(400).json({
        code: -2,
        msg: `观看时长不足，需要至少${minDuration}秒`,
        data: { required: minDuration, actual: watchDuration || 0 }
      });
    }

    // 获取奖励配置
    const rewardConfig = db.prepare("SELECT * FROM point_rewards WHERE type = 'watch_video'").get();
    const rewardPoints = rewardConfig?.points || 30;

    // 发放奖励
    const newBalance = user.points + rewardPoints;
    db.prepare('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newBalance, realUserId);

    // 记录积分变动
    db.prepare(`
      INSERT INTO points_records (id, user_id, type, amount, balance_after, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(uuidv4(), realUserId, 'watch_video', rewardPoints, newBalance, '观看视频奖励');

    // 记录视频奖励
    db.prepare(`
      INSERT INTO video_reward_records (user_id, video_id, points_earned, watch_duration, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(realUserId, videoId || 'default', rewardPoints, watchDuration);

    res.json({
      code: 0,
      msg: 'success',
      data: {
        pointsEarned: rewardPoints,
        newBalance: newBalance
      }
    });

  } catch (error) {
    console.error('[VideoReward] Claim error:', error);
    res.status(500).json({ code: -1, msg: '服务器错误', error: error.message });
  }
});

/**
 * GET /api/video-reward/status/:userId - 获取今日视频奖励状态
 */
router.get('/status/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const db = getDb();

    // 获取真实用户ID
    const user = db.prepare('SELECT id, points FROM users WHERE id = ? OR user_id = ?').get(userId, userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const today = new Date().toISOString().split('T')[0];

    // 获取今日领取次数
    const todayCount = db.prepare(`
      SELECT COUNT(*) as count FROM video_reward_records
      WHERE user_id = ? AND DATE(created_at) = ?
    `).get(user.id, today).count;

    // 获取今日获得的总醒币
    const todayPoints = db.prepare(`
      SELECT SUM(points_earned) as total FROM video_reward_records
      WHERE user_id = ? AND DATE(created_at) = ?
    `).get(user.id, today).total || 0;

    // 获取奖励配置
    const rewardConfig = db.prepare("SELECT * FROM point_rewards WHERE type = 'watch_video'").get();
    const rewardPoints = rewardConfig?.points || 30;

    res.json({
      code: 0,
      data: {
        todayCount,
        todayPoints,
        pointsPerVideo: rewardPoints,
        canClaim: true,  // 无限次
        currentBalance: user.points
      }
    });

  } catch (error) {
    console.error('[VideoReward] Get status error:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

/**
 * GET /api/video-reward/records/:userId - 获取用户视频奖励记录
 */
router.get('/records/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const db = getDb();

    // 获取真实用户ID
    const user = db.prepare('SELECT id FROM users WHERE id = ? OR user_id = ?').get(userId, userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const records = db.prepare(`
      SELECT * FROM video_reward_records
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(user.id, parseInt(limit), parseInt(offset));

    res.json({
      code: 0,
      data: records
    });

  } catch (error) {
    console.error('[VideoReward] Get records error:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
