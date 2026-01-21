const express = require('express');
const router = express.Router();
const { getOne, getAll, run } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// 获取优惠券列表
router.get('/', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, userId = '', used = '', type = '' } = req.query;
  const offset = (page - 1) * pageSize;

  let conditions = [];
  let params = [];

  if (userId) {
    conditions.push('user_id = ?');
    params.push(userId);
  }

  if (used !== '') {
    conditions.push('used = ?');
    params.push(used === 'true' ? 1 : 0);
  }

  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = getOne(`SELECT COUNT(*) as total FROM coupons ${whereClause}`, params);
  const total = countResult?.total || 0;

  const coupons = getAll(`
    SELECT * FROM coupons
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, parseInt(pageSize), offset]);

  res.json({
    code: 200,
    data: {
      list: coupons,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }
  });
});

// 获取优惠券类型列表
router.get('/types', authMiddleware, (req, res) => {
  const types = getAll('SELECT * FROM coupon_types ORDER BY created_at DESC');
  res.json({ code: 200, data: types });
});

// 创建优惠券类型
router.post('/types', authMiddleware, (req, res) => {
  const { name, amount, type, valid_days, condition_text, is_active = 1 } = req.body;

  if (!name || !amount || !type) {
    return res.status(400).json({ code: 400, message: '名称、金额、类型不能为空' });
  }

  const result = run(`
    INSERT INTO coupon_types (name, amount, type, valid_days, condition_text, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [name, amount, type, valid_days || null, condition_text || '', is_active]);

  const newType = getOne('SELECT * FROM coupon_types WHERE id = ?', [result.lastInsertRowid]);

  res.json({ code: 200, message: '创建成功', data: newType });
});

// 更新优惠券类型
router.put('/types/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { name, amount, type, valid_days, condition_text, is_active } = req.body;

  const existing = getOne('SELECT * FROM coupon_types WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '优惠券类型不存在' });
  }

  run(`
    UPDATE coupon_types
    SET name = ?, amount = ?, type = ?, valid_days = ?, condition_text = ?, is_active = ?
    WHERE id = ?
  `, [
    name || existing.name,
    amount ?? existing.amount,
    type || existing.type,
    valid_days ?? existing.valid_days,
    condition_text ?? existing.condition_text,
    is_active ?? existing.is_active,
    id
  ]);

  const updated = getOne('SELECT * FROM coupon_types WHERE id = ?', [id]);
  res.json({ code: 200, message: '更新成功', data: updated });
});

// 删除优惠券类型
router.delete('/types/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  const existing = getOne('SELECT * FROM coupon_types WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '优惠券类型不存在' });
  }

  run('DELETE FROM coupon_types WHERE id = ?', [id]);
  res.json({ code: 200, message: '删除成功' });
});

// 优惠券统计
router.get('/stats', authMiddleware, (req, res) => {
  const totalIssued = getOne('SELECT COUNT(*) as count FROM coupons') || { count: 0 };
  const totalUsed = getOne('SELECT COUNT(*) as count FROM coupons WHERE used = 1') || { count: 0 };

  const typeStats = getAll(`
    SELECT type, COUNT(*) as total, SUM(CASE WHEN used = 1 THEN 1 ELSE 0 END) as used
    FROM coupons GROUP BY type
  `);

  res.json({
    code: 200,
    data: {
      totalIssued: totalIssued.count,
      totalUsed: totalUsed.count,
      byType: typeStats
    }
  });
});

module.exports = router;
