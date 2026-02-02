/**
 * 创作者 API
 * 提供创作者信息管理、统计、收益等功能
 * 所有用户自动成为创作者，无需申请
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * 获取或创建创作者信息
 * 所有用户自动成为创作者
 */
async function getOrCreateCreator(userId) {
  const db = getDb();

  // 检查是否已有创作者记录
  let creator = db.prepare('SELECT * FROM creators WHERE user_id = ?').get(userId);

  if (!creator) {
    // 获取用户信息
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return null;
    }

    // 自动创建创作者记录
    const creatorId = uuidv4();
    db.prepare(`
      INSERT INTO creators (id, user_id, creator_name, creator_avatar, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(creatorId, userId, user.nickname || `创作者${userId.slice(-6)}`, user.avatar_url);

    // 更新用户表
    db.prepare('UPDATE users SET is_creator = 1, creator_id = ? WHERE id = ?').run(creatorId, userId);

    creator = db.prepare('SELECT * FROM creators WHERE id = ?').get(creatorId);
  }

  return creator;
}

// 获取当前用户的创作者信息（自动创建）
router.get('/profile', async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const creator = await getOrCreateCreator(user_id);

    if (!creator) {
      return res.status(404).json({ code: 404, msg: '用户不存在' });
    }

    // 获取等级信息
    const db = getDb();
    const levelInfo = db.prepare('SELECT * FROM creator_levels WHERE level = ?').get(creator.level);

    res.json({
      code: 200,
      data: {
        id: creator.id,
        user_id: creator.user_id,
        creator_name: creator.creator_name,
        creator_avatar: creator.creator_avatar,
        bio: creator.bio,
        level: creator.level,
        level_info: levelInfo,
        status: creator.status,
        total_templates: creator.total_templates,
        total_uses: creator.total_uses,
        total_likes: creator.total_likes,
        total_earnings: creator.total_earnings,
        balance: creator.balance,
        created_at: creator.created_at
      }
    });
  } catch (error) {
    console.error('[Creator] 获取创作者信息失败:', error);
    res.status(500).json({ code: 500, msg: '获取创作者信息失败' });
  }
});

// 更新创作者信息
router.put('/profile', async (req, res) => {
  try {
    const { user_id, creator_name, creator_avatar, bio } = req.body;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const creator = await getOrCreateCreator(user_id);

    if (!creator) {
      return res.status(404).json({ code: 404, msg: '用户不存在' });
    }

    const db = getDb();

    // 构建更新语句
    const updates = [];
    const params = [];

    if (creator_name !== undefined) {
      updates.push('creator_name = ?');
      params.push(creator_name);
    }
    if (creator_avatar !== undefined) {
      updates.push('creator_avatar = ?');
      params.push(creator_avatar);
    }
    if (bio !== undefined) {
      updates.push('bio = ?');
      params.push(bio);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(creator.id);

      db.prepare(`
        UPDATE creators SET ${updates.join(', ')} WHERE id = ?
      `).run(...params);
    }

    // 返回更新后的信息
    const updatedCreator = db.prepare('SELECT * FROM creators WHERE id = ?').get(creator.id);

    res.json({
      code: 200,
      msg: '更新成功',
      data: updatedCreator
    });
  } catch (error) {
    console.error('[Creator] 更新创作者信息失败:', error);
    res.status(500).json({ code: 500, msg: '更新创作者信息失败' });
  }
});

// 获取创作者统计数据
router.get('/stats', async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const creator = await getOrCreateCreator(user_id);

    if (!creator) {
      return res.status(404).json({ code: 404, msg: '用户不存在' });
    }

    const db = getDb();

    // 获取模板统计
    const templateStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM user_templates
      WHERE creator_id = ?
    `).get(creator.id);

    // 获取今日数据
    const today = new Date().toISOString().split('T')[0];
    const todayStats = db.prepare(`
      SELECT
        COUNT(*) as uses,
        SUM(creator_earning) as earnings
      FROM template_usage_records
      WHERE creator_id = ? AND DATE(created_at) = ?
    `).get(creator.id, today);

    // 获取本周数据
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const weekStats = db.prepare(`
      SELECT
        COUNT(*) as uses,
        SUM(creator_earning) as earnings
      FROM template_usage_records
      WHERE creator_id = ? AND DATE(created_at) >= ?
    `).get(creator.id, weekAgo);

    // 获取本月数据
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const monthStats = db.prepare(`
      SELECT
        COUNT(*) as uses,
        SUM(creator_earning) as earnings
      FROM template_usage_records
      WHERE creator_id = ? AND DATE(created_at) >= ?
    `).get(creator.id, monthStart);

    // 获取最近7天趋势
    const trendData = db.prepare(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as uses,
        SUM(creator_earning) as earnings
      FROM template_usage_records
      WHERE creator_id = ? AND DATE(created_at) >= ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all(creator.id, weekAgo);

    res.json({
      code: 200,
      data: {
        overview: {
          total_templates: creator.total_templates,
          total_uses: creator.total_uses,
          total_likes: creator.total_likes,
          total_earnings: creator.total_earnings,
          balance: creator.balance
        },
        templates: templateStats,
        today: {
          uses: todayStats.uses || 0,
          earnings: todayStats.earnings || 0
        },
        week: {
          uses: weekStats.uses || 0,
          earnings: weekStats.earnings || 0
        },
        month: {
          uses: monthStats.uses || 0,
          earnings: monthStats.earnings || 0
        },
        trend: trendData
      }
    });
  } catch (error) {
    console.error('[Creator] 获取统计数据失败:', error);
    res.status(500).json({ code: 500, msg: '获取统计数据失败' });
  }
});

