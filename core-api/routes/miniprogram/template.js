/**
 * 模板管理 API
 * 提供模板的创建、编辑、删除、提交审核等功能
 */
const express = require('express');
const router = express.Router();
const { getDb, transaction } = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

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

    // 只有草稿和被拒绝状态可以修改
    if (!['draft', 'rejected'].includes(template.status)) {
      return res.status(400).json({ code: 400, msg: '当前状态不允许修改' });
    }

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
      params.push(id);

      db.prepare(`UPDATE user_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ code: 200, msg: '更新成功' });
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

// 提交审核
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

    const prompt = db.prepare('SELECT id FROM template_prompts WHERE template_id = ?').get(id);
    if (!prompt) {
      return res.status(400).json({ code: 400, msg: '请配置 Prompt 模板' });
    }

    // 更新状态为待审核
    db.prepare(`
      UPDATE user_templates SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    // 记录审核日志
    db.prepare(`
      INSERT INTO template_reviews (template_id, action, reason) VALUES (?, 'submit', '创作者提交审核')
    `).run(id);

    res.json({ code: 200, msg: '已提交审核' });
  } catch (error) {
    console.error('[Template] 提交审核失败:', error);
    res.status(500).json({ code: 500, msg: '提交审核失败' });
  }
});

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

module.exports = router;
