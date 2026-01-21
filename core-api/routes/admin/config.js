/**
 * 后台配置管理路由
 */
const express = require('express');
const router = express.Router();
const { getDb, dbRun, saveDatabase } = require('../../config/database');

// 获取所有系统配置
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const configs = db.prepare('SELECT * FROM system_config ORDER BY id').all();

    res.json({
      code: 0,
      data: configs.map(c => ({
        id: c.id,
        key: c.config_key,
        value: c.config_value,
        type: c.config_type,
        description: c.description,
        isPublic: c.is_public === 1,
        updatedAt: c.updated_at
      }))
    });
  } catch (error) {
    console.error('获取系统配置错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新配置
router.put('/:key', (req, res) => {
  try {
    const db = getDb();
    const { key } = req.params;
    const { value, description, isPublic } = req.body;

    const existing = db.prepare('SELECT * FROM system_config WHERE config_key = ?').get(key);

    if (existing) {
      dbRun(db,
        'UPDATE system_config SET config_value = ?, description = COALESCE(?, description), is_public = COALESCE(?, is_public), updated_at = CURRENT_TIMESTAMP WHERE config_key = ?',
        [value, description, isPublic !== undefined ? (isPublic ? 1 : 0) : null, key]);
    } else {
      dbRun(db,
        'INSERT INTO system_config (config_key, config_value, description, is_public) VALUES (?, ?, ?, ?)',
        [key, value, description || '', isPublic ? 1 : 0]);
    }

    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新配置错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 批量更新配置
router.post('/batch', (req, res) => {
  try {
    const db = getDb();
    const { configs } = req.body;

    if (!configs || !Array.isArray(configs)) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    configs.forEach(({ key, value }) => {
      const existing = db.prepare('SELECT * FROM system_config WHERE config_key = ?').get(key);
      if (existing) {
        dbRun(db, 'UPDATE system_config SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?', [value, key]);
      }
    });

    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('批量更新配置错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取奖励配置
router.get('/rewards', (req, res) => {
  try {
    const db = getDb();
    const rewards = db.prepare('SELECT * FROM point_rewards ORDER BY id').all();

    res.json({
      code: 0,
      data: rewards
    });
  } catch (error) {
    console.error('获取奖励配置错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新奖励配置
router.put('/rewards/:type', (req, res) => {
  try {
    const db = getDb();
    const { type } = req.params;
    const { points, isActive, maxTimes, name, description } = req.body;

    const existing = db.prepare('SELECT * FROM point_rewards WHERE type = ?').get(type);
    if (!existing) {
      return res.status(404).json({ code: -1, msg: '奖励类型不存在' });
    }

    dbRun(db,
      `UPDATE point_rewards SET 
        points = COALESCE(?, points),
        is_active = COALESCE(?, is_active),
        max_times = COALESCE(?, max_times),
        name = COALESCE(?, name),
        description = COALESCE(?, description)
      WHERE type = ?`,
      [points, isActive !== undefined ? (isActive ? 1 : 0) : null, maxTimes, name, description, type]);

    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新奖励配置错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
