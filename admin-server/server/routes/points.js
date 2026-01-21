const express = require('express');
const router = express.Router();
const { getOne, getAll, run } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// 判断是否使用共享数据库（小程序数据库）
const isSharedDb = !!process.env.SHARED_DB_PATH;

// 获取表名和字段（兼容两种数据库）
const getPointsRecordTable = () => isSharedDb ? 'points_records' : 'point_records';
const getUserIdField = () => isSharedDb ? 'id' : 'user_id';

// 生成记录ID
function generateRecordId() {
  return 'PR' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

// 获取用户醒币余额
router.get('/balance/:userId', (req, res) => {
  const { userId } = req.params;

  let user;
  if (isSharedDb) {
    // 同时支持按 id 或 openid 查询
    user = getOne('SELECT points FROM users WHERE id = ? OR openid = ?', [userId, userId]);
  } else {
    user = getOne('SELECT points FROM users WHERE user_id = ?', [userId]);
  }

  if (!user) {
    return res.json({ code: 200, data: { points: 0 } });
  }

  res.json({ code: 200, data: { points: user.points || 0 } });
});

// 获取醒币变动记录
router.get('/records', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, userId = '', type = '' } = req.query;
  const offset = (page - 1) * pageSize;
  const table = getPointsRecordTable();

  let conditions = [];
  let params = [];

  if (userId) {
    conditions.push('user_id = ?');
    params.push(userId);
  }

  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = getOne(`SELECT COUNT(*) as total FROM ${table} ${whereClause}`, params);
  const total = countResult?.total || 0;

  let records;
  if (isSharedDb) {
    // 小程序数据库：points_records 表，balance_after 字段
    records = getAll(`
      SELECT pr.id as record_id, pr.user_id, pr.type, pr.amount, pr.balance_after as balance,
             pr.description, pr.created_at, u.nickname, u.avatar_url
      FROM ${table} pr
      LEFT JOIN users u ON pr.user_id = u.id
      ${whereClause.replace('user_id', 'pr.user_id').replace('type', 'pr.type')}
      ORDER BY pr.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);
  } else {
    records = getAll(`
      SELECT pr.*, u.nickname, u.avatar_url
      FROM ${table} pr
      LEFT JOIN users u ON pr.user_id = u.user_id
      ${whereClause.replace('user_id', 'pr.user_id').replace('type', 'pr.type')}
      ORDER BY pr.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);
  }

  res.json({
    code: 200,
    data: {
      list: records,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }
  });
});

// 获取用户醒币记录
router.get('/records/:userId', (req, res) => {
  const { userId } = req.params;
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;
  const table = getPointsRecordTable();

  const countResult = getOne(`SELECT COUNT(*) as total FROM ${table} WHERE user_id = ?`, [userId]);
  const total = countResult?.total || 0;

  let records;
  if (isSharedDb) {
    records = getAll(`
      SELECT id as record_id, user_id, type, amount, balance_after as balance,
             description, created_at
      FROM ${table}
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(pageSize), offset]);
  } else {
    records = getAll(`
      SELECT * FROM ${table}
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(pageSize), offset]);
  }

  res.json({
    code: 200,
    data: {
      list: records,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }
  });
});

