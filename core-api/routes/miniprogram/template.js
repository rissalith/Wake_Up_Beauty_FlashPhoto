/**
 * 模板管理 API
 * 提供模板的创建、编辑、删除、提交审核等功能
 */
const express = require('express');
const router = express.Router();
const { getDb, transaction } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');
const { reviewTemplate, generateReviewReport, REVIEW_STATUS } = require('../../lib/ai-review');

/**
 * 获取或创建创作者
 */
async function getOrCreateCreator(userId) {
  const db = getDb();
  let creator = db.prepare('SELECT * FROM creators WHERE user_id = ?').get(userId);

  if (!creator) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return null;

    const creatorId = uuidv4();
    db.prepare(`
      INSERT INTO creators (id, user_id, creator_name, creator_avatar, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(creatorId, userId, user.nickname || `创作者${userId.slice(-6)}`, user.avatar_url);

    db.prepare('UPDATE users SET is_creator = 1, creator_id = ? WHERE id = ?').run(creatorId, userId);
    creator = db.prepare('SELECT * FROM creators WHERE id = ?').get(creatorId);
  }

  return creator;
}

// 创建模板
router.post('/', async (req, res) => {
  try {
    const {
      user_id,
      name,
      name_en,
      description,
      description_en,
      cover_image,
      reference_image,
      category_id,
      tags,
      gender = 'all',
      points_cost = 50
    } = req.body;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    if (!name || !cover_image || !reference_image) {
      return res.status(400).json({ code: 400, msg: '缺少必要参数' });
    }

    const creator = await getOrCreateCreator(user_id);
    if (!creator) {
      return res.status(404).json({ code: 404, msg: '用户不存在' });
    }

    const db = getDb();
    const templateId = uuidv4();

    db.prepare(`
      INSERT INTO user_templates (
        id, creator_id, name, name_en, description, description_en,
        cover_image, reference_image, category_id, tags, gender, points_cost, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(
      templateId, creator.id, name, name_en || null, description || null, description_en || null,
      cover_image, reference_image, category_id || null, tags || null, gender, points_cost
    );

    res.json({
      code: 200,
      msg: '创建成功',
      data: { id: templateId }
    });
  } catch (error) {
    console.error('[Template] 创建模板失败:', error);
    res.status(500).json({ code: 500, msg: '创建模板失败' });
  }
});

// 获取模板详情（创作者视角，包含所有状态）
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    const db = getDb();

    const template = db.prepare(`
      SELECT t.*, c.user_id as creator_user_id
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    // 检查权限：非上架状态只有创作者本人可以查看
    if (template.status !== 'active' && template.creator_user_id !== user_id) {
      return res.status(403).json({ code: 403, msg: '无权查看此模板' });
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
      SELECT * FROM template_prompts WHERE template_id = ? AND is_active = 1 LIMIT 1
    `).get(id);

    res.json({
      code: 200,
      data: {
        ...template,
        tags: template.tags ? template.tags.split(',') : [],
        is_featured: template.is_featured === 1,
        is_official: template.is_official === 1,
        steps,
        prompt
      }
    });
  } catch (error) {
    console.error('[Template] 获取模板详情失败:', error);
    res.status(500).json({ code: 500, msg: '获取模板详情失败' });
  }
});

