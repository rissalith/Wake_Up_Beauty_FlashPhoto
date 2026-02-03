/**
 * 创作者场景 API
 * 让创作者在小程序端设计和配置场景
 */

const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { authMiddleware } = require('./user');

// 验证创作者身份
const creatorMiddleware = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const creator = db.prepare('SELECT * FROM creators WHERE user_id = ? AND status = ?').get(userId, 'approved');

    if (!creator) {
      return res.status(403).json({ code: 403, message: '需要创作者身份' });
    }

    req.creator = creator;
    next();
  } catch (error) {
    console.error('验证创作者身份失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
};

// 获取我的场景列表
router.get('/my-list', authMiddleware, creatorMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const { status, page = 1, pageSize = 20 } = req.query;

    let sql = `
      SELECT s.*,
        (SELECT COUNT(*) FROM scene_likes WHERE scene_id = s.id) as like_count
      FROM scenes s
      WHERE s.creator_id = ?
    `;
    const params = [userId];

    if (status) {
      sql += ' AND s.review_status = ?';
      params.push(status);
    }

    sql += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));

    const scenes = db.prepare(sql).all(...params);

    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM scenes WHERE creator_id = ?';
    const countParams = [userId];
    if (status) {
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
    console.error('获取我的场景列表失败:', error);
    res.status(500).json({ code: 500, message: '获取场景列表失败' });
  }
});

// 创建场景
router.post('/', authMiddleware, creatorMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, description, icon, points_cost = 10 } = req.body;

    if (!name) {
      return res.status(400).json({ code: 400, message: '场景名称不能为空' });
    }

    const result = db.prepare(`
      INSERT INTO scenes (name, description, icon, points_cost, creator_id, source, review_status, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'creator', 'draft', 'inactive', datetime('now'))
    `).run(name, description || '', icon || '', points_cost, userId);

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(result.lastInsertRowid);

    res.json({
      code: 0,
      data: scene,
      message: '创建成功'
    });
  } catch (error) {
    console.error('创建场景失败:', error);
    res.status(500).json({ code: 500, message: '创建场景失败' });
  }
});

// 获取场景详情（包含步骤和选项）
router.get('/:id', authMiddleware, creatorMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const sceneId = req.params.id;

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ? AND creator_id = ?').get(sceneId, userId);

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

    res.json({
      code: 0,
      data: {
        ...scene,
        steps,
        prompts
      }
    });
  } catch (error) {
    console.error('获取场景详情失败:', error);
    res.status(500).json({ code: 500, message: '获取场景详情失败' });
  }
});

