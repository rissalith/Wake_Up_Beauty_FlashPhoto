/**
 * 品级方案管理路由
 * 支持创建可复用的品级方案，不同步骤可映射不同方案
 */
const express = require('express');
const router = express.Router();
const { getDb, dbRun, saveDatabase } = require('../../config/database');

// ==================== 品级方案 CRUD ====================

// 获取品级方案列表
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { category, isActive, page = 1, pageSize = 50 } = req.query;

    let sql = 'SELECT * FROM grade_schemes WHERE 1=1';
    const params = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (isActive !== undefined) {
      sql += ' AND is_active = ?';
      params.push(isActive === 'true' || isActive === '1' ? 1 : 0);
    }

    sql += ' ORDER BY sort_order ASC, id ASC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const schemes = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as count')).get(...params).count;

    // 获取每个方案的品级数量
    const schemesWithCount = schemes.map(scheme => {
      const gradeCount = db.prepare(
        'SELECT COUNT(*) as count FROM grade_definitions WHERE scheme_id = ?'
      ).get(scheme.id).count;
      return { ...scheme, gradeCount };
    });

    res.json({
      code: 0,
      data: {
        list: schemesWithCount,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取品级方案列表错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取单个方案详情（含品级列表）
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const scheme = db.prepare('SELECT * FROM grade_schemes WHERE id = ?').get(id);
    if (!scheme) {
      return res.status(404).json({ code: -1, msg: '方案不存在' });
    }

    const grades = db.prepare(
      'SELECT * FROM grade_definitions WHERE scheme_id = ? ORDER BY sort_order ASC, id ASC'
    ).all(id);

    // 解析 style_config JSON
    const gradesWithParsedStyle = grades.map(grade => ({
      ...grade,
      styleConfig: grade.style_config ? JSON.parse(grade.style_config) : null
    }));

    res.json({
      code: 0,
      data: {
        ...scheme,
        grades: gradesWithParsedStyle
      }
    });
  } catch (error) {
    console.error('获取方案详情错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 创建品级方案
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { schemeKey, name, nameEn, description, category, isSystem, sortOrder } = req.body;

    if (!schemeKey || !name) {
      return res.status(400).json({ code: -1, msg: '方案标识和名称不能为空' });
    }

    // 检查 schemeKey 是否已存在
    const existing = db.prepare('SELECT id FROM grade_schemes WHERE scheme_key = ?').get(schemeKey);
    if (existing) {
      return res.status(400).json({ code: -1, msg: '方案标识已存在' });
    }

    const result = dbRun(db, `
      INSERT INTO grade_schemes (scheme_key, name, name_en, description, category, is_system, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      schemeKey,
      name,
      nameEn || null,
      description || null,
      category || 'general',
      isSystem ? 1 : 0,
      sortOrder || 0
    ]);

    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { id: result.lastInsertRowid }
    });
  } catch (error) {
    console.error('创建品级方案错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新品级方案
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, nameEn, description, category, isActive, sortOrder } = req.body;

    const existing = db.prepare('SELECT * FROM grade_schemes WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ code: -1, msg: '方案不存在' });
    }

    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (nameEn !== undefined) { fields.push('name_en = ?'); values.push(nameEn); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (category !== undefined) { fields.push('category = ?'); values.push(category); }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }

    if (fields.length === 0) {
      return res.status(400).json({ code: -1, msg: '没有可更新的字段' });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    dbRun(db, `UPDATE grade_schemes SET ${fields.join(', ')} WHERE id = ?`, values);
    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新品级方案错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 删除品级方案
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM grade_schemes WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ code: -1, msg: '方案不存在' });
    }

    // 检查是否为系统预设
    if (existing.is_system) {
      return res.status(400).json({ code: -1, msg: '系统预设方案不可删除' });
    }

    // 检查是否有步骤在使用此方案
    const mappings = db.prepare(
      'SELECT COUNT(*) as count FROM step_scheme_mappings WHERE scheme_id = ?'
    ).get(id).count;

    if (mappings > 0) {
      return res.status(400).json({ code: -1, msg: `该方案正在被 ${mappings} 个步骤使用，无法删除` });
    }

    // 删除方案（级联删除品级定义）
    dbRun(db, 'DELETE FROM grade_schemes WHERE id = ?', [id]);
    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('删除品级方案错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 复制品级方案
router.post('/:id/duplicate', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { newSchemeKey, newName } = req.body;

    if (!newSchemeKey || !newName) {
      return res.status(400).json({ code: -1, msg: '新方案标识和名称不能为空' });
    }

    // 检查原方案是否存在
    const original = db.prepare('SELECT * FROM grade_schemes WHERE id = ?').get(id);
    if (!original) {
      return res.status(404).json({ code: -1, msg: '原方案不存在' });
    }

    // 检查新 schemeKey 是否已存在
    const existing = db.prepare('SELECT id FROM grade_schemes WHERE scheme_key = ?').get(newSchemeKey);
    if (existing) {
      return res.status(400).json({ code: -1, msg: '新方案标识已存在' });
    }

    // 复制方案
    const schemeResult = dbRun(db, `
      INSERT INTO grade_schemes (scheme_key, name, name_en, description, category, is_system, sort_order)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `, [
      newSchemeKey,
      newName,
      original.name_en ? `${original.name_en} (Copy)` : null,
      original.description,
      original.category,
      original.sort_order
    ]);

    const newSchemeId = schemeResult.lastInsertRowid;

    // 复制品级定义
    const grades = db.prepare('SELECT * FROM grade_definitions WHERE scheme_id = ?').all(id);
    const insertGrade = db.prepare(`
      INSERT INTO grade_definitions (scheme_id, grade_key, name, name_en, description, weight, probability, prompt_text, style_config, color, bg_color, text_color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const grade of grades) {
      insertGrade.run(
        newSchemeId,
        grade.grade_key,
        grade.name,
        grade.name_en,
        grade.description,
        grade.weight,
        grade.probability,
        grade.prompt_text,
        grade.style_config,
        grade.color,
        grade.bg_color,
        grade.text_color,
        grade.sort_order
      );
    }

    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { id: newSchemeId }
    });
  } catch (error) {
    console.error('复制品级方案错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 品级定义 CRUD ====================

// 获取方案下的品级列表
router.get('/:schemeId/grades', (req, res) => {
  try {
    const db = getDb();
    const { schemeId } = req.params;

    const grades = db.prepare(
      'SELECT * FROM grade_definitions WHERE scheme_id = ? ORDER BY sort_order ASC, id ASC'
    ).all(schemeId);

    // 解析 style_config JSON
    const gradesWithParsedStyle = grades.map(grade => ({
      ...grade,
      styleConfig: grade.style_config ? JSON.parse(grade.style_config) : null
    }));

    res.json({ code: 0, data: gradesWithParsedStyle });
  } catch (error) {
    console.error('获取品级列表错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 添加品级
router.post('/:schemeId/grades', (req, res) => {
  try {
    const db = getDb();
    const { schemeId } = req.params;
    const {
      gradeKey, name, nameEn, description, weight, probability,
      promptText, styleConfig, color, bgColor, textColor, sortOrder
    } = req.body;

    if (!name) {
      return res.status(400).json({ code: -1, msg: '品级名称不能为空' });
    }

    // 自动生成 gradeKey（如果未提供）
    const finalGradeKey = gradeKey || `grade_${Date.now()}`;

    // 检查 gradeKey 是否在该方案中已存在
    const existing = db.prepare(
      'SELECT id FROM grade_definitions WHERE scheme_id = ? AND grade_key = ?'
    ).get(schemeId, finalGradeKey);

    if (existing) {
      return res.status(400).json({ code: -1, msg: '该方案中已存在相同的品级标识' });
    }

    const result = dbRun(db, `
      INSERT INTO grade_definitions (scheme_id, grade_key, name, name_en, description, weight, probability, prompt_text, style_config, color, bg_color, text_color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      schemeId,
      finalGradeKey,
      name,
      nameEn || null,
      description || null,
      weight || 100,
      probability || null,
      promptText || null,
      styleConfig ? JSON.stringify(styleConfig) : null,
      color || '#409eff',
      bgColor || null,
      textColor || null,
      sortOrder || 0
    ]);

    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: { id: result.lastInsertRowid, gradeKey: finalGradeKey }
    });
  } catch (error) {
    console.error('添加品级错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新品级
router.put('/:schemeId/grades/:gradeId', (req, res) => {
  try {
    const db = getDb();
    const { gradeId } = req.params;
    const {
      gradeKey, name, nameEn, description, weight, probability,
      promptText, styleConfig, color, bgColor, textColor, sortOrder, isActive
    } = req.body;

    const fields = [];
    const values = [];

    if (gradeKey !== undefined) { fields.push('grade_key = ?'); values.push(gradeKey); }
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (nameEn !== undefined) { fields.push('name_en = ?'); values.push(nameEn); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (weight !== undefined) { fields.push('weight = ?'); values.push(weight); }
    if (probability !== undefined) { fields.push('probability = ?'); values.push(probability); }
    if (promptText !== undefined) { fields.push('prompt_text = ?'); values.push(promptText); }
    if (styleConfig !== undefined) {
      fields.push('style_config = ?');
      values.push(styleConfig ? JSON.stringify(styleConfig) : null);
    }
    if (color !== undefined) { fields.push('color = ?'); values.push(color); }
    if (bgColor !== undefined) { fields.push('bg_color = ?'); values.push(bgColor); }
    if (textColor !== undefined) { fields.push('text_color = ?'); values.push(textColor); }
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ code: -1, msg: '没有可更新的字段' });
    }

    values.push(gradeId);
    dbRun(db, `UPDATE grade_definitions SET ${fields.join(', ')} WHERE id = ?`, values);
    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新品级错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 删除品级
router.delete('/:schemeId/grades/:gradeId', (req, res) => {
  try {
    const db = getDb();
    const { gradeId } = req.params;

    dbRun(db, 'DELETE FROM grade_definitions WHERE id = ?', [gradeId]);
    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('删除品级错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 批量更新品级排序
router.put('/:schemeId/grades/reorder', (req, res) => {
  try {
    const db = getDb();
    const { schemeId } = req.params;
    const { gradeIds } = req.body;

    if (!gradeIds || !Array.isArray(gradeIds)) {
      return res.status(400).json({ code: -1, msg: '品级ID列表不能为空' });
    }

    const updateStmt = db.prepare('UPDATE grade_definitions SET sort_order = ? WHERE id = ? AND scheme_id = ?');

    const updateMany = db.transaction((ids) => {
      ids.forEach((id, index) => {
        updateStmt.run(index, id, schemeId);
      });
    });

    updateMany(gradeIds);
    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新品级排序错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 步骤-方案映射 ====================

// 获取步骤的品级方案映射
router.get('/mapping/:sceneId/:stepKey', (req, res) => {
  try {
    const db = getDb();
    const { sceneId, stepKey } = req.params;

    const mapping = db.prepare(`
      SELECT m.*, s.name as scheme_name, s.scheme_key
      FROM step_scheme_mappings m
      JOIN grade_schemes s ON m.scheme_id = s.id
      WHERE m.scene_id = ? AND m.step_key = ?
    `).get(sceneId, stepKey);

    if (!mapping) {
      return res.json({ code: 0, data: null });
    }

    // 获取方案的品级列表
    const grades = db.prepare(
      'SELECT * FROM grade_definitions WHERE scheme_id = ? ORDER BY sort_order ASC'
    ).all(mapping.scheme_id);

    res.json({
      code: 0,
      data: {
        ...mapping,
        grades: grades.map(g => ({
          ...g,
          styleConfig: g.style_config ? JSON.parse(g.style_config) : null
        }))
      }
    });
  } catch (error) {
    console.error('获取步骤方案映射错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 设置步骤的品级方案
router.put('/mapping/:sceneId/:stepKey', (req, res) => {
  try {
    const db = getDb();
    const { sceneId, stepKey } = req.params;
    const { schemeId } = req.body;

    if (!schemeId) {
      return res.status(400).json({ code: -1, msg: '方案ID不能为空' });
    }

    // 检查方案是否存在
    const scheme = db.prepare('SELECT id FROM grade_schemes WHERE id = ?').get(schemeId);
    if (!scheme) {
      return res.status(404).json({ code: -1, msg: '方案不存在' });
    }

    // 使用 REPLACE 实现 upsert
    dbRun(db, `
      INSERT OR REPLACE INTO step_scheme_mappings (scene_id, step_key, scheme_id)
      VALUES (?, ?, ?)
    `, [sceneId, stepKey, schemeId]);

    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('设置步骤方案映射错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 移除步骤的品级方案映射
router.delete('/mapping/:sceneId/:stepKey', (req, res) => {
  try {
    const db = getDb();
    const { sceneId, stepKey } = req.params;

    dbRun(db, 'DELETE FROM step_scheme_mappings WHERE scene_id = ? AND step_key = ?', [sceneId, stepKey]);
    saveDatabase();

    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('移除步骤方案映射错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
