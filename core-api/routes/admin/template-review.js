/**
 * 后台模板审核 API
 * 提供模板审核、管理功能
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../../config/database');

// 获取待审核模板列表
router.get('/pending', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 查询总数
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM user_templates WHERE status = 'pending'
    `).get();

    // 查询列表
    const templates = db.prepare(`
      SELECT
        t.*,
        c.creator_name, c.creator_avatar, c.user_id as creator_user_id
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.status = 'pending'
      ORDER BY t.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.json({
      code: 200,
      data: {
        list: templates.map(t => ({
          ...t,
          tags: t.tags ? t.tags.split(',') : []
        })),
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('[Admin] 获取待审核模板失败:', error);
    res.status(500).json({ code: 500, msg: '获取待审核模板失败' });
  }
});

// 获取所有模板列表（支持筛选）
router.get('/list', (req, res) => {
  try {
    const db = getDb();
    const { status, keyword, creator_id, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }

    if (keyword) {
      whereClause += ' AND (t.name LIKE ? OR t.description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    if (creator_id) {
      whereClause += ' AND t.creator_id = ?';
      params.push(creator_id);
    }

    // 查询总数
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM user_templates t ${whereClause}
    `).get(...params);

    // 查询列表
    const templates = db.prepare(`
      SELECT
        t.*,
        c.creator_name, c.creator_avatar, c.user_id as creator_user_id
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      ${whereClause}
      ORDER BY t.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      code: 200,
      data: {
        list: templates.map(t => ({
          ...t,
          tags: t.tags ? t.tags.split(',') : []
        })),
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('[Admin] 获取模板列表失败:', error);
    res.status(500).json({ code: 500, msg: '获取模板列表失败' });
  }
});

// 获取模板详情
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const template = db.prepare(`
      SELECT
        t.*,
        c.creator_name, c.creator_avatar, c.user_id as creator_user_id, c.level as creator_level
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    // 获取步骤配置
    const steps = db.prepare(`
      SELECT * FROM template_steps WHERE template_id = ? ORDER BY step_order ASC
    `).all(id);

    for (const step of steps) {
      step.options = db.prepare(`
        SELECT * FROM template_step_options WHERE step_id = ? ORDER BY sort_order ASC
      `).all(step.id);
    }

    // 获取 Prompt 配置
    const prompt = db.prepare(`
      SELECT * FROM template_prompts WHERE template_id = ? LIMIT 1
    `).get(id);

    // 获取审核记录
    const reviews = db.prepare(`
      SELECT * FROM template_reviews WHERE template_id = ? ORDER BY created_at DESC
    `).all(id);

    res.json({
      code: 200,
      data: {
        ...template,
        tags: template.tags ? template.tags.split(',') : [],
        steps,
        prompt,
        reviews
      }
    });
  } catch (error) {
    console.error('[Admin] 获取模板详情失败:', error);
    res.status(500).json({ code: 500, msg: '获取模板详情失败' });
  }
});

// 审核通过
router.post('/:id/approve', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { admin_id, comment } = req.body;

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    if (template.status !== 'pending') {
      return res.status(400).json({ code: 400, msg: '模板状态不正确' });
    }

    // 更新模板状态
    db.prepare(`
      UPDATE user_templates
      SET status = 'active', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    // 更新创作者统计
    db.prepare(`
      UPDATE creators SET total_templates = total_templates + 1 WHERE id = ?
    `).run(template.creator_id);

    // 更新分类统计
    if (template.category_id) {
      db.prepare(`
        UPDATE template_categories SET template_count = template_count + 1 WHERE id = ?
      `).run(template.category_id);
    }

    // 记录审核日志
    db.prepare(`
      INSERT INTO template_reviews (template_id, action, admin_id, reason)
      VALUES (?, 'approve', ?, ?)
    `).run(id, admin_id || null, comment || '审核通过');

    res.json({ code: 200, msg: '审核通过' });
  } catch (error) {
    console.error('[Admin] 审核通过失败:', error);
    res.status(500).json({ code: 500, msg: '操作失败' });
  }
});

// 审核拒绝
router.post('/:id/reject', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { admin_id, reason } = req.body;

    if (!reason) {
      return res.status(400).json({ code: 400, msg: '请填写拒绝原因' });
    }

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    if (template.status !== 'pending') {
      return res.status(400).json({ code: 400, msg: '模板状态不正确' });
    }

    // 更新模板状态
    db.prepare(`
      UPDATE user_templates
      SET status = 'rejected', reject_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason, id);

    // 记录审核日志
    db.prepare(`
      INSERT INTO template_reviews (template_id, action, admin_id, reason)
      VALUES (?, 'reject', ?, ?)
    `).run(id, admin_id || null, reason);

    res.json({ code: 200, msg: '已拒绝' });
  } catch (error) {
    console.error('[Admin] 审核拒绝失败:', error);
    res.status(500).json({ code: 500, msg: '操作失败' });
  }
});

// 强制下架
router.post('/:id/force-offline', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { admin_id, reason } = req.body;

    if (!reason) {
      return res.status(400).json({ code: 400, msg: '请填写下架原因' });
    }

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    if (template.status !== 'active') {
      return res.status(400).json({ code: 400, msg: '模板未上架' });
    }

    // 更新模板状态
    db.prepare(`
      UPDATE user_templates
      SET status = 'offline', reject_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason, id);

    // 更新创作者统计
    db.prepare(`
      UPDATE creators SET total_templates = total_templates - 1 WHERE id = ?
    `).run(template.creator_id);

    // 更新分类统计
    if (template.category_id) {
      db.prepare(`
        UPDATE template_categories SET template_count = template_count - 1 WHERE id = ?
      `).run(template.category_id);
    }

    // 记录审核日志
    db.prepare(`
      INSERT INTO template_reviews (template_id, action, admin_id, reason)
      VALUES (?, 'force_offline', ?, ?)
    `).run(id, admin_id || null, reason);

    res.json({ code: 200, msg: '已下架' });
  } catch (error) {
    console.error('[Admin] 强制下架失败:', error);
    res.status(500).json({ code: 500, msg: '操作失败' });
  }
});

// 设为精选
router.post('/:id/feature', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { is_featured } = req.body;

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    db.prepare(`
      UPDATE user_templates SET is_featured = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(is_featured ? 1 : 0, id);

    res.json({
      code: 200,
      msg: is_featured ? '已设为精选' : '已取消精选'
    });
  } catch (error) {
    console.error('[Admin] 设置精选失败:', error);
    res.status(500).json({ code: 500, msg: '操作失败' });
  }
});

// 获取审核统计
router.get('/stats/overview', (req, res) => {
  try {
    const db = getDb();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft
      FROM user_templates
    `).get();

    // 今日审核数
    const today = new Date().toISOString().split('T')[0];
    const todayStats = db.prepare(`
      SELECT
        COUNT(*) as reviewed
      FROM template_reviews
      WHERE DATE(created_at) = ? AND action IN ('approve', 'reject')
    `).get(today);

    res.json({
      code: 200,
      data: {
        ...stats,
        today_reviewed: todayStats.reviewed || 0
      }
    });
  } catch (error) {
    console.error('[Admin] 获取审核统计失败:', error);
    res.status(500).json({ code: 500, msg: '获取统计失败' });
  }
});

// 获取分类列表（用于筛选）
router.get('/categories/all', (req, res) => {
  try {
    const db = getDb();
    const categories = db.prepare(`
      SELECT * FROM template_categories ORDER BY sort_order ASC
    `).all();

    res.json({ code: 200, data: categories });
  } catch (error) {
    console.error('[Admin] 获取分类列表失败:', error);
    res.status(500).json({ code: 500, msg: '获取分类失败' });
  }
});

// 管理分类
router.post('/categories', (req, res) => {
  try {
    const db = getDb();
    const { name, name_en, icon, sort_order = 0 } = req.body;

    if (!name) {
      return res.status(400).json({ code: 400, msg: '分类名称不能为空' });
    }

    const result = db.prepare(`
      INSERT INTO template_categories (name, name_en, icon, sort_order)
      VALUES (?, ?, ?, ?)
    `).run(name, name_en || null, icon || null, sort_order);

    res.json({
      code: 200,
      msg: '创建成功',
      data: { id: result.lastInsertRowid }
    });
  } catch (error) {
    console.error('[Admin] 创建分类失败:', error);
    res.status(500).json({ code: 500, msg: '创建失败' });
  }
});

// 更新分类
router.put('/categories/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, name_en, icon, sort_order, is_visible } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (name_en !== undefined) { updates.push('name_en = ?'); params.push(name_en); }
    if (icon !== undefined) { updates.push('icon = ?'); params.push(icon); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
    if (is_visible !== undefined) { updates.push('is_visible = ?'); params.push(is_visible ? 1 : 0); }

    if (updates.length > 0) {
      params.push(id);
      db.prepare(`UPDATE template_categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ code: 200, msg: '更新成功' });
  } catch (error) {
    console.error('[Admin] 更新分类失败:', error);
    res.status(500).json({ code: 500, msg: '更新失败' });
  }
});

// 删除分类
router.delete('/categories/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    // 检查是否有模板使用此分类
    const { count } = db.prepare(`
      SELECT COUNT(*) as count FROM user_templates WHERE category_id = ?
    `).get(id);

    if (count > 0) {
      return res.status(400).json({ code: 400, msg: '该分类下有模板，无法删除' });
    }

    db.prepare('DELETE FROM template_categories WHERE id = ?').run(id);

    res.json({ code: 200, msg: '删除成功' });
  } catch (error) {
    console.error('[Admin] 删除分类失败:', error);
    res.status(500).json({ code: 500, msg: '删除失败' });
  }
});

module.exports = router;
