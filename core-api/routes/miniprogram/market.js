/**
 * 模板市场 API
 * 提供模板列表、分类、搜索、详情等功能
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../../config/database');

// 获取分类列表
router.get('/categories', (req, res) => {
  try {
    const db = getDb();
    const categories = db.prepare(`
      SELECT id, name, name_en, icon, cover_image, sort_order, template_count
      FROM template_categories
      WHERE is_visible = 1
      ORDER BY sort_order ASC
    `).all();

    res.json({
      code: 200,
      data: categories
    });
  } catch (error) {
    console.error('[Market] 获取分类列表失败:', error);
    res.status(500).json({ code: 500, msg: '获取分类列表失败' });
  }
});

// 获取模板列表
router.get('/templates', (req, res) => {
  try {
    const db = getDb();
    const {
      category_id,
      keyword,
      sort = 'use_count',
      gender,
      creator_id,
      is_featured,
      is_official,
      page = 1,
      pageSize = 20
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 构建查询条件
    let whereClause = "WHERE t.status = 'active'";
    const params = [];

    if (category_id && category_id !== '0') {
      whereClause += ' AND t.category_id = ?';
      params.push(category_id);
    }

    if (keyword) {
      whereClause += ' AND (t.name LIKE ? OR t.description LIKE ? OR t.tags LIKE ?)';
      const searchTerm = `%${keyword}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (gender && gender !== 'all') {
      whereClause += " AND (t.gender = ? OR t.gender = 'all')";
      params.push(gender);
    }

    if (creator_id) {
      whereClause += ' AND t.creator_id = ?';
      params.push(creator_id);
    }

    if (is_featured === '1') {
      whereClause += ' AND t.is_featured = 1';
    }

    if (is_official === '1') {
      whereClause += ' AND t.is_official = 1';
    }

    // 排序
    let orderClause = 'ORDER BY ';
    switch (sort) {
      case 'latest':
        orderClause += 't.published_at DESC';
        break;
      case 'likes':
        orderClause += 't.like_count DESC';
        break;
      case 'favorites':
        orderClause += 't.favorite_count DESC';
        break;
      case 'use_count':
      default:
        orderClause += 't.use_count DESC';
        break;
    }

    // 查询总数
    const countSql = `
      SELECT COUNT(*) as total
      FROM user_templates t
      ${whereClause}
    `;
    const { total } = db.prepare(countSql).get(...params);

    // 查询列表
    const listSql = `
      SELECT
        t.id, t.name, t.name_en, t.description, t.cover_image, t.reference_image,
        t.category_id, t.tags, t.gender, t.points_cost,
        t.is_featured, t.is_official,
        t.view_count, t.use_count, t.like_count, t.favorite_count,
        t.published_at, t.created_at,
        c.id as creator_id, c.creator_name, c.creator_avatar, c.level as creator_level
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;
    const templates = db.prepare(listSql).all(...params, limit, offset);

    // 格式化返回数据
    const formattedTemplates = templates.map(t => ({
      id: t.id,
      name: t.name,
      name_en: t.name_en,
      description: t.description,
      cover_image: t.cover_image,
      reference_image: t.reference_image,
      category_id: t.category_id,
      tags: t.tags ? t.tags.split(',') : [],
      gender: t.gender,
      points_cost: t.points_cost,
      is_featured: t.is_featured === 1,
      is_official: t.is_official === 1,
      view_count: t.view_count,
      use_count: t.use_count,
      like_count: t.like_count,
      favorite_count: t.favorite_count,
      published_at: t.published_at,
      creator: {
        id: t.creator_id,
        name: t.creator_name,
        avatar: t.creator_avatar,
        level: t.creator_level
      }
    }));

    res.json({
      code: 200,
      data: {
        list: formattedTemplates,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Market] 获取模板列表失败:', error);
    res.status(500).json({ code: 500, msg: '获取模板列表失败' });
  }
});

// 获取精选模板
router.get('/featured', (req, res) => {
  try {
    const db = getDb();
    const { limit = 10 } = req.query;

    const templates = db.prepare(`
      SELECT
        t.id, t.name, t.name_en, t.description, t.cover_image, t.reference_image,
        t.category_id, t.tags, t.gender, t.points_cost,
        t.is_featured, t.is_official,
        t.view_count, t.use_count, t.like_count, t.favorite_count,
        t.published_at,
        c.id as creator_id, c.creator_name, c.creator_avatar, c.level as creator_level
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.status = 'active' AND t.is_featured = 1
      ORDER BY t.use_count DESC
      LIMIT ?
    `).all(parseInt(limit));

    const formattedTemplates = templates.map(t => ({
      id: t.id,
      name: t.name,
      name_en: t.name_en,
      description: t.description,
      cover_image: t.cover_image,
      reference_image: t.reference_image,
      category_id: t.category_id,
      tags: t.tags ? t.tags.split(',') : [],
      gender: t.gender,
      points_cost: t.points_cost,
      is_featured: true,
      is_official: t.is_official === 1,
      view_count: t.view_count,
      use_count: t.use_count,
      like_count: t.like_count,
      favorite_count: t.favorite_count,
      published_at: t.published_at,
      creator: {
        id: t.creator_id,
        name: t.creator_name,
        avatar: t.creator_avatar,
        level: t.creator_level
      }
    }));

    res.json({
      code: 200,
      data: formattedTemplates
    });
  } catch (error) {
    console.error('[Market] 获取精选模板失败:', error);
    res.status(500).json({ code: 500, msg: '获取精选模板失败' });
  }
});

// 获取热门模板
router.get('/hot', (req, res) => {
  try {
    const db = getDb();
    const { limit = 20 } = req.query;

    const templates = db.prepare(`
      SELECT
        t.id, t.name, t.name_en, t.description, t.cover_image, t.reference_image,
        t.category_id, t.tags, t.gender, t.points_cost,
        t.is_featured, t.is_official,
        t.view_count, t.use_count, t.like_count, t.favorite_count,
        t.published_at,
        c.id as creator_id, c.creator_name, c.creator_avatar, c.level as creator_level
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.status = 'active'
      ORDER BY t.use_count DESC
      LIMIT ?
    `).all(parseInt(limit));

    const formattedTemplates = templates.map(t => ({
      id: t.id,
      name: t.name,
      name_en: t.name_en,
      description: t.description,
      cover_image: t.cover_image,
      reference_image: t.reference_image,
      category_id: t.category_id,
      tags: t.tags ? t.tags.split(',') : [],
      gender: t.gender,
      points_cost: t.points_cost,
      is_featured: t.is_featured === 1,
      is_official: t.is_official === 1,
      view_count: t.view_count,
      use_count: t.use_count,
      like_count: t.like_count,
      favorite_count: t.favorite_count,
      published_at: t.published_at,
      creator: {
        id: t.creator_id,
        name: t.creator_name,
        avatar: t.creator_avatar,
        level: t.creator_level
      }
    }));

    res.json({
      code: 200,
      data: formattedTemplates
    });
  } catch (error) {
    console.error('[Market] 获取热门模板失败:', error);
    res.status(500).json({ code: 500, msg: '获取热门模板失败' });
  }
});

// 获取模板详情
router.get('/templates/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { user_id } = req.query;

    // 获取模板基本信息
    const template = db.prepare(`
      SELECT
        t.*,
        c.id as creator_id, c.creator_name, c.creator_avatar, c.level as creator_level, c.bio as creator_bio
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ code: 404, msg: '模板不存在' });
    }

    // 检查模板状态（非上架状态只有创作者本人可以查看）
    if (template.status !== 'active') {
      // 这里可以添加权限检查逻辑
    }

    // 获取模板步骤配置
    const steps = db.prepare(`
      SELECT * FROM template_steps
      WHERE template_id = ?
      ORDER BY step_order ASC
    `).all(id);

    // 获取每个步骤的选项
    for (const step of steps) {
      step.options = db.prepare(`
        SELECT * FROM template_step_options
        WHERE step_id = ?
        ORDER BY sort_order ASC
      `).all(step.id);
    }

    // 获取 Prompt 配置
    const prompt = db.prepare(`
      SELECT * FROM template_prompts
      WHERE template_id = ? AND is_active = 1
      LIMIT 1
    `).get(id);

    // 检查用户是否已点赞/收藏
    let isLiked = false;
    let isFavorited = false;
    if (user_id) {
      const like = db.prepare('SELECT id FROM template_likes WHERE user_id = ? AND template_id = ?').get(user_id, id);
      const favorite = db.prepare('SELECT id FROM template_favorites WHERE user_id = ? AND template_id = ?').get(user_id, id);
      isLiked = !!like;
      isFavorited = !!favorite;
    }

    // 增加浏览次数
    db.prepare('UPDATE user_templates SET view_count = view_count + 1 WHERE id = ?').run(id);

    res.json({
      code: 200,
      data: {
        id: template.id,
        name: template.name,
        name_en: template.name_en,
        description: template.description,
        description_en: template.description_en,
        cover_image: template.cover_image,
        reference_image: template.reference_image,
        category_id: template.category_id,
        tags: template.tags ? template.tags.split(',') : [],
        gender: template.gender,
        points_cost: template.points_cost,
        status: template.status,
        is_featured: template.is_featured === 1,
        is_official: template.is_official === 1,
        view_count: template.view_count + 1,
        use_count: template.use_count,
        like_count: template.like_count,
        favorite_count: template.favorite_count,
        share_count: template.share_count,
        published_at: template.published_at,
        created_at: template.created_at,
        creator: {
          id: template.creator_id,
          name: template.creator_name,
          avatar: template.creator_avatar,
          level: template.creator_level,
          bio: template.creator_bio
        },
        steps,
        prompt: prompt ? {
          template: prompt.template,
          negative_prompt: prompt.negative_prompt,
          reference_weight: prompt.reference_weight,
          face_swap_mode: prompt.face_swap_mode
        } : null,
        isLiked,
        isFavorited
      }
    });
  } catch (error) {
    console.error('[Market] 获取模板详情失败:', error);
    res.status(500).json({ code: 500, msg: '获取模板详情失败' });
  }
});

// 搜索模板
router.get('/search', (req, res) => {
  try {
    const db = getDb();
    const { keyword, page = 1, pageSize = 20 } = req.query;

    if (!keyword) {
      return res.json({ code: 200, data: { list: [], total: 0 } });
    }

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    const searchTerm = `%${keyword}%`;

    // 查询总数
    const { total } = db.prepare(`
      SELECT COUNT(*) as total
      FROM user_templates t
      WHERE t.status = 'active'
        AND (t.name LIKE ? OR t.description LIKE ? OR t.tags LIKE ?)
    `).get(searchTerm, searchTerm, searchTerm);

    // 查询列表
    const templates = db.prepare(`
      SELECT
        t.id, t.name, t.name_en, t.description, t.cover_image, t.reference_image,
        t.category_id, t.tags, t.gender, t.points_cost,
        t.is_featured, t.is_official,
        t.view_count, t.use_count, t.like_count, t.favorite_count,
        t.published_at,
        c.id as creator_id, c.creator_name, c.creator_avatar, c.level as creator_level
      FROM user_templates t
      LEFT JOIN creators c ON t.creator_id = c.id
      WHERE t.status = 'active'
        AND (t.name LIKE ? OR t.description LIKE ? OR t.tags LIKE ?)
      ORDER BY t.use_count DESC
      LIMIT ? OFFSET ?
    `).all(searchTerm, searchTerm, searchTerm, limit, offset);

    const formattedTemplates = templates.map(t => ({
      id: t.id,
      name: t.name,
      name_en: t.name_en,
      description: t.description,
      cover_image: t.cover_image,
      reference_image: t.reference_image,
      category_id: t.category_id,
      tags: t.tags ? t.tags.split(',') : [],
      gender: t.gender,
      points_cost: t.points_cost,
      is_featured: t.is_featured === 1,
      is_official: t.is_official === 1,
      view_count: t.view_count,
      use_count: t.use_count,
      like_count: t.like_count,
      favorite_count: t.favorite_count,
      published_at: t.published_at,
      creator: {
        id: t.creator_id,
        name: t.creator_name,
        avatar: t.creator_avatar,
        level: t.creator_level
      }
    }));

    res.json({
      code: 200,
      data: {
        list: formattedTemplates,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Market] 搜索模板失败:', error);
    res.status(500).json({ code: 500, msg: '搜索模板失败' });
  }
});

// 获取热门标签
router.get('/hot-tags', (req, res) => {
  try {
    const db = getDb();
    const { limit = 20 } = req.query;

    // 从已上架模板中统计标签使用频率
    const templates = db.prepare(`
      SELECT tags FROM user_templates
      WHERE status = 'active' AND tags IS NOT NULL AND tags != ''
    `).all();

    // 统计标签频率
    const tagCount = {};
    templates.forEach(t => {
      const tags = t.tags.split(',');
      tags.forEach(tag => {
        const trimmedTag = tag.trim();
        if (trimmedTag) {
          tagCount[trimmedTag] = (tagCount[trimmedTag] || 0) + 1;
        }
      });
    });

    // 排序并取前N个
    const sortedTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, parseInt(limit))
      .map(([tag, count]) => ({ tag, count }));

    res.json({
      code: 200,
      data: sortedTags
    });
  } catch (error) {
    console.error('[Market] 获取热门标签失败:', error);
    res.status(500).json({ code: 500, msg: '获取热门标签失败' });
  }
});

module.exports = router;