// 增加醒币（内部使用）
function addPoints(userId, amount, type, description, relatedId = null) {
  const userIdField = getUserIdField();
  const table = getPointsRecordTable();

  // 获取当前余额
  let user;
  if (isSharedDb) {
    user = getOne('SELECT points FROM users WHERE id = ?', [userId]);
  } else {
    user = getOne('SELECT points FROM users WHERE user_id = ?', [userId]);
  }
  let currentBalance = user?.points || 0;

  // 如果用户不存在，创建用户
  if (!user) {
    if (isSharedDb) {
      run('INSERT INTO users (id, points) VALUES (?, ?)', [userId, 0]);
    } else {
      run('INSERT INTO users (user_id, points) VALUES (?, ?)', [userId, 0]);
    }
    currentBalance = 0;
  }

  const newBalance = currentBalance + amount;

  // 更新用户余额
  if (isSharedDb) {
    run('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, userId]);
  } else {
    run('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [newBalance, userId]);
  }

  // 记录变动
  const recordId = generateRecordId();
  if (isSharedDb) {
    run(`
      INSERT INTO ${table} (id, user_id, type, amount, balance_after, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [recordId, userId, type, amount, newBalance, description]);
  } else {
    run(`
      INSERT INTO ${table} (record_id, user_id, type, amount, balance, description, related_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [recordId, userId, type, amount, newBalance, description, relatedId]);
  }

  return { success: true, balance: newBalance, recordId };
}

// 扣除醒币（内部使用）
function deductPoints(userId, amount, type, description, relatedId = null) {
  const table = getPointsRecordTable();

  // 获取当前余额（同时支持按 id 或 openid 或 unionid 查询）
  let user;
  let actualUserId = userId;
  if (isSharedDb) {
    user = getOne('SELECT id, points FROM users WHERE id = ? OR openid = ? OR unionid = ?', [userId, userId, userId]);
    console.log('[deductPoints] 查询用户:', userId, '结果:', user ? `找到(id=${user.id})` : '未找到');
    if (user) {
      actualUserId = user.id; // 使用实际的用户ID
    }
  } else {
    user = getOne('SELECT points FROM users WHERE user_id = ?', [userId]);
  }

  if (!user) {
    console.log('[deductPoints] 用户不存在, userId:', userId);
    return { success: false, message: '用户不存在' };
  }

  const currentBalance = user.points || 0;
  if (currentBalance < amount) {
    return { success: false, message: '醒币余额不足', balance: currentBalance };
  }

  const newBalance = currentBalance - amount;

  // 更新用户余额
  if (isSharedDb) {
    run('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, actualUserId]);
  } else {
    run('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [newBalance, userId]);
  }

  // 记录变动（负数表示扣除）
  const recordId = generateRecordId();
  if (isSharedDb) {
    run(`
      INSERT INTO ${table} (id, user_id, type, amount, balance_after, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [recordId, actualUserId, type, -amount, newBalance, description]);
  } else {
    run(`
      INSERT INTO ${table} (record_id, user_id, type, amount, balance, description, related_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [recordId, userId, type, -amount, newBalance, description, relatedId]);
  }

  return { success: true, balance: newBalance, recordId };
}

// 获取醒币奖励配置
router.get('/rewards', (req, res) => {
  const rewards = getAll('SELECT * FROM point_rewards WHERE is_active = 1 ORDER BY id');
  res.json({ code: 200, data: rewards });
});

// 获取所有醒币奖励配置（管理后台用）
router.get('/rewards/all', authMiddleware, (req, res) => {
  const rewards = getAll('SELECT * FROM point_rewards ORDER BY id');
  res.json({ code: 200, data: rewards });
});

// 更新醒币奖励配置
router.put('/rewards/:type', authMiddleware, (req, res) => {
  const { type } = req.params;
  const { points, description, is_active } = req.body;

  const existing = getOne('SELECT * FROM point_rewards WHERE type = ?', [type]);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '奖励类型不存在' });
  }

  run(`
    UPDATE point_rewards
    SET points = ?, description = ?, is_active = ?
    WHERE type = ?
  `, [
    points ?? existing.points,
    description ?? existing.description,
    is_active ?? existing.is_active,
    type
  ]);

  const updated = getOne('SELECT * FROM point_rewards WHERE type = ?', [type]);
  res.json({ code: 200, message: '更新成功', data: updated });
});

// 获取充值套餐
router.get('/packages', (req, res) => {
  const packages = getAll('SELECT * FROM recharge_packages WHERE is_active = 1 ORDER BY sort_order');
  res.json({ code: 200, data: packages });
});

// 获取所有充值套餐（管理后台用）
router.get('/packages/all', authMiddleware, (req, res) => {
  const packages = getAll('SELECT * FROM recharge_packages ORDER BY sort_order');
  res.json({ code: 200, data: packages });
});

// 创建充值套餐
router.post('/packages', authMiddleware, (req, res) => {
  const { amount, points, bonus_points = 0, is_active = 1, sort_order = 0 } = req.body;

  if (!amount || !points) {
    return res.status(400).json({ code: 400, message: '金额和醒币数不能为空' });
  }

  const result = run(`
    INSERT INTO recharge_packages (amount, points, bonus_points, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `, [amount, points, bonus_points, is_active, sort_order]);

  const newPackage = getOne('SELECT * FROM recharge_packages WHERE id = ?', [result.lastInsertRowid]);
  res.json({ code: 200, message: '创建成功', data: newPackage });
});

// 更新充值套餐
router.put('/packages/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { amount, points, bonus_points, is_active, sort_order } = req.body;

  const existing = getOne('SELECT * FROM recharge_packages WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '套餐不存在' });
  }

  run(`
    UPDATE recharge_packages
    SET amount = ?, points = ?, bonus_points = ?, is_active = ?, sort_order = ?
    WHERE id = ?
  `, [
    amount ?? existing.amount,
    points ?? existing.points,
    bonus_points ?? existing.bonus_points,
    is_active ?? existing.is_active,
    sort_order ?? existing.sort_order,
    id
  ]);

  const updated = getOne('SELECT * FROM recharge_packages WHERE id = ?', [id]);
  res.json({ code: 200, message: '更新成功', data: updated });
});

// 删除充值套餐
router.delete('/packages/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  const existing = getOne('SELECT * FROM recharge_packages WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ code: 404, message: '套餐不存在' });
  }

  run('DELETE FROM recharge_packages WHERE id = ?', [id]);
  res.json({ code: 200, message: '删除成功' });
});