// 获取收益记录
router.get('/earnings', async (req, res) => {
  try {
    const { user_id, page = 1, pageSize = 20 } = req.query;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const creator = await getOrCreateCreator(user_id);

    if (!creator) {
      return res.status(404).json({ code: 404, msg: '用户不存在' });
    }

    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 查询总数
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM creator_earnings WHERE creator_id = ?
    `).get(creator.id);

    // 查询列表
    const earnings = db.prepare(`
      SELECT
        e.*,
        t.name as template_name,
        t.cover_image as template_cover
      FROM creator_earnings e
      LEFT JOIN user_templates t ON e.template_id = t.id
      WHERE e.creator_id = ?
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `).all(creator.id, limit, offset);

    res.json({
      code: 200,
      data: {
        list: earnings,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Creator] 获取收益记录失败:', error);
    res.status(500).json({ code: 500, msg: '获取收益记录失败' });
  }
});

// 获取创作者的模板列表
router.get('/templates', async (req, res) => {
  try {
    const { user_id, status, page = 1, pageSize = 20 } = req.query;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const creator = await getOrCreateCreator(user_id);

    if (!creator) {
      return res.status(404).json({ code: 404, msg: '用户不存在' });
    }

    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 构建查询条件
    let whereClause = 'WHERE creator_id = ?';
    const params = [creator.id];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    // 查询总数
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM user_templates ${whereClause}
    `).get(...params);

    // 查询列表
    const templates = db.prepare(`
      SELECT * FROM user_templates
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      code: 200,
      data: {
        list: templates.map(t => ({
          ...t,
          tags: t.tags ? t.tags.split(',') : [],
          is_featured: t.is_featured === 1,
          is_official: t.is_official === 1
        })),
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Creator] 获取模板列表失败:', error);
    res.status(500).json({ code: 500, msg: '获取模板列表失败' });
  }
});

// 获取等级信息
router.get('/level', async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const creator = await getOrCreateCreator(user_id);

    if (!creator) {
      return res.status(404).json({ code: 404, msg: '用户不存在' });
    }

    const db = getDb();

    // 获取所有等级配置
    const allLevels = db.prepare('SELECT * FROM creator_levels ORDER BY level ASC').all();

    // 获取当前等级
    const currentLevel = allLevels.find(l => l.level === creator.level);

    // 获取下一等级
    const nextLevel = allLevels.find(l => l.level === creator.level + 1);

    // 计算升级进度
    let progress = null;
    if (nextLevel) {
      progress = {
        templates: {
          current: creator.total_templates,
          required: nextLevel.min_templates,
          percentage: Math.min(100, Math.round((creator.total_templates / nextLevel.min_templates) * 100))
        },
        uses: {
          current: creator.total_uses,
          required: nextLevel.min_uses,
          percentage: Math.min(100, Math.round((creator.total_uses / nextLevel.min_uses) * 100))
        },
        likes: {
          current: creator.total_likes,
          required: nextLevel.min_likes,
          percentage: Math.min(100, Math.round((creator.total_likes / nextLevel.min_likes) * 100))
        }
      };
    }

    res.json({
      code: 200,
      data: {
        current_level: currentLevel,
        next_level: nextLevel,
        progress,
        all_levels: allLevels
      }
    });
  } catch (error) {
    console.error('[Creator] 获取等级信息失败:', error);
    res.status(500).json({ code: 500, msg: '获取等级信息失败' });
  }
});

// 查看其他创作者主页
router.get('/:creatorId', (req, res) => {
  try {
    const db = getDb();
    const { creatorId } = req.params;

    const creator = db.prepare(`
      SELECT
        id, creator_name, creator_avatar, bio, level, status,
        total_templates, total_uses, total_likes, created_at
      FROM creators
      WHERE id = ? AND status = 'active'
    `).get(creatorId);

    if (!creator) {
      return res.status(404).json({ code: 404, msg: '创作者不存在' });
    }

    // 获取等级信息
    const levelInfo = db.prepare('SELECT * FROM creator_levels WHERE level = ?').get(creator.level);

    // 获取该创作者的已上架模板
    const templates = db.prepare(`
      SELECT
        id, name, name_en, description, cover_image,
        category_id, tags, gender, points_cost,
        is_featured, is_official,
        view_count, use_count, like_count, favorite_count,
        published_at
      FROM user_templates
      WHERE creator_id = ? AND status = 'active'
      ORDER BY use_count DESC
      LIMIT 20
    `).all(creatorId);

    res.json({
      code: 200,
      data: {
        creator: {
          ...creator,
          level_info: levelInfo
        },
        templates: templates.map(t => ({
          ...t,
          tags: t.tags ? t.tags.split(',') : [],
          is_featured: t.is_featured === 1,
          is_official: t.is_official === 1
        }))
      }
    });
  } catch (error) {
    console.error('[Creator] 获取创作者主页失败:', error);
    res.status(500).json({ code: 500, msg: '获取创作者主页失败' });
  }
});

module.exports = router;
