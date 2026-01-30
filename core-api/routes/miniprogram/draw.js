/**
 * 抽奖/摇骰子 API
 * 支持摇骰子抽取吉祥成语和马品级
 */
const express = require('express');
const router = express.Router();
const { getDb, dbRun } = require('../../config/database');

// 品级名称映射（用于成语抽奖显示）
const RARITY_NAME_MAP = {
  'legendary': '传说',
  'epic': '史诗',
  'rare': '稀有',
  'uncommon': '优秀',
  'common': '普通',
  // 兼容其他可能的品级key
  '传说': '传说',
  '史诗': '史诗',
  '稀有': '稀有',
  '优秀': '优秀',
  '普通': '普通'
};

/**
 * POST /api/draw/roll - 摇骰子抽取
 * @body {string} sceneId - 场景ID
 * @body {string} drawType - 抽取类型: phrase(成语) / horse(马品级)
 * @body {string} userId - 用户ID
 */
router.post('/roll', async (req, res) => {
  try {
    const { sceneId, drawType, userId } = req.body;

    if (!sceneId || !drawType || !userId) {
      return res.status(400).json({ code: -1, msg: '参数不完整' });
    }

    if (!['phrase', 'horse'].includes(drawType)) {
      return res.status(400).json({ code: -1, msg: '无效的抽取类型' });
    }

    const db = getDb();

    // 检查用户是否存在（兼容有无 user_id 列的情况）
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      // 尝试通过 openid 查找
      user = db.prepare('SELECT * FROM users WHERE openid = ?').get(userId);
    }
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }
    const realUserId = user.id;

    // 获取今日该场景该类型的抽取记录
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = db.prepare(`
      SELECT * FROM user_draw_records
      WHERE user_id = ? AND scene_id = ? AND draw_type = ?
      AND DATE(created_at) = ?
    `).all(realUserId, sceneId, drawType, today);

    // 检查是否有免费次数（每天每个场景每种类型1次免费）
    const freeUsed = todayRecords.some(r => r.is_free === 1);
    const isFree = !freeUsed;
    const costPerRoll = 10;

    // 如果不是免费，检查醒币余额
    if (!isFree) {
      if (user.points < costPerRoll) {
        return res.status(400).json({
          code: -2,
          msg: '醒币不足',
          data: { required: costPerRoll, current: user.points }
        });
      }
    }

    let result;

    if (drawType === 'phrase') {
      // 抽取吉祥成语
      const phrases = db.prepare(`
        SELECT * FROM random_phrase_pool
        WHERE scene_id = ? AND is_active = 1
      `).all(sceneId);

      if (phrases.length === 0) {
        return res.status(404).json({ code: -1, msg: '该场景没有配置词组池' });
      }

      // 根据权重随机抽取
      result = weightedRandom(phrases, 'weight');

    } else if (drawType === 'horse') {
      // 抽取马品级 - 优先从 draw_pool 表读取（后台管理使用此表）
      // 先尝试从 draw_pool 表获取坐骑数据（step_key 为 'horse' 或 'mount'）
      let items = db.prepare(`
        SELECT * FROM draw_pool
        WHERE scene_id = ? AND (step_key = 'horse' OR step_key = 'mount') AND is_active = 1
        ORDER BY weight DESC
      `).all(sceneId);

      if (items.length > 0) {
        // 使用 draw_pool 表的数据
        result = weightedRandom(items, 'weight');
        // 转换字段名以匹配前端期望的格式
        result = {
          id: result.id,
          grade_key: result.rarity || 'common',
          name: result.name,
          name_en: result.name_en,
          description: result.description || '',
          image: result.image,
          probability: result.weight / 100,
          prompt_text: result.prompt_text
        };
      } else {
        // 回退到 horse_grades 表
        const grades = db.prepare(`
          SELECT * FROM horse_grades
          WHERE scene_id = ? AND is_active = 1
          ORDER BY sort_order
        `).all(sceneId);

        if (grades.length === 0) {
          return res.status(404).json({ code: -1, msg: '该场景没有配置马品级' });
        }

        // 根据概率随机抽取
        result = probabilityRandom(grades, 'probability');
      }
    }

    // 扣除醒币（如果不是免费）
    if (!isFree) {
      const newBalance = user.points - costPerRoll;
      db.prepare('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newBalance, realUserId);

      // 记录积分变动
      const { v4: uuidv4 } = require('uuid');
      db.prepare(`
        INSERT INTO points_records (id, user_id, type, amount, balance_after, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(uuidv4(), realUserId, 'consume', -costPerRoll, newBalance, `摇骰子-${drawType === 'phrase' ? '抽成语' : '抽马'}`);
    }

    // 记录抽奖结果
    db.prepare(`
      INSERT INTO user_draw_records (user_id, scene_id, draw_type, result_id, result_value, points_cost, is_free, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      realUserId,
      sceneId,
      drawType,
      result.id,
      drawType === 'phrase' ? result.phrase : result.grade_key,
      isFree ? 0 : costPerRoll,
      isFree ? 1 : 0
    );

    // 返回结果
    res.json({
      code: 0,
      msg: 'success',
      data: {
        result: drawType === 'phrase' ? {
          id: result.id,
          phrase: result.phrase,
          phrase_en: result.phrase_en,
          rarity: result.rarity,
          rarity_name: RARITY_NAME_MAP[result.rarity] || result.rarity || '普通',
          prompt_text: result.prompt_text
        } : {
          id: result.id,
          grade_key: result.grade_key,
          name: result.name,
          name_en: result.name_en,
          description: result.description,
          image: result.image,
          probability: result.probability,
          prompt_text: result.prompt_text
        },
        isFree,
        pointsCost: isFree ? 0 : costPerRoll,
        newBalance: isFree ? user.points : user.points - costPerRoll
      }
    });

  } catch (error) {
    console.error('[Draw] Roll error:', error);
    res.status(500).json({ code: -1, msg: '服务器错误', error: error.message });
  }
});

/**
 * GET /api/draw/free-count/:userId/:sceneId/:drawType - 获取剩余免费次数
 */
router.get('/free-count/:userId/:sceneId/:drawType', (req, res) => {
  try {
    const { userId, sceneId, drawType } = req.params;

    const db = getDb();

    // 获取真实用户ID（兼容有无 user_id 列的情况）
    let user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      user = db.prepare('SELECT id FROM users WHERE openid = ?').get(userId);
    }
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const today = new Date().toISOString().split('T')[0];

    // 检查今日是否已使用免费次数
    const freeRecord = db.prepare(`
      SELECT * FROM user_draw_records
      WHERE user_id = ? AND scene_id = ? AND draw_type = ?
      AND DATE(created_at) = ? AND is_free = 1
    `).get(user.id, sceneId, drawType, today);

    res.json({
      code: 0,
      data: {
        freeCount: freeRecord ? 0 : 1,
        costPerRoll: 10
      }
    });

  } catch (error) {
    console.error('[Draw] Get free count error:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

/**
 * GET /api/draw/records/:userId - 获取用户抽奖记录
 */
router.get('/records/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { sceneId, drawType, limit = 20, offset = 0 } = req.query;

    const db = getDb();

    // 获取真实用户ID（兼容有无 user_id 列的情况）
    let user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      user = db.prepare('SELECT id FROM users WHERE openid = ?').get(userId);
    }
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    let sql = `
      SELECT * FROM user_draw_records
      WHERE user_id = ?
    `;
    const params = [user.id];

    if (sceneId) {
      sql += ' AND scene_id = ?';
      params.push(sceneId);
    }

    if (drawType) {
      sql += ' AND draw_type = ?';
      params.push(drawType);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const records = db.prepare(sql).all(...params);

    res.json({
      code: 0,
      data: records
    });

  } catch (error) {
    console.error('[Draw] Get records error:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

/**
 * 根据权重随机抽取
 * @param {Array} items - 待抽取的项目数组
 * @param {string} weightField - 权重字段名
 * @returns {Object} 抽中的项目
 */
function weightedRandom(items, weightField) {
  const totalWeight = items.reduce((sum, item) => sum + (item[weightField] || 100), 0);
  let random = Math.random() * totalWeight;

  for (const item of items) {
    random -= item[weightField] || 100;
    if (random <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
}

/**
 * 根据概率随机抽取
 * @param {Array} items - 待抽取的项目数组
 * @param {string} probabilityField - 概率字段名 (0-1)
 * @returns {Object} 抽中的项目
 */
function probabilityRandom(items, probabilityField) {
  const random = Math.random();
  let cumulative = 0;

  for (const item of items) {
    cumulative += item[probabilityField] || 0;
    if (random <= cumulative) {
      return item;
    }
  }

  return items[items.length - 1];
}

module.exports = router;