// 更新模板
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      user_id,
      name,
      name_en,
      description,
      description_en,
      cover_image,
      reference_image,
      category_id,
      tags,
      gender,
      points_cost
    } = req.body;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const db = getDb();

    // 检查模板是否存在且属于该用户
    const template = db.prepare(`
      SELECT t.*, c.user_id as creator_user_id
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    if (template.creator_user_id !== user_id) {
      return res.status(403).json({ code: 403, msg: '无权修改此模板' });
    }

    // 已上架的模板编辑后需要重新审核
    const needReReview = template.status === 'active';

    // 构建更新语句
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (name_en !== undefined) { updates.push('name_en = ?'); params.push(name_en); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (description_en !== undefined) { updates.push('description_en = ?'); params.push(description_en); }
    if (cover_image !== undefined) { updates.push('cover_image = ?'); params.push(cover_image); }
    if (reference_image !== undefined) { updates.push('reference_image = ?'); params.push(reference_image); }
    if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(tags); }
    if (gender !== undefined) { updates.push('gender = ?'); params.push(gender); }
    if (points_cost !== undefined) { updates.push('points_cost = ?'); params.push(points_cost); }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');

      // 如果是被拒绝状态，修改后变回草稿
      if (template.status === 'rejected') {
        updates.push("status = 'draft'");
        updates.push('reject_reason = NULL');
      }

      // 如果是已上架状态，编辑后变为草稿，需要重新审核
      if (needReReview) {
        updates.push("status = 'draft'");
        updates.push('edit_version = edit_version + 1');

        // 更新创作者统计（模板下架）
        db.prepare(`
          UPDATE creators SET total_templates = total_templates - 1 WHERE id = ?
        `).run(template.creator_id);

        // 更新分类统计
        if (template.category_id) {
          db.prepare(`
            UPDATE template_categories SET template_count = template_count - 1 WHERE id = ?
          `).run(template.category_id);
        }
      }

      params.push(id);
      db.prepare(`UPDATE user_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({
      code: 200,
      msg: needReReview ? '更新成功，请重新提交审核' : '更新成功',
      data: { needReReview }
    });
  } catch (error) {
    console.error('[Template] 更新模板失败:', error);
    res.status(500).json({ code: 500, msg: '更新模板失败' });
  }
});

// 删除模板
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const db = getDb();

    const template = db.prepare(`
      SELECT t.*, c.user_id as creator_user_id
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    if (template.creator_user_id !== user_id) {
      return res.status(403).json({ code: 403, msg: '无权删除此模板' });
    }

    // 只有草稿状态可以删除
    if (template.status !== 'draft') {
      return res.status(400).json({ code: 400, msg: '只有草稿状态的模板可以删除' });
    }

    // 删除模板（级联删除步骤、选项、Prompt）
    db.prepare('DELETE FROM user_templates WHERE id = ?').run(id);

    res.json({ code: 200, msg: '删除成功' });
  } catch (error) {
    console.error('[Template] 删除模板失败:', error);
    res.status(500).json({ code: 500, msg: '删除模板失败' });
  }
});

// 配置模板步骤
router.post('/:id/steps', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, steps } = req.body;

    if (!user_id || !steps) {
      return res.status(400).json({ code: 400, msg: '缺少必要参数' });
    }

    const db = getDb();

    // 检查权限
    const template = db.prepare(`
      SELECT t.*, c.user_id as creator_user_id
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    if (template.creator_user_id !== user_id) {
      return res.status(403).json({ code: 403, msg: '无权修改此模板' });
    }

    if (!['draft', 'rejected'].includes(template.status)) {
      return res.status(400).json({ code: 400, msg: '当前状态不允许修改' });
    }

    // 使用事务更新步骤
    const updateSteps = db.transaction(() => {
      // 删除现有步骤（级联删除选项）
      db.prepare('DELETE FROM template_steps WHERE template_id = ?').run(id);

      // 插入新步骤
      const stepStmt = db.prepare(`
        INSERT INTO template_steps (template_id, step_order, step_key, title, title_en, subtitle, component_type, is_required, is_visible, config)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const optionStmt = db.prepare(`
        INSERT INTO template_step_options (step_id, option_key, label, label_en, icon, image, prompt_text, extra_points, sort_order, is_default, is_visible, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      steps.forEach((step, index) => {
        const result = stepStmt.run(
          id,
          index + 1,
          step.step_key,
          step.title,
          step.title_en || null,
          step.subtitle || null,
          step.component_type,
          step.is_required !== false ? 1 : 0,
          step.is_visible !== false ? 1 : 0,
          step.config ? JSON.stringify(step.config) : null
        );

        const stepId = result.lastInsertRowid;

        // 插入选项
        if (step.options && step.options.length > 0) {
          step.options.forEach((opt, optIndex) => {
            optionStmt.run(
              stepId,
              opt.option_key || `opt_${optIndex}`,
              opt.label,
              opt.label_en || null,
              opt.icon || null,
              opt.image || null,
              opt.prompt_text || null,
              opt.extra_points || 0,
              optIndex,
              opt.is_default ? 1 : 0,
              opt.is_visible !== false ? 1 : 0,
              opt.metadata ? JSON.stringify(opt.metadata) : null
            );
          });
        }
      });
    });

    updateSteps();

    res.json({ code: 200, msg: '步骤配置成功' });
  } catch (error) {
    console.error('[Template] 配置步骤失败:', error);
    res.status(500).json({ code: 500, msg: '配置步骤失败' });
  }
});

