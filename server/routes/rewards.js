const express = require('express');
const router = express.Router();

// 获取奖励配置
router.get('/config', (req, res) => {
  try {
    const db = req.app.locals.getDb();
    const rewards = db.prepare('SELECT type, name, points, description, max_times, is_active FROM point_rewards ORDER BY id').all();

    res.json({
      code: 0,
      data: rewards.map(r => ({
        type: r.type,
        name: r.name,
        points: r.points,
        description: r.description,
        maxTimes: r.max_times,
        isActive: r.is_active === 1
      }))
    });
  } catch (error) {
    console.error('获取奖励配置错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
