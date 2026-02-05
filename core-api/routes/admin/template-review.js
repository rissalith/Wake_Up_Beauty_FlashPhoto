/**
 * 后台模板审核 API
 * 提供模板审核、管理功能
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../../config/database');
const { reviewTemplate, generateReviewReport, REVIEW_STATUS } = require('../../lib/ai-review');

// ==================== 静态路由（必须在 /:id 之前定义）====================

// 获取分类列表
router.get('/categories', (req, res) => {
  try {
    const db = getDb();
    const categories = db.prepare(`
      SELECT * FROM template_categories ORDER BY sort_order ASC, id ASC
    `).all();

    res.json({ code: 200, data: categories });
  } catch (error) {
    console.error('[Admin] 获取分类失败:', error);
    res.status(500).json({ code: 500, msg: '获取分类失败' });
  }
});

// 获取所有模板（清单区域，支持多状态筛选）
router.get('/all', (req, res) => {
  try {
    const db = getDb();
    const { status, category_id, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 构建查询条件
    let whereClause = "WHERE t.status NOT IN ('reviewing', 'pending')";
    const params = [];

    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }

    if (category_id) {
      whereClause += ' AND t.category_id = ?';
      params.push(category_id);
    }

    if (keyword) {
      whereClause += ' AND (t.name LIKE ? OR t.description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    // 查询总数
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM user_templates t ${whereClause}
    `).get(...params);

    // 查询列表
    const templates = db.prepare(`
      SELECT
        t.*,
        c.creator_name, c.creator_avatar, c.user_id as creator_user_id,
        tc.name as category_name
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      LEFT JOIN template_categories tc ON t.category_id = tc.id
      ${whereClause}
      ORDER BY t.is_official DESC, t.is_featured DESC, t.updated_at DESC
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
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('[Admin] 获取模板清单失败:', error);
    res.status(500).json({ code: 500, msg: '获取模板清单失败' });
  }
});

// ==================== 动态路由 ====================

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

// 获取所有模板列表（支持筛选，用于审核区域）
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
      // 支持多状态筛选，用逗号分隔
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        whereClause += ` AND t.status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
      }
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
        c.creator_name, c.creator_avatar, c.user_id as creator_user_id,
        tc.name as category_name
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      LEFT JOIN template_categories tc ON t.category_id = tc.id
      ${whereClause}
      ORDER BY t.updated_at DESC
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

    // 支持 pending 和 reviewing 状态
    if (!['pending', 'reviewing'].includes(template.status)) {
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
    `).run(id, admin_id || null, comment || '人工审核通过');

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

    // 支持 pending 和 reviewing 状态
    if (!['pending', 'reviewing'].includes(template.status)) {
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

// 重新 AI 审核
router.post('/:id/retry-ai-review', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { admin_id } = req.body;

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    // 只允许 pending 和 reviewing 状态重新审核
    if (!['pending', 'reviewing'].includes(template.status)) {
      return res.status(400).json({ code: 400, msg: '当前状态不支持重新审核' });
    }

    // 获取步骤和 Prompt 配置
    const steps = db.prepare('SELECT * FROM template_steps WHERE template_id = ? ORDER BY step_order').all(id);
    const prompts = db.prepare('SELECT * FROM template_prompts WHERE template_id = ?').all(id);

    if (!steps || steps.length === 0) {
      return res.status(400).json({ code: 400, msg: '模板缺少步骤配置' });
    }

    if (!prompts || prompts.length === 0) {
      return res.status(400).json({ code: 400, msg: '模板缺少 Prompt 配置' });
    }

    // 更新状态为审核中
    db.prepare(`
      UPDATE user_templates SET status = 'reviewing', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    // 记录审核日志
    db.prepare(`
      INSERT INTO template_reviews (template_id, action, admin_id, reason)
      VALUES (?, 'retry_ai_review', ?, '管理员触发重新 AI 审核')
    `).run(id, admin_id || null);

    // 异步执行 AI 审核
    performAIReview(id, template, steps, prompts).catch(err => {
      console.error('[Admin] 重新 AI 审核异常:', err);
    });

    res.json({ code: 200, msg: '已触发重新 AI 审核' });
  } catch (error) {
    console.error('[Admin] 重新 AI 审核失败:', error);
    res.status(500).json({ code: 500, msg: '操作失败' });
  }
});

/**
 * 执行 AI 审核（复用自 miniprogram/template.js）
 */
