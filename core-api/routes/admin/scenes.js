/**
 * 后台场景管理路由
 */
const express = require('express');
const router = express.Router();
const { getDb, dbRun, saveDatabase } = require('../../config/database');

// 获取场景列表
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { status, page = 1, pageSize = 50 } = req.query;

    let sql = 'SELECT * FROM scenes WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY sort_order ASC, id ASC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const scenes = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as count')).get(...params).count;

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
    console.error('获取场景列表错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取单个场景详情
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);
    if (!scene) {
      return res.status(404).json({ code: -1, msg: '场景不存在' });
    }

    res.json({
      code: 0,
      data: scene
    });
  } catch (error) {
    console.error('获取场景详情错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 创建场景
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const {
      sceneKey, name, nameEn, nameTw, description, descriptionEn, descriptionTw,
      icon, coverImage, price, isFree, status, isReviewSafe, pagePath,
      useDynamicRender, comingSoonText, sortOrder
    } = req.body;

    if (!sceneKey || !name) {
      return res.status(400).json({ code: -1, msg: '场景key和名称不能为空' });
    }

    const existing = db.prepare('SELECT id FROM scenes WHERE scene_key = ?').get(sceneKey);
    if (existing) {
      return res.status(400).json({ code: -1, msg: '场景key已存在' });
    }

    const result = dbRun(db, `
      INSERT INTO scenes (scene_key, name, name_en, description, description_en,
        icon, cover_image, price, is_free, status, is_review_safe, page_path,
        use_dynamic_render, coming_soon_text, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      sceneKey, name, nameEn || null, description || null, descriptionEn || null,
      icon || null, coverImage || null, price || 0, isFree ? 1 : 0, status || 'offline', isReviewSafe ? 1 : 0, pagePath || null,
      useDynamicRender ? 1 : 0, comingSoonText || null, sortOrder || 0
    ]);

    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { id: result.lastInsertRowid }
    });
  } catch (error) {
    console.error('创建场景错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新场景
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const updates = req.body;

    const existing = db.prepare('SELECT id FROM scenes WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ code: -1, msg: '场景不存在' });
    }

    const fields = [];
    const values = [];

    const fieldMap = {
      name: 'name', nameEn: 'name_en',
      description: 'description', descriptionEn: 'description_en',
      icon: 'icon', coverImage: 'cover_image', price: 'price',
      isFree: 'is_free', status: 'status', isReviewSafe: 'is_review_safe',
      pagePath: 'page_path', useDynamicRender: 'use_dynamic_render',
      comingSoonText: 'coming_soon_text', sortOrder: 'sort_order'
    };

    Object.entries(updates).forEach(([key, value]) => {
      if (fieldMap[key] !== undefined) {
        fields.push(`${fieldMap[key]} = ?`);
        if (['isFree', 'isReviewSafe', 'useDynamicRender'].includes(key)) {
          values.push(value ? 1 : 0);
        } else {
          values.push(value);
        }
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ code: -1, msg: '没有可更新的字段' });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    dbRun(db, `UPDATE scenes SET ${fields.join(', ')} WHERE id = ?`, values);
    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新场景错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 删除场景
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    dbRun(db, 'DELETE FROM scenes WHERE id = ?', [id]);
    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('删除场景错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 批量更新状态
router.post('/batch-status', (req, res) => {
  try {
    const db = getDb();
    const { ids, status } = req.body;

    if (!ids || !ids.length || !status) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const placeholders = ids.map(() => '?').join(',');
    dbRun(db, `UPDATE scenes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, [status, ...ids]);
    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('批量更新状态错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