// 更新场景基本信息
router.put('/:id', authMiddleware, creatorMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const sceneId = req.params.id;
    const { name, description, icon, points_cost } = req.body;

    // 检查场景是否存在且属于当前创作者
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ? AND creator_id = ?').get(sceneId, userId);

    if (!scene) {
      return res.status(404).json({ code: 404, message: '场景不存在' });
    }

    // 只有草稿或被拒绝的场景可以编辑
    if (!['draft', 'rejected'].includes(scene.review_status)) {
      return res.status(400).json({ code: 400, message: '当前状态不允许编辑' });
    }

    db.prepare(`
      UPDATE scenes
      SET name = ?, description = ?, icon = ?, points_cost = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name || scene.name, description || scene.description, icon || scene.icon, points_cost || scene.points_cost, sceneId);

    const updatedScene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId);

    res.json({
      code: 0,
      data: updatedScene,
      message: '更新成功'
    });
  } catch (error) {
    console.error('更新场景失败:', error);
    res.status(500).json({ code: 500, message: '更新场景失败' });
  }
});

// 删除场景
router.delete('/:id', authMiddleware, creatorMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const sceneId = req.params.id;

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ? AND creator_id = ?').get(sceneId, userId);

    if (!scene) {
      return res.status(404).json({ code: 404, message: '场景不存在' });
    }

    // 只有草稿或被拒绝的场景可以删除
    if (!['draft', 'rejected'].includes(scene.review_status)) {
      return res.status(400).json({ code: 400, message: '当前状态不允许删除' });
    }

    // 删除相关数据
    const transaction = db.transaction(() => {
      // 删除步骤选项
      db.prepare(`
        DELETE FROM step_options WHERE step_id IN (SELECT id FROM scene_steps WHERE scene_id = ?)
      `).run(sceneId);

      // 删除步骤
      db.prepare('DELETE FROM scene_steps WHERE scene_id = ?').run(sceneId);

      // 删除 Prompt 模板
      db.prepare('DELETE FROM prompt_templates WHERE scene_id = ?').run(sceneId);

      // 删除场景
      db.prepare('DELETE FROM scenes WHERE id = ?').run(sceneId);
    });

    transaction();

    res.json({
      code: 0,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除场景失败:', error);
    res.status(500).json({ code: 500, message: '删除场景失败' });
  }
});

// 保存步骤配置
router.post('/:id/steps', authMiddleware, creatorMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const sceneId = req.params.id;
    const { steps } = req.body;

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ? AND creator_id = ?').get(sceneId, userId);

    if (!scene) {
      return res.status(404).json({ code: 404, message: '场景不存在' });
    }

    if (!['draft', 'rejected'].includes(scene.review_status)) {
      return res.status(400).json({ code: 400, message: '当前状态不允许编辑' });
    }

    const transaction = db.transaction(() => {
      // 删除现有步骤和选项
      db.prepare(`
        DELETE FROM step_options WHERE step_id IN (SELECT id FROM scene_steps WHERE scene_id = ?)
      `).run(sceneId);
      db.prepare('DELETE FROM scene_steps WHERE scene_id = ?').run(sceneId);

      // 插入新步骤
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepResult = db.prepare(`
          INSERT INTO scene_steps (scene_id, step_order, step_type, title, description, variable_name, is_required, config)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sceneId,
          i + 1,
          step.step_type,
          step.title || '',
          step.description || '',
          step.variable_name || '',
          step.is_required ? 1 : 0,
          JSON.stringify(step.config || {})
        );

        // 插入选项
        if (step.options && step.options.length > 0) {
          for (let j = 0; j < step.options.length; j++) {
            const option = step.options[j];
            db.prepare(`
              INSERT INTO step_options (step_id, label, value, image_url, prompt_text, sort_order, grade, probability)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              stepResult.lastInsertRowid,
              option.label || '',
              option.value || '',
              option.image_url || '',
              option.prompt_text || '',
              j + 1,
              option.grade || 'normal',
              option.probability || 1.0
            );
          }
        }
      }
    });

    transaction();

    // 返回更新后的步骤
    const updatedSteps = db.prepare('SELECT * FROM scene_steps WHERE scene_id = ? ORDER BY step_order ASC').all(sceneId);
    for (const step of updatedSteps) {
      step.options = db.prepare('SELECT * FROM step_options WHERE step_id = ? ORDER BY sort_order ASC').all(step.id);
    }

    res.json({
      code: 0,
      data: updatedSteps,
      message: '保存成功'
    });
  } catch (error) {
    console.error('保存步骤配置失败:', error);
    res.status(500).json({ code: 500, message: '保存步骤配置失败' });
  }
});

// 保存 Prompt 模板
router.put('/:id/prompt', authMiddleware, creatorMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const sceneId = req.params.id;
    const { prompt_template, negative_prompt, model_config } = req.body;

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ? AND creator_id = ?').get(sceneId, userId);

    if (!scene) {
      return res.status(404).json({ code: 404, message: '场景不存在' });
    }

    if (!['draft', 'rejected'].includes(scene.review_status)) {
      return res.status(400).json({ code: 400, message: '当前状态不允许编辑' });
    }

    // 删除现有模板
    db.prepare('DELETE FROM prompt_templates WHERE scene_id = ?').run(sceneId);

    // 插入新模板
    db.prepare(`
      INSERT INTO prompt_templates (scene_id, name, prompt_template, negative_prompt, model_config, is_default)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(sceneId, '默认模板', prompt_template || '', negative_prompt || '', JSON.stringify(model_config || {}));

    const prompts = db.prepare('SELECT * FROM prompt_templates WHERE scene_id = ?').all(sceneId);

    res.json({
      code: 0,
      data: prompts,
      message: '保存成功'
    });
  } catch (error) {
    console.error('保存 Prompt 模板失败:', error);
    res.status(500).json({ code: 500, message: '保存 Prompt 模板失败' });
  }
});

// 提交审核
router.post('/:id/submit', authMiddleware, creatorMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const sceneId = req.params.id;

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ? AND creator_id = ?').get(sceneId, userId);

    if (!scene) {
      return res.status(404).json({ code: 404, message: '场景不存在' });
    }

    if (!['draft', 'rejected'].includes(scene.review_status)) {
      return res.status(400).json({ code: 400, message: '当前状态不允许提交审核' });
    }

    // 验证场景完整性
    const steps = db.prepare('SELECT * FROM scene_steps WHERE scene_id = ?').all(sceneId);
    if (steps.length === 0) {
      return res.status(400).json({ code: 400, message: '请至少添加一个步骤' });
    }

    const prompts = db.prepare('SELECT * FROM prompt_templates WHERE scene_id = ?').all(sceneId);
    if (prompts.length === 0) {
      return res.status(400).json({ code: 400, message: '请配置 Prompt 模板' });
    }

    // 更新状态
    db.prepare(`
      UPDATE scenes
      SET review_status = 'pending', submitted_at = datetime('now'), reject_reason = NULL
      WHERE id = ?
    `).run(sceneId);

    // 记录审核日志
    db.prepare(`
      INSERT INTO scene_reviews (scene_id, action, created_at)
      VALUES (?, 'submit', datetime('now'))
    `).run(sceneId);

    res.json({
      code: 0,
      message: '提交成功，等待审核'
    });
  } catch (error) {
    console.error('提交审核失败:', error);
    res.status(500).json({ code: 500, message: '提交审核失败' });
  }
});