async function performAIReview(templateId, template, steps, prompts) {
  const db = getDb();

  try {
    console.log(`[AI审核] 开始审核模板: ${template.name} (${templateId})`);

    // 调用 AI 审核
    const reviewResult = await reviewTemplate(template, steps, prompts);
    const report = generateReviewReport(reviewResult);

    // 更新审核结果
    if (reviewResult.status === REVIEW_STATUS.APPROVED) {
      // 审核通过，直接上架
      db.prepare(`
        UPDATE user_templates
        SET status = 'active',
            review_score = ?,
            review_details = ?,
            reviewed_at = CURRENT_TIMESTAMP,
            published_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(reviewResult.score, JSON.stringify(reviewResult), templateId);

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
        INSERT INTO template_reviews (template_id, action, reason, reviewer_id)
        VALUES (?, 'approve', ?, 'AI')
      `).run(templateId, 'AI 自动审核通过');

      console.log(`[AI审核] 模板 ${templateId} 审核通过，已自动上架`);

    } else if (reviewResult.status === REVIEW_STATUS.REJECTED) {
      // 审核不通过
      const rejectReason = report.details.map(d => d.message).join('；');

      db.prepare(`
        UPDATE user_templates
        SET status = 'rejected',
            reject_reason = ?,
            review_score = ?,
            review_details = ?,
            reviewed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(rejectReason, reviewResult.score, JSON.stringify(reviewResult), templateId);

      // 记录审核日志
      db.prepare(`
        INSERT INTO template_reviews (template_id, action, reason, reviewer_id)
        VALUES (?, 'reject', ?, 'AI')
      `).run(templateId, rejectReason);

      console.log(`[AI审核] 模板 ${templateId} 审核不通过: ${rejectReason}`);

    } else {
      // 审核出错，回退到待审核状态
      db.prepare(`
        UPDATE user_templates
        SET status = 'pending',
            review_details = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(reviewResult), templateId);

      console.log(`[AI审核] 模板 ${templateId} 审核出错，等待人工处理`);
    }

  } catch (error) {
    console.error(`[AI审核] 模板 ${templateId} 审核异常:`, error);

    // 审核异常，回退到待审核状态
    db.prepare(`
      UPDATE user_templates
      SET status = 'pending',
          review_details = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify({ error: error.message }), templateId);
  }
}

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

// 批量更新分类排序（拖拽排序）- 必须在 /categories/:id 之前
router.post('/categories/reorder', (req, res) => {
  try {
    const db = getDb();
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      return res.status(400).json({ code: 400, msg: '参数格式错误' });
    }

    const stmt = db.prepare('UPDATE template_categories SET sort_order = ? WHERE id = ?');
    for (const item of orders) {
      stmt.run(item.sort_order, item.id);
    }

    res.json({ code: 200, msg: '排序更新成功' });
  } catch (error) {
    console.error('[Admin] 批量更新排序失败:', error);
    res.status(500).json({ code: 500, msg: '更新排序失败' });
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

// ==================== 官方模板管理 ====================

const OFFICIAL_CREATOR_ID = 'official_creator';

// 确保官方创作者存在
function ensureOfficialCreator(db) {
  let creator = db.prepare('SELECT * FROM creators WHERE id = ?').get(OFFICIAL_CREATOR_ID);
  if (!creator) {
    // 确保系统用户存在
    let systemUser = db.prepare("SELECT * FROM users WHERE id = 'system'").get();
    if (!systemUser) {
      db.prepare(`
        INSERT INTO users (id, openid, nickname, avatar_url, points, status, created_at)
        VALUES ('system', 'system', '醒美官方', 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com/logo/logo-main.jpg', 0, 'active', datetime('now'))
      `).run();
    }
    // 创建官方创作者
    db.prepare(`
      INSERT INTO creators (id, user_id, creator_name, creator_avatar, bio, level, status, created_at)
      VALUES (?, 'system', '醒美官方', 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com/logo/logo-main.jpg', '醒美闪图官方出品', 5, 'active', datetime('now'))
    `).run(OFFICIAL_CREATOR_ID);
  }
  return OFFICIAL_CREATOR_ID;
}

// 获取官方模板列表
router.get('/official/list', (req, res) => {
  try {
    const db = getDb();
    const { status, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    let whereClause = 'WHERE t.is_official = 1';
    const params = [];

    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }

    if (keyword) {
      whereClause += ' AND (t.name LIKE ? OR t.description LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM user_templates t ${whereClause}
    `).get(...params);

    const templates = db.prepare(`
      SELECT
        t.*,
        tc.name as category_name
      FROM user_templates t
      LEFT JOIN template_categories tc ON t.category_id = tc.id
      ${whereClause}
      ORDER BY CASE WHEN t.status = 'active' THEN 0 ELSE 1 END, t.updated_at DESC
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
    console.error('[Admin] 获取官方模板列表失败:', error);
    res.status(500).json({ code: 500, msg: '获取官方模板列表失败' });
  }
});

// 创建官方模板（跳过审核，直接上架）
router.post('/official', (req, res) => {
  try {
    const db = getDb();
    const {
      name, name_en, description, description_en,
      cover_image, reference_image, category_id, tags,
      gender = 'all', points_cost = 50, is_featured = 0,
      source_scene_id
    } = req.body;

    if (!name) {
      return res.status(400).json({ code: 400, msg: '模板名称不能为空' });
    }

    if (!cover_image) {
      return res.status(400).json({ code: 400, msg: '封面图不能为空' });
    }

    // 确保官方创作者存在
    const creatorId = ensureOfficialCreator(db);

    // 生成模板ID
    const templateId = source_scene_id ? `official_${source_scene_id}` : `official_${Date.now()}`;

    // 检查是否已存在
    const existing = db.prepare('SELECT id FROM user_templates WHERE id = ?').get(templateId);
    if (existing) {
      return res.status(400).json({ code: 400, msg: '模板ID已存在' });
    }

    // 创建模板（直接上架）
    db.prepare(`
      INSERT INTO user_templates (
        id, creator_id, name, name_en, description, description_en,
        cover_image, reference_image, category_id, tags, gender,
        points_cost, status, is_featured, is_official, source_scene_id,
        published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 1, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(
      templateId, creatorId, name, name_en || '', description || '', description_en || '',
      cover_image, reference_image || cover_image, category_id || null,
      Array.isArray(tags) ? tags.join(',') : (tags || ''),
      gender, points_cost, is_featured ? 1 : 0, source_scene_id || null
    );

    // 更新分类统计
    if (category_id) {
      db.prepare(`
        UPDATE template_categories SET template_count = template_count + 1 WHERE id = ?
      `).run(category_id);
    }

    res.json({
      code: 200,
      msg: '创建成功',
      data: { id: templateId }
    });
  } catch (error) {
    console.error('[Admin] 创建官方模板失败:', error);
    res.status(500).json({ code: 500, msg: '创建失败' });
  }
});

// 更新官方模板
router.put('/official/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      name, name_en, description, description_en,
      cover_image, reference_image, category_id, tags,
      gender, points_cost, is_featured, status
    } = req.body;

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ? AND is_official = 1').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '官方模板不存在' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (name_en !== undefined) { updates.push('name_en = ?'); params.push(name_en); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (description_en !== undefined) { updates.push('description_en = ?'); params.push(description_en); }
    if (cover_image !== undefined) { updates.push('cover_image = ?'); params.push(cover_image); }
    if (reference_image !== undefined) { updates.push('reference_image = ?'); params.push(reference_image); }
    if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id); }
    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(Array.isArray(tags) ? tags.join(',') : tags);
    }
    if (gender !== undefined) { updates.push('gender = ?'); params.push(gender); }
    if (points_cost !== undefined) { updates.push('points_cost = ?'); params.push(points_cost); }
    if (is_featured !== undefined) { updates.push('is_featured = ?'); params.push(is_featured ? 1 : 0); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }

    if (updates.length > 0) {
      updates.push('updated_at = datetime(\'now\')');
      params.push(id);
      db.prepare(`UPDATE user_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    // 处理分类变更的统计
    if (category_id !== undefined && category_id !== template.category_id) {
      if (template.category_id && template.status === 'active') {
        db.prepare('UPDATE template_categories SET template_count = template_count - 1 WHERE id = ?').run(template.category_id);
      }
      if (category_id && (status === 'active' || (!status && template.status === 'active'))) {
        db.prepare('UPDATE template_categories SET template_count = template_count + 1 WHERE id = ?').run(category_id);
      }
    }

    res.json({ code: 200, msg: '更新成功' });
  } catch (error) {
    console.error('[Admin] 更新官方模板失败:', error);
    res.status(500).json({ code: 500, msg: '更新失败' });
  }
});

// 配置官方模板步骤
router.post('/official/:id/steps', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { steps } = req.body;

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ? AND is_official = 1').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '官方模板不存在' });
    }

    // 删除现有步骤和选项
    const existingSteps = db.prepare('SELECT id FROM template_steps WHERE template_id = ?').all(id);
    for (const step of existingSteps) {
      db.prepare('DELETE FROM template_step_options WHERE step_id = ?').run(step.id);
    }
    db.prepare('DELETE FROM template_steps WHERE template_id = ?').run(id);

    // 插入新步骤
    if (steps && steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepResult = db.prepare(`
          INSERT INTO template_steps (
            template_id, step_order, step_key, title, title_en, subtitle,
            component_type, is_required, is_visible, config
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, i + 1, step.step_key || `step_${i + 1}`,
          step.title || '', step.title_en || '', step.subtitle || '',
          step.component_type || 'select',
          step.is_required !== false ? 1 : 0,
          step.is_visible !== false ? 1 : 0,
          step.config ? JSON.stringify(step.config) : ''
        );

        const stepId = stepResult.lastInsertRowid;

        // 插入选项
        if (step.options && step.options.length > 0) {
          for (let j = 0; j < step.options.length; j++) {
            const opt = step.options[j];
            db.prepare(`
              INSERT INTO template_step_options (
                step_id, option_key, label, label_en, icon, image,
                prompt_text, sort_order, is_default, is_visible
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              stepId, opt.option_key || `opt_${j + 1}`,
              opt.label || '', opt.label_en || '', opt.icon || '', opt.image || '',
              opt.prompt_text || '', j, opt.is_default ? 1 : 0, opt.is_visible !== false ? 1 : 0
            );
          }
        }
      }
    }

    res.json({ code: 200, msg: '步骤配置成功' });
  } catch (error) {
    console.error('[Admin] 配置官方模板步骤失败:', error);
    res.status(500).json({ code: 500, msg: '配置失败' });
  }
});

// 配置官方模板 Prompt
router.put('/official/:id/prompt', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, template: promptTemplate, negative_prompt, reference_weight, face_swap_mode } = req.body;

    const tpl = db.prepare('SELECT * FROM user_templates WHERE id = ? AND is_official = 1').get(id);
    if (!tpl) {
      return res.status(404).json({ code: 404, msg: '官方模板不存在' });
    }

    // 检查是否已有 Prompt
    const existingPrompt = db.prepare('SELECT * FROM template_prompts WHERE template_id = ?').get(id);

    if (existingPrompt) {
      // 更新
      db.prepare(`
        UPDATE template_prompts SET
          name = ?, template = ?, negative_prompt = ?,
          reference_weight = ?, face_swap_mode = ?, updated_at = datetime('now')
        WHERE template_id = ?
      `).run(
        name || existingPrompt.name,
        promptTemplate || existingPrompt.template,
        negative_prompt !== undefined ? negative_prompt : existingPrompt.negative_prompt,
        reference_weight !== undefined ? reference_weight : existingPrompt.reference_weight,
        face_swap_mode || existingPrompt.face_swap_mode,
        id
      );
    } else {
      // 创建
      db.prepare(`
        INSERT INTO template_prompts (
          template_id, name, template, negative_prompt, reference_weight, face_swap_mode, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(
        id, name || '默认', promptTemplate || '', negative_prompt || '',
        reference_weight || 0.8, face_swap_mode || 'replace'
      );
    }

    res.json({ code: 200, msg: 'Prompt 配置成功' });
  } catch (error) {
    console.error('[Admin] 配置官方模板 Prompt 失败:', error);
    res.status(500).json({ code: 500, msg: '配置失败' });
  }
});

// 删除官方模板
router.delete('/official/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ? AND is_official = 1').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '官方模板不存在' });
    }

    // 删除步骤选项
    const steps = db.prepare('SELECT id FROM template_steps WHERE template_id = ?').all(id);
    for (const step of steps) {
      db.prepare('DELETE FROM template_step_options WHERE step_id = ?').run(step.id);
    }

    // 删除步骤
    db.prepare('DELETE FROM template_steps WHERE template_id = ?').run(id);

    // 删除 Prompt
    db.prepare('DELETE FROM template_prompts WHERE template_id = ?').run(id);

    // 删除模板
    db.prepare('DELETE FROM user_templates WHERE id = ?').run(id);

    // 更新分类统计
    if (template.category_id && template.status === 'active') {
      db.prepare('UPDATE template_categories SET template_count = template_count - 1 WHERE id = ?').run(template.category_id);
    }

    res.json({ code: 200, msg: '删除成功' });
  } catch (error) {
    console.error('[Admin] 删除官方模板失败:', error);
    res.status(500).json({ code: 500, msg: '删除失败' });
  }
});