// 发放醒币（小程序调用）
router.post('/grant', (req, res) => {
  const { userId, type, relatedId } = req.body;
  const table = getPointsRecordTable();

  if (!userId || !type) {
    return res.status(400).json({ code: 400, message: '参数不完整' });
  }

  // 获取奖励配置
  const reward = getOne('SELECT * FROM point_rewards WHERE type = ? AND is_active = 1', [type]);
  if (!reward) {
    return res.status(400).json({ code: 400, message: '无效的奖励类型或奖励已禁用' });
  }

  // 新用户奖励只能领取一次
  if (type === 'new_user') {
    const existing = getOne(`SELECT id FROM ${table} WHERE user_id = ? AND type = ?`, [userId, 'new_user']);
    if (existing) {
      return res.json({ code: 200, message: '已领取过新用户奖励', data: { alreadyGranted: true } });
    }
  }

  // 分享奖励按照片去重（每张照片只能获得一次分享奖励）
  if (type === 'share_image') {
    if (!relatedId) {
      return res.status(400).json({ code: 400, message: '分享奖励需要提供照片ID' });
    }
    // 检查该照片是否已经领取过分享奖励
    const existingShare = getOne(`
      SELECT id FROM ${table}
      WHERE user_id = ? AND type = 'share_image' AND description LIKE ?
    `, [userId, `%${relatedId}%`]);
    if (existingShare) {
      return res.json({ code: 200, message: '该照片已领取过分享奖励', data: { alreadyGranted: true } });
    }
  }

  // 分享奖励的描述中包含照片ID，用于去重
  const description = type === 'share_image' && relatedId
    ? `${reward.description} [${relatedId}]`
    : reward.description;

  const result = addPoints(userId, reward.points, type, description, relatedId);
  res.json({
    code: 200,
    message: '醒币发放成功',
    data: {
      points: reward.points,
      balance: result.balance,
      recordId: result.recordId
    }
  });
});

// 消费醒币（小程序调用）
router.post('/consume', (req, res) => {
  const { userId, amount, description, relatedId } = req.body;

  if (!userId || !amount) {
    return res.status(400).json({ code: 400, message: '参数不完整' });
  }

  const result = deductPoints(userId, amount, 'consume', description || '服务消费', relatedId);

  if (!result.success) {
    return res.json({ code: 400, message: result.message, data: { balance: result.balance } });
  }

  res.json({
    code: 200,
    message: '消费成功',
    data: {
      balance: result.balance,
      recordId: result.recordId
    }
  });
});

// 手动调整醒币（管理后台用）
router.post('/adjust', authMiddleware, (req, res) => {
  const { userId, amount, description } = req.body;

  if (!userId || amount === undefined) {
    return res.status(400).json({ code: 400, message: '参数不完整' });
  }

  let result;
  if (amount > 0) {
    result = addPoints(userId, amount, 'admin_adjust', description || '管理员手动增加');
  } else if (amount < 0) {
    result = deductPoints(userId, Math.abs(amount), 'admin_adjust', description || '管理员手动扣除');
  } else {
    return res.status(400).json({ code: 400, message: '调整金额不能为0' });
  }

  if (!result.success) {
    return res.status(400).json({ code: 400, message: result.message });
  }

  res.json({ code: 200, message: '调整成功', data: { balance: result.balance } });
});