// 配置 Prompt
router.put('/:id/prompt', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      user_id,
      template: promptTemplate,
      negative_prompt,
      reference_weight = 0.8,
      face_swap_mode = 'replace'
    } = req.body;

    if (!user_id || !promptTemplate) {
      return res.status(400).json({ code: 400, msg: '缺少必要参数' });
    }

    const db = getDb();

    // 检查权限
    const template = db.prepare(`
      SELECT t.*, c.user_id as creator_user_id
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    if (template.creator_user_id !== user_id) {
      return res.status(403).json({ code: 403, msg: '无权修改此模板' });
    }

    if (!['draft', 'rejected'].includes(template.status)) {
      return res.status(400).json({ code: 400, msg: '当前状态不允许修改' });
    }

    // 更新或插入 Prompt
    const existingPrompt = db.prepare('SELECT id FROM template_prompts WHERE template_id = ?').get(id);

    if (existingPrompt) {
      db.prepare(`
        UPDATE template_prompts
        SET template = ?, negative_prompt = ?, reference_weight = ?, face_swap_mode = ?, updated_at = CURRENT_TIMESTAMP
        WHERE template_id = ?
      `).run(promptTemplate, negative_prompt || null, reference_weight, face_swap_mode, id);
    } else {
      db.prepare(`
        INSERT INTO template_prompts (template_id, template, negative_prompt, reference_weight, face_swap_mode)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, promptTemplate, negative_prompt || null, reference_weight, face_swap_mode);
    }

    res.json({ code: 200, msg: 'Prompt 配置成功' });
  } catch (error) {
    console.error('[Template] 配置 Prompt 失败:', error);
    res.status(500).json({ code: 500, msg: '配置 Prompt 失败' });
  }
});

// 提交审核（自动触发 AI 审核）
router.post('/:id/submit', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const db = getDb();

    const template = db.prepare(`
      SELECT t.*, c.user_id as creator_user_id
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    if (template.creator_user_id !== user_id) {
      return res.status(403).json({ code: 403, msg: '无权操作此模板' });
    }

    if (!['draft', 'rejected'].includes(template.status)) {
      return res.status(400).json({ code: 400, msg: '当前状态不允许提交审核' });
    }

    // 检查必要内容是否完整
    if (!template.name || !template.cover_image || !template.reference_image) {
      return res.status(400).json({ code: 400, msg: '请完善模板基本信息' });
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
    const prompts = db.prepare('SELECT * FROM template_prompts WHERE template_id = ?').all(id);
    if (!prompts || prompts.length === 0) {
      return res.status(400).json({ code: 400, msg: '请配置 Prompt 模板' });
    }

    // 更新状态为审核中
    db.prepare(`
      UPDATE user_templates SET status = 'reviewing', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    // 记录审核日志
    db.prepare(`
      INSERT INTO template_reviews (template_id, action, reason) VALUES (?, 'submit', '创作者提交审核')
    `).run(id);

    // 异步执行 AI 审核
    performAIReview(id, template, steps, prompts).catch(err => {
      console.error('[Template] AI 审核异常:', err);
    });

    res.json({ code: 200, msg: '已提交审核，正在进行自动审核' });
  } catch (error) {
    console.error('[Template] 提交审核失败:', error);
    res.status(500).json({ code: 500, msg: '提交审核失败' });
  }
});

/**
 * 执行 AI 自动审核
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
        INSERT INTO template_reviews (template_id, action, reason, reviewer)
        VALUES (?, 'approve', ?, 'AI')
      `).run(templateId, 'AI 自动审核通过');

      console.log(`[AI审核] 模板 ${templateId} 审核通过，已自动上架`);

      // 发送通知给创作者
      sendNotificationToCreator(template.creator_id, {
        type: 'review_approved',
        title: '模板审核通过',
        content: `您的模板「${template.name}」已通过审核并上架`,
        template_id: templateId
      });

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
        INSERT INTO template_reviews (template_id, action, reason, reviewer)
        VALUES (?, 'reject', ?, 'AI')
      `).run(templateId, rejectReason);

      console.log(`[AI审核] 模板 ${templateId} 审核不通过: ${rejectReason}`);

      // 发送通知给创作者
      sendNotificationToCreator(template.creator_id, {
        type: 'review_rejected',
        title: '模板审核未通过',
        content: `您的模板「${template.name}」未通过审核，原因：${rejectReason}`,
        template_id: templateId,
        suggestions: report.suggestions
      });

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

/**
 * 发送通知给创作者
 */