// 官方模板上架/下架
router.post('/official/:id/toggle-status', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'offline'].includes(status)) {
      return res.status(400).json({ code: 400, msg: '状态值无效' });
    }

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ? AND is_official = 1').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '官方模板不存在' });
    }

    const oldStatus = template.status;

    db.prepare(`
      UPDATE user_templates SET status = ?, updated_at = datetime('now')
      ${status === 'active' ? ", published_at = datetime('now')" : ''}
      WHERE id = ?
    `).run(status, id);

    // 更新分类统计
    if (template.category_id) {
      if (oldStatus === 'active' && status === 'offline') {
        db.prepare('UPDATE template_categories SET template_count = template_count - 1 WHERE id = ?').run(template.category_id);
      } else if (oldStatus !== 'active' && status === 'active') {
        db.prepare('UPDATE template_categories SET template_count = template_count + 1 WHERE id = ?').run(template.category_id);
      }
    }

    res.json({
      code: 200,
      msg: status === 'active' ? '已上架' : '已下架'
    });
  } catch (error) {
    console.error('[Admin] 切换官方模板状态失败:', error);
    res.status(500).json({ code: 500, msg: '操作失败' });
  }
});

// 从场景同步到官方模板
router.post('/official/sync-from-scene', (req, res) => {
  try {
    const db = getDb();
    const { scene_key } = req.body;

    if (!scene_key) {
      return res.status(400).json({ code: 400, msg: '场景标识不能为空' });
    }

    // 查找场景
    const scene = db.prepare('SELECT * FROM scenes WHERE scene_key = ?').get(scene_key);
    if (!scene) {
      return res.status(404).json({ code: 404, msg: '场景不存在' });
    }

    // 确保官方创作者存在
    const creatorId = ensureOfficialCreator(db);

    const templateId = `official_${scene_key}`;

    // 检查是否已存在
    const existing = db.prepare('SELECT id FROM user_templates WHERE id = ?').get(templateId);

    // 场景到分类的映射
    const SCENE_TO_CATEGORY = {
      'horse_year_avatar': 2,
      'idphoto': 4,
      'professional': 3,
      'portrait': 3,
      'family': 3,
      'pet': 5,
      'wedding': 3
    };
    const categoryId = SCENE_TO_CATEGORY[scene_key] || 1;

    const templateStatus = (scene.status === 'coming_soon' || scene.status === 'inactive') ? 'offline' : 'active';

    if (existing) {
      // 更新现有模板
      db.prepare(`
        UPDATE user_templates SET
          name = ?, name_en = ?, description = ?, description_en = ?,
          cover_image = ?, reference_image = ?, category_id = ?,
          points_cost = ?, status = ?, is_featured = ?, source_scene_id = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        scene.name || '', scene.name_en || '', scene.description || '', scene.description_en || '',
        scene.icon || '', scene.icon || '', categoryId,
        scene.points_cost || 50, templateStatus, scene.is_highlighted ? 1 : 0, scene_key,
        templateId
      );
    } else {
      // 创建新模板
      db.prepare(`
        INSERT INTO user_templates (
          id, creator_id, name, name_en, description, description_en,
          cover_image, reference_image, category_id, tags, gender,
          points_cost, status, is_featured, is_official, source_scene_id,
          published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'all', ?, ?, ?, 1, ?, datetime('now'), datetime('now'), datetime('now'))
      `).run(
        templateId, creatorId, scene.name || '', scene.name_en || '',
        scene.description || '', scene.description_en || '',
        scene.icon || '', scene.icon || '', categoryId, scene.name || '',
        scene.points_cost || 50, templateStatus, scene.is_highlighted ? 1 : 0, scene_key
      );
    }

    // 同步步骤
    // 先删除现有步骤
    const existingSteps = db.prepare('SELECT id FROM template_steps WHERE template_id = ?').all(templateId);
    for (const step of existingSteps) {
      db.prepare('DELETE FROM template_step_options WHERE step_id = ?').run(step.id);
    }
    db.prepare('DELETE FROM template_steps WHERE template_id = ?').run(templateId);

    // 复制场景步骤
    const sceneSteps = db.prepare('SELECT * FROM scene_steps WHERE scene_id = ? ORDER BY step_order').all(scene_key);
    for (const step of sceneSteps) {
      const stepResult = db.prepare(`
        INSERT INTO template_steps (
          template_id, step_order, step_key, title, title_en,
          component_type, is_required, is_visible, config
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        templateId, step.step_order || 0, step.step_key || '',
        step.title || step.step_name || '', step.title_en || step.step_name_en || '',
        step.component_type || 'select', step.is_required ? 1 : 0,
        step.is_visible !== 0 ? 1 : 0, step.config || ''
      );

      const newStepId = stepResult.lastInsertRowid;

      // 复制选项
      const options = db.prepare('SELECT * FROM step_options WHERE step_id = ? ORDER BY sort_order').all(step.id);
      for (const opt of options) {
        db.prepare(`
          INSERT INTO template_step_options (
            step_id, option_key, label, label_en, icon, image,
            prompt_text, sort_order, is_default, is_visible
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newStepId, opt.option_key || '', opt.label || opt.name || '',
          opt.label_en || opt.name_en || '', opt.icon || '', opt.image || '',
          opt.prompt_text || '', opt.sort_order || 0, opt.is_default ? 1 : 0,
          opt.is_visible !== 0 ? 1 : 0
        );
      }
    }

    // 同步 Prompt
    db.prepare('DELETE FROM template_prompts WHERE template_id = ?').run(templateId);
    const prompts = db.prepare('SELECT * FROM prompt_templates WHERE scene_id = ?').all(scene_key);
    for (const prompt of prompts) {
      db.prepare(`
        INSERT INTO template_prompts (
          template_id, name, template, negative_prompt, reference_weight, face_swap_mode, is_active
        ) VALUES (?, ?, ?, ?, 0.8, 'replace', 1)
      `).run(
        templateId, prompt.name || '', prompt.template || prompt.template_content || '',
        prompt.negative_prompt || ''
      );
    }

    // 更新分类统计
    db.prepare(`
      UPDATE template_categories SET template_count = (
        SELECT COUNT(*) FROM user_templates WHERE category_id = template_categories.id AND status = 'active'
      )
    `).run();

    res.json({
      code: 200,
      msg: existing ? '同步更新成功' : '同步创建成功',
      data: { id: templateId }
    });
  } catch (error) {
    console.error('[Admin] 从场景同步失败:', error);
    res.status(500).json({ code: 500, msg: '同步失败' });
  }
});

// 更新模板（后台编辑）
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      name, description, cover_image, reference_image,
      category_id, tags, points_cost, is_featured
    } = req.body;

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    // 构建更新语句
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (cover_image !== undefined) { updates.push('cover_image = ?'); params.push(cover_image); }
    if (reference_image !== undefined) { updates.push('reference_image = ?'); params.push(reference_image); }
    if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(tags); }
    if (points_cost !== undefined) { updates.push('points_cost = ?'); params.push(points_cost); }
    if (is_featured !== undefined) { updates.push('is_featured = ?'); params.push(is_featured); }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      db.prepare(`UPDATE user_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ code: 200, msg: '更新成功' });
  } catch (error) {
    console.error('[Admin] 更新模板失败:', error);
    res.status(500).json({ code: 500, msg: '更新模板失败' });
  }
});

// 删除模板
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    // 如果是已上架状态，先更新统计
    if (template.status === 'active') {
      db.prepare(`
        UPDATE creators SET total_templates = total_templates - 1 WHERE id = ?
      `).run(template.creator_id);

      if (template.category_id) {
        db.prepare(`
          UPDATE template_categories SET template_count = template_count - 1 WHERE id = ?
        `).run(template.category_id);
      }
    }

    // 删除模板（级联删除步骤、选项、Prompt）
    db.prepare('DELETE FROM user_templates WHERE id = ?').run(id);

    // 记录日志
    db.prepare(`
      INSERT INTO template_reviews (template_id, action, reason)
      VALUES (?, 'delete', '后台删除')
    `).run(id);

    res.json({ code: 200, msg: '删除成功' });
  } catch (error) {
    console.error('[Admin] 删除模板失败:', error);
    res.status(500).json({ code: 500, msg: '删除模板失败' });
  }
});

