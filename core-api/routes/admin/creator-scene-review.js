/**
 * 创作者场景审核 API
 * 后台管理员审核创作者提交的场景
 */

const express = require('express');
const router = express.Router();
const db = require('../../config/database');

// 获取待审核场景列表
router.get('/pending', (req, res) => {
  try {
    const { page = 1, pageSize = 20, status = 'pending' } = req.query;

    let sql = `
      SELECT s.*,
        u.nickname as creator_nickname,
        u.avatar_url as creator_avatar,
        c.pen_name as creator_pen_name,
        (SELECT COUNT(*) FROM scene_steps WHERE scene_id = s.id) as step_count,
        (SELECT COUNT(*) FROM prompt_templates WHERE scene_id = s.id) as prompt_count
      FROM scenes s
      LEFT JOIN users u ON s.creator_id = u.id
      LEFT JOIN creators c ON s.creator_id = c.user_id
      WHERE s.source = 'creator'
    `;
    const params = [];

    if (status && status !== 'all') {
      sql += ' AND s.review_status = ?';
      params.push(status);
    }

    sql += ' ORDER BY s.submitted_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));

    const scenes = db.prepare(sql).all(...params);

    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM scenes WHERE source = ?';
    const countParams = ['creator'];
    if (status && status !== 'all') {
      countSql += ' AND review_status = ?';
      countParams.push(status);
    }
    const { total } = db.prepare(countSql).get(...countParams);

    res.json({
      code: 0,
      data: {
        list: scenes,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取待审核场景列表失败:', error);
    res.status(500).json({ code: 500, message: '获取列表失败' });
  }
});

// 获取场景详情（审核用）
router.get('/:id', (req, res) => {
  try {
    const sceneId = req.params.id;

    const scene = db.prepare(`
      SELECT s.*,
        u.nickname as creator_nickname,
        u.avatar_url as creator_avatar,
        c.pen_name as creator_pen_name
      FROM scenes s
      LEFT JOIN users u ON s.creator_id = u.id
      LEFT JOIN creators c ON s.creator_id = c.user_id
      WHERE s.id = ?
    `).get(sceneId);

    if (!scene) {
      return res.status(404).json({ code: 404, message: '场景不存在' });
    }

    // 获取步骤
    const steps = db.prepare(`
      SELECT * FROM scene_steps WHERE scene_id = ? ORDER BY step_order ASC
    `).all(sceneId);

    // 获取每个步骤的选项
    for (const step of steps) {
      step.options = db.prepare(`
        SELECT * FROM step_options WHERE step_id = ? ORDER BY sort_order ASC
      `).all(step.id);
    }

    // 获取 Prompt 模板
    const prompts = db.prepare(`
      SELECT * FROM prompt_templates WHERE scene_id = ?
    `).all(sceneId);

    // 获取审核历史
    const reviews = db.prepare(`
      SELECT * FROM scene_reviews WHERE scene_id = ? ORDER BY created_at DESC
    `).all(sceneId);

    res.json({
      code: 0,
      data: {
        ...scene,
        steps,
        prompts,
        reviews
      }
    });
  } catch (error) {
    console.error('获取场景详情失败:', error);
    res.status(500).json({ code: 500, message: '获取场景详情失败' });
  }
});

// 审核通过
router.post('/:id/approve', (req, res) => {
  try {
    const sceneId = req.params.id;
    const adminId = req.admin?.id || 'system';

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId);

    if (!scene) {
      return res.status(404).json({ code: 404, message: '场景不存在' });
    }

    if (scene.review_status !== 'pending') {
      return res.status(400).json({ code: 400, message: '该场景不在待审核状态' });
    }

    const transaction = db.transaction(() => {
      // 更新场景状态
      db.prepare(`
        UPDATE scenes
        SET review_status = 'approved', status = 'active', approved_at = datetime('now')
        WHERE id = ?
      `).run(sceneId);

      // 记录审核日志
      db.prepare(`
        INSERT INTO scene_reviews (scene_id, action, admin_id, created_at)
        VALUES (?, 'approve', ?, datetime('now'))
      `).run(sceneId, adminId);
    });

    transaction();

    res.json({
      code: 0,
      message: '审核通过'
    });
  } catch (error) {
    console.error('审核通过失败:', error);
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

// 审核拒绝
router.post('/:id/reject', (req, res) => {
  try {
    const sceneId = req.params.id;
    const { reason } = req.body;
    const adminId = req.admin?.id || 'system';

    if (!reason) {
      return res.status(400).json({ code: 400, message: '请填写拒绝原因' });
    }

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId);

    if (!scene) {
      return res.status(404).json({ code: 404, message: '场景不存在' });
    }

    if (scene.review_status !== 'pending') {
      return res.status(400).json({ code: 400, message: '该场景不在待审核状态' });
    }

    const transaction = db.transaction(() => {
      // 更新场景状态
      db.prepare(`
        UPDATE scenes
        SET review_status = 'rejected', reject_reason = ?
        WHERE id = ?
      `).run(reason, sceneId);

      // 记录审核日志
      db.prepare(`
        INSERT INTO scene_reviews (scene_id, action, admin_id, reason, created_at)
        VALUES (?, 'reject', ?, ?, datetime('now'))
      `).run(sceneId, adminId, reason);
    });

    transaction();

    res.json({
      code: 0,
      message: '已拒绝'
    });
  } catch (error) {
    console.error('审核拒绝失败:', error);
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

// 下架场景
router.post('/:id/offline', (req, res) => {
  try {
    const sceneId = req.params.id;
    const { reason } = req.body;
    const adminId = req.admin?.id || 'system';

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId);

    if (!scene) {
      return res.status(404).json({ code: 404, message: '场景不存在' });
    }

    const transaction = db.transaction(() => {
      // 更新场景状态
      db.prepare(`
        UPDATE scenes
        SET status = 'inactive', reject_reason = ?
        WHERE id = ?
      `).run(reason || '管理员下架', sceneId);

      // 记录审核日志
      db.prepare(`
        INSERT INTO scene_reviews (scene_id, action, admin_id, reason, created_at)
        VALUES (?, 'offline', ?, ?, datetime('now'))
      `).run(sceneId, adminId, reason || '管理员下架');
    });

    transaction();

    res.json({
      code: 0,
      message: '已下架'
    });
  } catch (error) {
    console.error('下架场景失败:', error);
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

// 获取审核统计
router.get('/stats/overview', (req, res) => {
  try {
    const stats = {
      pending: db.prepare("SELECT COUNT(*) as count FROM scenes WHERE source = 'creator' AND review_status = 'pending'").get().count,
      approved: db.prepare("SELECT COUNT(*) as count FROM scenes WHERE source = 'creator' AND review_status = 'approved'").get().count,
      rejected: db.prepare("SELECT COUNT(*) as count FROM scenes WHERE source = 'creator' AND review_status = 'rejected'").get().count,
      draft: db.prepare("SELECT COUNT(*) as count FROM scenes WHERE source = 'creator' AND review_status = 'draft'").get().count,
      total: db.prepare("SELECT COUNT(*) as count FROM scenes WHERE source = 'creator'").get().count
    };

    res.json({
      code: 0,
      data: stats
    });
  } catch (error) {
    console.error('获取审核统计失败:', error);
    res.status(500).json({ code: 500, message: '获取统计失败' });
  }
});

module.exports = router;