function sendNotificationToCreator(creatorId, notification) {
  const db = getDb();

  try {
    // 获取创作者的用户ID
    const creator = db.prepare('SELECT user_id FROM creators WHERE id = ?').get(creatorId);
    if (!creator) return;

    // 插入通知记录（如果有通知表的话）
    // 这里可以扩展为发送微信订阅消息等
    console.log(`[通知] 发送给创作者 ${creatorId}:`, notification.title);

    // TODO: 实现微信订阅消息推送
    // 需要用户授权订阅消息模板

  } catch (error) {
    console.error('[通知] 发送失败:', error);
  }
}

// 下架模板
router.post('/:id/offline', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const db = getDb();

    const template = db.prepare(`
      SELECT t.*, c.user_id as creator_user_id
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    if (template.creator_user_id !== user_id) {
      return res.status(403).json({ code: 403, msg: '无权操作此模板' });
    }

    if (template.status !== 'active') {
      return res.status(400).json({ code: 400, msg: '只有已上架的模板可以下架' });
    }

    // 更新状态为下架
    db.prepare(`
      UPDATE user_templates SET status = 'offline', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

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

    res.json({ code: 200, msg: '已下架' });
  } catch (error) {
    console.error('[Template] 下架模板失败:', error);
    res.status(500).json({ code: 500, msg: '下架模板失败' });
  }
});

// 点赞/取消点赞
router.post('/:id/like', (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const db = getDb();

    // 检查模板是否存在
    const template = db.prepare('SELECT * FROM user_templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    // 检查是否已点赞
    const existingLike = db.prepare('SELECT id FROM template_likes WHERE user_id = ? AND template_id = ?').get(user_id, id);

    if (existingLike) {
      // 取消点赞
      db.prepare('DELETE FROM template_likes WHERE id = ?').run(existingLike.id);
      db.prepare('UPDATE user_templates SET like_count = like_count - 1 WHERE id = ?').run(id);
      db.prepare('UPDATE creators SET total_likes = total_likes - 1 WHERE id = ?').run(template.creator_id);

      res.json({ code: 200, msg: '已取消点赞', data: { isLiked: false } });
    } else {
      // 点赞
      db.prepare('INSERT INTO template_likes (user_id, template_id) VALUES (?, ?)').run(user_id, id);
      db.prepare('UPDATE user_templates SET like_count = like_count + 1 WHERE id = ?').run(id);
      db.prepare('UPDATE creators SET total_likes = total_likes + 1 WHERE id = ?').run(template.creator_id);

      res.json({ code: 200, msg: '已点赞', data: { isLiked: true } });
    }
  } catch (error) {
    console.error('[Template] 点赞操作失败:', error);
    res.status(500).json({ code: 500, msg: '操作失败' });
  }
});

// 收藏/取消收藏
router.post('/:id/favorite', (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const db = getDb();

    // 检查模板是否存在
    const template = db.prepare('SELECT * FROM user_templates WHERE id = ?').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    // 检查是否已收藏
    const existingFavorite = db.prepare('SELECT id FROM template_favorites WHERE user_id = ? AND template_id = ?').get(user_id, id);

    if (existingFavorite) {
      // 取消收藏
      db.prepare('DELETE FROM template_favorites WHERE id = ?').run(existingFavorite.id);
      db.prepare('UPDATE user_templates SET favorite_count = favorite_count - 1 WHERE id = ?').run(id);

      res.json({ code: 200, msg: '已取消收藏', data: { isFavorited: false } });
    } else {
      // 收藏
      db.prepare('INSERT INTO template_favorites (user_id, template_id) VALUES (?, ?)').run(user_id, id);
      db.prepare('UPDATE user_templates SET favorite_count = favorite_count + 1 WHERE id = ?').run(id);

      res.json({ code: 200, msg: '已收藏', data: { isFavorited: true } });
    }
  } catch (error) {
    console.error('[Template] 收藏操作失败:', error);
    res.status(500).json({ code: 500, msg: '操作失败' });
  }
});

