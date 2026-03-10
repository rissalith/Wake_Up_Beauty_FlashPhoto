/**
 * 后台场景管理路由
 */
const express = require('express');
const router = express.Router();
const { getDb, dbRun } = require('../../config/database');

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

// 场景管理已改为只读模式（硬编码配置）
// POST、PUT、DELETE 操作已禁用

// 创建场景 - 已禁用
router.post('/', (req, res) => {
  res.status(405).json({ code: -1, msg: '场景管理已改为只读模式，不支持创建' });
});

// 更新场景 - 已禁用
router.put('/:id', (req, res) => {
  res.status(405).json({ code: -1, msg: '场景管理已改为只读模式，不支持编辑' });
});

// 删除场景 - 已禁用
router.delete('/:id', (req, res) => {
  res.status(405).json({ code: -1, msg: '场景管理已改为只读模式，不支持删除' });
});

// 批量更新状态 - 已禁用
router.post('/batch-status', (req, res) => {
  res.status(405).json({ code: -1, msg: '场景管理已改为只读模式，不支持批量操作' });
});

// ==================== 词组池管理 ====================

// 获取场景词组池列表
router.get('/:sceneId/phrases', (req, res) => {
  try {
    const db = getDb();
    const { sceneId } = req.params;
    const { rarity, page = 1, pageSize = 100 } = req.query;

    let sql = 'SELECT * FROM random_phrase_pool WHERE scene_id = ?';
    const params = [sceneId];

    if (rarity) {
      sql += ' AND rarity = ?';
      params.push(rarity);
    }

    sql += ' ORDER BY rarity DESC, weight DESC, id ASC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const phrases = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as count')).get(...params).count;

    res.json({
      code: 0,
      data: { list: phrases, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('获取词组池错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 添加词组
router.post('/:sceneId/phrases', (req, res) => {
  try {
    const db = getDb();
    const { sceneId } = req.params;
    const { phrase, phraseEn, rarity, weight, promptText } = req.body;

    if (!phrase) {
      return res.status(400).json({ code: -1, msg: '词组不能为空' });
    }

    const result = dbRun(db, `
      INSERT INTO random_phrase_pool (scene_id, phrase, phrase_en, rarity, weight, prompt_text)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [sceneId, phrase, phraseEn || null, rarity || 'common', weight || 100, promptText || phrase]);

    res.json({ code: 0, msg: 'success', data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('添加词组错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 批量添加词组
router.post('/:sceneId/phrases/batch', (req, res) => {
  try {
    const db = getDb();
    const { sceneId } = req.params;
    const { phrases } = req.body;

    if (!phrases || !phrases.length) {
      return res.status(400).json({ code: -1, msg: '词组列表不能为空' });
    }

    const stmt = db.prepare(`
      INSERT INTO random_phrase_pool (scene_id, phrase, phrase_en, rarity, weight, prompt_text)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items) => {
      for (const item of items) {
        stmt.run(
          sceneId,
          item.phrase,
          item.phraseEn || null,
          item.rarity || 'common',
          item.weight || 100,
          item.promptText || item.phrase
        );
      }
    });

    insertMany(phrases);

    res.json({ code: 0, msg: 'success', data: { count: phrases.length } });
  } catch (error) {
    console.error('批量添加词组错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新词组
router.put('/:sceneId/phrases/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { phrase, phraseEn, rarity, weight, promptText, isActive } = req.body;

    const fields = [];
    const values = [];

    if (phrase !== undefined) { fields.push('phrase = ?'); values.push(phrase); }
    if (phraseEn !== undefined) { fields.push('phrase_en = ?'); values.push(phraseEn); }
    if (rarity !== undefined) { fields.push('rarity = ?'); values.push(rarity); }
    if (weight !== undefined) { fields.push('weight = ?'); values.push(weight); }
    if (promptText !== undefined) { fields.push('prompt_text = ?'); values.push(promptText); }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ code: -1, msg: '没有可更新的字段' });
    }

    values.push(id);
    dbRun(db, `UPDATE random_phrase_pool SET ${fields.join(', ')} WHERE id = ?`, values);

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新词组错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 删除词组
router.delete('/:sceneId/phrases/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    dbRun(db, 'DELETE FROM random_phrase_pool WHERE id = ?', [id]);

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('删除词组错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 马品级管理 ====================

// 获取场景马品级列表
router.get('/:sceneId/horse-grades', (req, res) => {
  try {
    const db = getDb();
    const { sceneId } = req.params;

    const grades = db.prepare(`
      SELECT * FROM horse_grades WHERE scene_id = ? ORDER BY sort_order ASC
    `).all(sceneId);

    res.json({ code: 0, data: grades });
  } catch (error) {
    console.error('获取马品级错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 添加马品级
router.post('/:sceneId/horse-grades', (req, res) => {
  try {
    const db = getDb();
    const { sceneId } = req.params;
    const { gradeKey, name, nameEn, description, image, probability, promptText, sortOrder } = req.body;

    if (!gradeKey || !name || probability === undefined) {
      return res.status(400).json({ code: -1, msg: '品级key、名称和概率不能为空' });
    }

    const result = dbRun(db, `
      INSERT INTO horse_grades (scene_id, grade_key, name, name_en, description, image, probability, prompt_text, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [sceneId, gradeKey, name, nameEn || null, description || null, image || null, probability, promptText || null, sortOrder || 0]);

    res.json({ code: 0, msg: 'success', data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('添加马品级错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新马品级
router.put('/:sceneId/horse-grades/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { gradeKey, name, nameEn, description, image, probability, promptText, sortOrder, isActive } = req.body;

    const fields = [];
    const values = [];

    if (gradeKey !== undefined) { fields.push('grade_key = ?'); values.push(gradeKey); }
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (nameEn !== undefined) { fields.push('name_en = ?'); values.push(nameEn); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (image !== undefined) { fields.push('image = ?'); values.push(image); }
    if (probability !== undefined) { fields.push('probability = ?'); values.push(probability); }
    if (promptText !== undefined) { fields.push('prompt_text = ?'); values.push(promptText); }
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ code: -1, msg: '没有可更新的字段' });
    }

    values.push(id);
    dbRun(db, `UPDATE horse_grades SET ${fields.join(', ')} WHERE id = ?`, values);

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新马品级错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 删除马品级
router.delete('/:sceneId/horse-grades/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    dbRun(db, 'DELETE FROM horse_grades WHERE id = ?', [id]);

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('删除马品级错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 通用抽奖池 API ====================

// 确保 draw_pool 表存在（懒初始化，只执行一次）
let _drawPoolTableReady = false;
function ensureDrawPoolTable(db) {
  if (_drawPoolTableReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS draw_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id TEXT NOT NULL,
      step_key TEXT NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      image TEXT,
      rarity TEXT DEFAULT 'common',
      weight INTEGER DEFAULT 100,
      prompt_text TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_draw_pool_scene_step ON draw_pool(scene_id, step_key)');
  } catch (e) {}
  _drawPoolTableReady = true;
}

// 获取抽奖池列表
router.get('/:sceneId/draw-pool/:stepKey', (req, res) => {
  try {
    const db = getDb();
    ensureDrawPoolTable(db);

    const { sceneId, stepKey } = req.params;
    const { rarity, page = 1, pageSize = 100 } = req.query;

    let sql = 'SELECT * FROM draw_pool WHERE scene_id = ? AND step_key = ?';
    const params = [sceneId, stepKey];

    if (rarity) {
      sql += ' AND rarity = ?';
      params.push(rarity);
    }

    sql += ' ORDER BY rarity DESC, weight DESC, id ASC';

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const list = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as count')).get(...params).count;

    res.json({
      code: 0,
      data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (error) {
    console.error('获取抽奖池列表错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 添加抽奖池项目
router.post('/:sceneId/draw-pool/:stepKey', (req, res) => {
  try {
    const db = getDb();
    ensureDrawPoolTable(db);

    const { sceneId, stepKey } = req.params;
    const { name, nameEn, image, rarity, weight, promptText } = req.body;

    if (!name) {
      return res.status(400).json({ code: -1, msg: '名称不能为空' });
    }

    const result = dbRun(db, `
      INSERT INTO draw_pool (scene_id, step_key, name, name_en, image, rarity, weight, prompt_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [sceneId, stepKey, name, nameEn || null, image || null, rarity || 'common', weight || 100, promptText || name]);


    res.json({ code: 0, msg: 'success', data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('添加抽奖池项目错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 批量添加抽奖池项目
router.post('/:sceneId/draw-pool/:stepKey/batch', (req, res) => {
  try {
    const db = getDb();
    ensureDrawPoolTable(db);

    const { sceneId, stepKey } = req.params;
    const { items } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ code: -1, msg: '项目列表不能为空' });
    }

    const stmt = db.prepare(`
      INSERT INTO draw_pool (scene_id, step_key, name, name_en, image, rarity, weight, prompt_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((list) => {
      for (const item of list) {
        stmt.run(
          sceneId,
          stepKey,
          item.name,
          item.nameEn || null,
          item.image || null,
          item.rarity || 'common',
          item.weight || 100,
          item.promptText || item.name
        );
      }
    });

    insertMany(items);

    res.json({ code: 0, msg: 'success', data: { count: items.length } });
  } catch (error) {
    console.error('批量添加抽奖池项目错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新抽奖池项目
router.put('/:sceneId/draw-pool/:stepKey/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, nameEn, image, rarity, weight, promptText, isActive } = req.body;

    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (nameEn !== undefined) { fields.push('name_en = ?'); values.push(nameEn); }
    if (image !== undefined) { fields.push('image = ?'); values.push(image); }
    if (rarity !== undefined) { fields.push('rarity = ?'); values.push(rarity); }
    if (weight !== undefined) { fields.push('weight = ?'); values.push(weight); }
    if (promptText !== undefined) { fields.push('prompt_text = ?'); values.push(promptText); }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ code: -1, msg: '没有可更新的字段' });
    }

    values.push(id);
    dbRun(db, `UPDATE draw_pool SET ${fields.join(', ')} WHERE id = ?`, values);

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新抽奖池项目错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 删除抽奖池项目
router.delete('/:sceneId/draw-pool/:stepKey/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    dbRun(db, 'DELETE FROM draw_pool WHERE id = ?', [id]);

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('删除抽奖池项目错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 批量更新品级
router.put('/:sceneId/draw-pool/:stepKey/batch-rarity', (req, res) => {
  try {
    const db = getDb();
    const { sceneId, stepKey } = req.params;
    const { ids, rarity, weight } = req.body;

    if (!ids || !ids.length) {
      return res.status(400).json({ code: -1, msg: '请选择要更新的项目' });
    }
    if (!rarity) {
      return res.status(400).json({ code: -1, msg: '请选择品级' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const sql = `UPDATE draw_pool SET rarity = ?, weight = ? WHERE id IN (${placeholders}) AND scene_id = ? AND step_key = ?`;
    const params = [rarity, weight || 100, ...ids, sceneId, stepKey];

    dbRun(db, sql, params);

    res.json({ code: 0, msg: 'success', data: { updated: ids.length } });
  } catch (error) {
    console.error('批量更新品级错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 品级定义 API ====================

// 确保品级表存在（懒初始化，只执行一次）
let _gradesTableReady = false;
function ensureGradesTable(db) {
  if (_gradesTableReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS draw_pool_grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id TEXT NOT NULL,
      step_key TEXT NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      weight INTEGER DEFAULT 100,
      color TEXT DEFAULT '#409eff',
      prompt_text TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_draw_pool_grades_scene_step ON draw_pool_grades(scene_id, step_key)');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE draw_pool_grades ADD COLUMN prompt_text TEXT');
  } catch (e) {}
  _gradesTableReady = true;
}

// 获取品级列表
router.get('/:sceneId/draw-pool/:stepKey/grades', (req, res) => {
  try {
    const db = getDb();
    ensureGradesTable(db);

    const { sceneId, stepKey } = req.params;
    const grades = db.prepare(
      'SELECT * FROM draw_pool_grades WHERE scene_id = ? AND step_key = ? ORDER BY sort_order ASC, id ASC'
    ).all(sceneId, stepKey);

    res.json({ code: 0, data: grades });
  } catch (error) {
    console.error('获取品级列表错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 添加品级
router.post('/:sceneId/draw-pool/:stepKey/grades', (req, res) => {
  try {
    const db = getDb();
    ensureGradesTable(db);

    const { sceneId, stepKey } = req.params;
    const { name, nameEn, weight, color, sortOrder, promptText } = req.body;

    if (!name) {
      return res.status(400).json({ code: -1, msg: '品级名称不能为空' });
    }

    const result = dbRun(db, `
      INSERT INTO draw_pool_grades (scene_id, step_key, name, name_en, weight, color, prompt_text, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [sceneId, stepKey, name, nameEn || null, weight || 100, color || '#409eff', promptText || null, sortOrder || 0]);


    res.json({ code: 0, msg: 'success', data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('添加品级错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新品级
router.put('/:sceneId/draw-pool/:stepKey/grades/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, nameEn, weight, color, sortOrder, promptText } = req.body;

    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (nameEn !== undefined) { fields.push('name_en = ?'); values.push(nameEn); }
    if (weight !== undefined) { fields.push('weight = ?'); values.push(weight); }
    if (color !== undefined) { fields.push('color = ?'); values.push(color); }
    if (promptText !== undefined) { fields.push('prompt_text = ?'); values.push(promptText); }
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }

    if (fields.length === 0) {
      return res.status(400).json({ code: -1, msg: '没有可更新的字段' });
    }

    values.push(id);
    dbRun(db, `UPDATE draw_pool_grades SET ${fields.join(', ')} WHERE id = ?`, values);

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新品级错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 删除品级
router.delete('/:sceneId/draw-pool/:stepKey/grades/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    dbRun(db, 'DELETE FROM draw_pool_grades WHERE id = ?', [id]);

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('删除品级错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