// 点赞/取消点赞
router.post('/:id/like', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const sceneId = req.params.id;

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId);

    if (!scene) {
      return res.status(404).json({ code: 404, message: '场景不存在' });
    }

    const existingLike = db.prepare('SELECT * FROM scene_likes WHERE user_id = ? AND scene_id = ?').get(userId, sceneId);

    if (existingLike) {
      // 取消点赞
      db.prepare('DELETE FROM scene_likes WHERE user_id = ? AND scene_id = ?').run(userId, sceneId);
      db.prepare('UPDATE scenes SET like_count = like_count - 1 WHERE id = ? AND like_count > 0').run(sceneId);

      res.json({
        code: 0,
        data: { liked: false },
        message: '取消点赞'
      });
    } else {
      // 点赞
      db.prepare('INSERT INTO scene_likes (user_id, scene_id) VALUES (?, ?)').run(userId, sceneId);
      db.prepare('UPDATE scenes SET like_count = like_count + 1 WHERE id = ?').run(sceneId);

      res.json({
        code: 0,
        data: { liked: true },
        message: '点赞成功'
      });
    }
  } catch (error) {
    console.error('点赞操作失败:', error);
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

// 获取可用的步骤类型
router.get('/step-types/list', authMiddleware, creatorMiddleware, (req, res) => {
  try {
    const stepTypes = [
      {
        type: 'image_upload',
        name: '图片上传',
        description: '让用户上传照片',
        icon: 'upload',
        hasOptions: false
      },
      {
        type: 'gender_select',
        name: '性别选择',
        description: '选择性别（男/女）',
        icon: 'user',
        hasOptions: true,
        defaultOptions: [
          { label: '男', value: 'male', prompt_text: 'male' },
          { label: '女', value: 'female', prompt_text: 'female' }
        ]
      },
      {
        type: 'single_select',
        name: '单选',
        description: '从多个选项中选择一个',
        icon: 'list',
        hasOptions: true
      },
      {
        type: 'tag_select',
        name: '标签选择',
        description: '标签样式的单选',
        icon: 'tag',
        hasOptions: true
      },
      {
        type: 'image_tag_select',
        name: '图片标签',
        description: '带图片的标签选择',
        icon: 'image',
        hasOptions: true
      },
      {
        type: 'dice_roll',
        name: '摇骰子',
        description: '随机抽取选项，支持品级和概率',
        icon: 'dice',
        hasOptions: true,
        config: {
          free_rolls: 1,
          roll_cost: 1
        }
      }
    ];

    res.json({
      code: 0,
      data: stepTypes
    });
  } catch (error) {
    console.error('获取步骤类型失败:', error);
    res.status(500).json({ code: 500, message: '获取步骤类型失败' });
  }
});

// 获取品级列表（用于摇骰子配置）
router.get('/grades/list', authMiddleware, creatorMiddleware, (req, res) => {
  try {
    const grades = [
      { value: 'normal', label: '普通', color: '#999999', probability: 0.5 },
      { value: 'rare', label: '稀有', color: '#3498db', probability: 0.3 },
      { value: 'epic', label: '史诗', color: '#9b59b6', probability: 0.15 },
      { value: 'legendary', label: '传说', color: '#f39c12', probability: 0.05 }
    ];

    res.json({
      code: 0,
      data: grades
    });
  } catch (error) {
    console.error('获取品级列表失败:', error);
    res.status(500).json({ code: 500, message: '获取品级列表失败' });
  }
});

module.exports = router;