// 醒币统计
router.get('/stats', authMiddleware, (req, res) => {
  const table = getPointsRecordTable();

  // 总发放醒币
  const totalGranted = getOne(`
    SELECT COALESCE(SUM(amount), 0) as total FROM ${table} WHERE amount > 0
  `) || { total: 0 };

  // 总消费醒币
  const totalConsumed = getOne(`
    SELECT COALESCE(ABS(SUM(amount)), 0) as total FROM ${table} WHERE amount < 0
  `) || { total: 0 };

  // 总充值金额 - 小程序数据库使用 orders 表
  let totalRecharge = { total: 0 };
  if (isSharedDb) {
    totalRecharge = getOne(`
      SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 'paid'
    `) || { total: 0 };
  } else {
    totalRecharge = getOne(`
      SELECT COALESCE(SUM(amount), 0) as total FROM recharge_orders WHERE status = 'paid'
    `) || { total: 0 };
  }

  // 各类型统计
  const byType = getAll(`
    SELECT type,
           SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as granted,
           ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)) as consumed,
           COUNT(*) as count
    FROM ${table}
    GROUP BY type
  `);

  res.json({
    code: 200,
    data: {
      totalGranted: totalGranted.total,
      totalConsumed: totalConsumed.total,
      totalRecharge: totalRecharge.total,
      byType
    }
  });
});

// 增加充值接口（兼容原有逻辑）
router.post('/recharge', (req, res) => {
  const { userId, points, paymentId } = req.body;

  if (!userId || points === undefined) {
    return res.status(400).json({ code: 400, message: '参数不完整' });
  }

  const result = addPoints(userId, points, 'recharge', '用户充值', paymentId);
  res.json({
    code: 200,
    message: '充值成功',
    data: {
      balance: result.balance,
      recordId: result.recordId
    }
  });
});

// 迁移本地存储的消费记录到数据库
router.post('/migrate-local-orders', (req, res) => {
  const { userId, orders } = req.body;

  if (!userId || !orders || !Array.isArray(orders)) {
    return res.status(400).json({ code: 400, message: '参数不完整' });
  }

  const table = getPointsRecordTable();
  let migratedCount = 0;

  for (const order of orders) {
    try {
      // 检查是否已存在（通过时间戳去重）
      const existingRecord = getOne(
        `SELECT id FROM ${table} WHERE user_id = ? AND description = ? AND created_at LIKE ?`,
        [userId, order.description || `生成${order.count || 1}张${order.sceneName || '照片'}`,
         new Date(order.createTime).toISOString().split('T')[0] + '%']
      );

      if (existingRecord) {
        continue; // 跳过已存在的记录
      }

      const recordId = generateRecordId();
      const description = order.description || `生成${order.count || 1}张${order.sceneName || '照片'}`;
      const amount = -(order.points || 0); // 消费记录为负数
      const createdAt = order.createTime ? new Date(order.createTime).toISOString() : new Date().toISOString();

      if (isSharedDb) {
        run(`
          INSERT INTO ${table} (id, user_id, type, amount, balance_after, description, created_at)
          VALUES (?, ?, 'consume', ?, 0, ?, ?)
        `, [recordId, userId, amount, description, createdAt]);
      } else {
        run(`
          INSERT INTO ${table} (record_id, user_id, type, amount, balance, description, created_at)
          VALUES (?, ?, 'consume', ?, 0, ?, ?)
        `, [recordId, userId, amount, description, createdAt]);
      }

      migratedCount++;
    } catch (error) {
      console.error('[醒币] 迁移记录失败:', error, order);
    }
  }

  console.log(`[醒币] 迁移完成: userId=${userId}, 迁移${migratedCount}条记录`);

  res.json({
    code: 200,
    message: '迁移完成',
    data: { migratedCount }
  });
});

// 导出供其他模块使用的函数
module.exports = router;
module.exports.addPoints = addPoints;
module.exports.deductPoints = deductPoints;