// 使用模板生成图片（记录使用并计算收益）
router.post('/:id/use', (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, result_image } = req.body;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const db = getDb();

    // 检查模板是否存在且已上架
    const template = db.prepare('SELECT * FROM user_templates WHERE id = ? AND status = "active"').get(id);
    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在或未上架' });
    }

    // 获取创作者信息和分成比例
    const creator = db.prepare('SELECT * FROM creators WHERE id = ?').get(template.creator_id);
    const levelInfo = db.prepare('SELECT * FROM creator_levels WHERE level = ?').get(creator.level);
    const revenueShare = levelInfo ? levelInfo.revenue_share : 10;

    // 计算创作者收益
    const creatorEarning = Math.floor(template.points_cost * revenueShare / 100);

    // 记录使用
    const usageResult = db.prepare(`
      INSERT INTO template_usage_records (user_id, template_id, creator_id, points_cost, creator_earning, result_image, status)
      VALUES (?, ?, ?, ?, ?, ?, 'success')
    `).run(user_id, id, template.creator_id, template.points_cost, creatorEarning, result_image || null);

    // 更新模板使用次数
    db.prepare('UPDATE user_templates SET use_count = use_count + 1 WHERE id = ?').run(id);

    // 更新创作者统计和余额
    db.prepare(`
      UPDATE creators
      SET total_uses = total_uses + 1, total_earnings = total_earnings + ?, balance = balance + ?
      WHERE id = ?
    `).run(creatorEarning, creatorEarning, template.creator_id);

    // 记录创作者收益
    if (creatorEarning > 0) {
      const newBalance = creator.balance + creatorEarning;
      db.prepare(`
        INSERT INTO creator_earnings (creator_id, template_id, usage_record_id, type, amount, balance_after, description)
        VALUES (?, ?, ?, 'usage', ?, ?, '模板被使用')
      `).run(template.creator_id, id, usageResult.lastInsertRowid, creatorEarning, newBalance);
    }

    res.json({
      code: 200,
      msg: '使用成功',
      data: {
        points_cost: template.points_cost,
        creator_earning: creatorEarning
      }
    });
  } catch (error) {
    console.error('[Template] 使用模板失败:', error);
    res.status(500).json({ code: 500, msg: '使用模板失败' });
  }
});