// 下架模板
router.post('/:id/offline', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    if (template.status !== 'active') {
      return res.status(400).json({ code: 400, msg: '模板未上架' });
    }

    // 更新状态
    db.prepare(`
      UPDATE user_templates SET status = 'offline', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    // 更新统计
    db.prepare(`
      UPDATE creators SET total_templates = total_templates - 1 WHERE id = ?
    `).run(template.creator_id);

    if (template.category_id) {
      db.prepare(`
        UPDATE template_categories SET template_count = template_count - 1 WHERE id = ?
      `).run(template.category_id);
    }

    // 记录日志
    db.prepare(`
      INSERT INTO template_reviews (template_id, action, reason)
      VALUES (?, 'offline', '后台下架')
    `).run(id);

    res.json({ code: 200, msg: '已下架' });
  } catch (error) {
    console.error('[Admin] 下架模板失败:', error);
    res.status(500).json({ code: 500, msg: '下架失败' });
  }
});

// 重新上架模板
router.post('/:id/online', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const template = db.prepare('SELECT * FROM user_templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    if (template.status !== 'offline') {
      return res.status(400).json({ code: 400, msg: '只有已下架的模板可以重新上架' });
    }

    // 更新状态
    db.prepare(`
      UPDATE user_templates SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    // 更新统计
    db.prepare(`
      UPDATE creators SET total_templates = total_templates + 1 WHERE id = ?
    `).run(template.creator_id);

    if (template.category_id) {
      db.prepare(`
        UPDATE template_categories SET template_count = template_count + 1 WHERE id = ?
      `).run(template.category_id);
    }

    // 记录日志
    db.prepare(`
      INSERT INTO template_reviews (template_id, action, reason)
      VALUES (?, 'online', '后台重新上架')
    `).run(id);

    res.json({ code: 200, msg: '已上架' });
  } catch (error) {
    console.error('[Admin] 上架模板失败:', error);
    res.status(500).json({ code: 500, msg: '上架失败' });
  }
});

module.exports = router;