// 获取用户收藏列表
router.get('/user/favorites', (req, res) => {
  try {
    const { user_id, page = 1, pageSize = 20 } = req.query;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM template_favorites WHERE user_id = ?
    `).get(user_id);

    const favorites = db.prepare(`
      SELECT
        t.id, t.name, t.name_en, t.description, t.cover_image,
        t.category_id, t.tags, t.gender, t.points_cost,
        t.is_featured, t.is_official,
        t.view_count, t.use_count, t.like_count, t.favorite_count,
        t.published_at,
        c.id as creator_id, c.creator_name, c.creator_avatar, c.level as creator_level,
        f.created_at as favorited_at
      FROM template_favorites f
      JOIN user_templates t ON f.template_id = t.id
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE f.user_id = ? AND t.status = 'active'
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `).all(user_id, limit, offset);

    res.json({
      code: 200,
      data: {
        list: favorites.map(t => ({
          ...t,
          tags: t.tags ? t.tags.split(',') : [],
          is_featured: t.is_featured === 1,
          is_official: t.is_official === 1,
          creator: {
            id: t.creator_id,
            name: t.creator_name,
            avatar: t.creator_avatar,
            level: t.creator_level
          }
        })),
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('[Template] 获取收藏列表失败:', error);
    res.status(500).json({ code: 500, msg: '获取收藏列表失败' });
  }
});

// ==================== 创作者模板管理 API ====================

// 获取创作者的模板列表（支持按状态筛选）
router.get('/creator/my-templates', (req, res) => {
  try {
    const { user_id, status, page = 1, pageSize = 20 } = req.query;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const db = getDb();

    // 获取创作者信息
    const creator = db.prepare('SELECT * FROM creators WHERE user_id = ?').get(user_id);
    if (!creator) {
      return res.json({
        code: 200,
        data: { list: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) }
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 构建查询条件
    let whereClause = 'WHERE t.creator_id = ?';
    const params = [creator.id];

    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }

    // 获取总数
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM user_templates t ${whereClause}
    `).get(...params);

    // 获取列表（按排序权重和创建时间排序）
    const templates = db.prepare(`
      SELECT
        t.id, t.name, t.name_en, t.description, t.cover_image, t.reference_image,
        t.category_id, t.tags, t.gender, t.points_cost, t.status, t.reject_reason,
        t.is_featured, t.is_official, t.sort_order, t.edit_version,
        t.view_count, t.use_count, t.like_count, t.favorite_count,
        t.review_score, t.reviewed_at, t.published_at, t.created_at, t.updated_at,
        tc.name as category_name
      FROM user_templates t
      LEFT JOIN template_categories tc ON t.category_id = tc.id
      ${whereClause}
      ORDER BY t.sort_order DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      code: 200,
      data: {
        list: templates.map(t => ({
          ...t,
          tags: t.tags ? t.tags.split(',') : [],
          is_featured: t.is_featured === 1,
          is_official: t.is_official === 1,
          status_text: getStatusText(t.status)
        })),
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('[Template] 获取创作者模板列表失败:', error);
    res.status(500).json({ code: 500, msg: '获取模板列表失败' });
  }
});

// 获取创作者模板统计
router.get('/creator/stats', (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const db = getDb();

    const creator = db.prepare('SELECT * FROM creators WHERE user_id = ?').get(user_id);
    if (!creator) {
      return res.json({
        code: 200,
        data: {
          draft: 0,
          reviewing: 0,
          pending: 0,
          active: 0,
          rejected: 0,
          offline: 0,
          total: 0
        }
      });
    }

    // 按状态统计
    const stats = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM user_templates
      WHERE creator_id = ?
      GROUP BY status
    `).all(creator.id);

    const result = {
      draft: 0,
      reviewing: 0,
      pending: 0,
      active: 0,
      rejected: 0,
      offline: 0,
      total: 0
    };

    for (const stat of stats) {
      result[stat.status] = stat.count;
      result.total += stat.count;
    }

    res.json({ code: 200, data: result });
  } catch (error) {
    console.error('[Template] 获取创作者统计失败:', error);
    res.status(500).json({ code: 500, msg: '获取统计失败' });
  }
});

// 更新模板排序（拖拽排序）
router.post('/creator/reorder', (req, res) => {
  try {
    const { user_id, template_orders } = req.body;

    if (!user_id || !template_orders || !Array.isArray(template_orders)) {
      return res.status(400).json({ code: 400, msg: '缺少必要参数' });
    }

    const db = getDb();

    // 获取创作者信息
    const creator = db.prepare('SELECT * FROM creators WHERE user_id = ?').get(user_id);
    if (!creator) {
      return res.status(404).json({ code: 404, msg: '创作者不存在' });
    }

    // 使用事务更新排序
    const updateOrder = db.transaction(() => {
      const stmt = db.prepare(`
        UPDATE user_templates SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND creator_id = ?
      `);

      for (const item of template_orders) {
        stmt.run(item.sort_order, item.template_id, creator.id);
      }
    });

    updateOrder();

    res.json({ code: 200, msg: '排序更新成功' });
  } catch (error) {
    console.error('[Template] 更新排序失败:', error);
    res.status(500).json({ code: 500, msg: '更新排序失败' });
  }
});

// 删除已上架的模板（创作者主动下架并删除）
router.delete('/creator/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ code: 400, msg: '缺少用户ID' });
    }

    const db = getDb();

    const template = db.prepare(`
      SELECT t.*, c.user_id as creator_user_id
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    if (template.creator_user_id !== user_id) {
      return res.status(403).json({ code: 403, msg: '无权删除此模板' });
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

    res.json({ code: 200, msg: '删除成功' });
  } catch (error) {
    console.error('[Template] 删除模板失败:', error);
    res.status(500).json({ code: 500, msg: '删除模板失败' });
  }
});

// 获取审核状态文本
function getStatusText(status) {
  const statusMap = {
    draft: '草稿',
    reviewing: '审核中',
    pending: '待审核',
    active: '已上架',
    rejected: '已拒绝',
    offline: '已下架'
  };
  return statusMap[status] || status;
}

module.exports = router;
