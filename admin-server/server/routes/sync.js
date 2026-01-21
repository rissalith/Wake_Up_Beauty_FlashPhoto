const express = require('express');
const router = express.Router();
const { getOne, run, saveDatabase } = require('../config/database');

// 将时间转换为北京时间格式 (UTC+8)
function toBeijingTime(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  // 转换为北京时间 (UTC+8)
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().slice(0, 19).replace('T', ' ');
}

// 获取当前北京时间
function getNowBeijingTime() {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().slice(0, 19).replace('T', ' ');
}

// 同步用户信息
router.post('/user', (req, res) => {
  const { user_id, openid, nickname, avatar_url, bind_email, is_new_user, points } = req.body;

  if (!user_id) {
    return res.status(400).json({ code: 400, message: 'user_id 不能为空' });
  }

  const existing = getOne('SELECT id FROM users WHERE user_id = ?', [user_id]);
  const nowTime = getNowBeijingTime();

  if (existing) {
    run(`
      UPDATE users
      SET openid = COALESCE(?, openid),
          nickname = COALESCE(?, nickname),
          avatar_url = COALESCE(?, avatar_url),
          bind_email = COALESCE(?, bind_email),
          is_new_user = COALESCE(?, is_new_user),
          points = COALESCE(?, points),
          updated_at = ?
      WHERE user_id = ?
    `, [openid, nickname, avatar_url, bind_email, is_new_user, points, nowTime, user_id]);
  } else {
    run(`
      INSERT INTO users (user_id, openid, nickname, avatar_url, bind_email, is_new_user, points, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [user_id, openid || null, nickname || null, avatar_url || null, bind_email || null, is_new_user ?? 1, points || 0, nowTime]);
  }

  res.json({ code: 200, message: '同步成功' });
});

// 同步订单
router.post('/order', (req, res) => {
  const { order_id, user_id, amount, original_amount, points_used, points_original, coupon_name, coupon_amount, photo_count, status, created_at } = req.body;

  if (!order_id || !user_id) {
    return res.status(400).json({ code: 400, message: 'order_id 和 user_id 不能为空' });
  }

  const existing = getOne('SELECT id FROM orders WHERE order_id = ?', [order_id]);
  const timeToStore = toBeijingTime(created_at) || getNowBeijingTime();

  if (existing) {
    run(`
      UPDATE orders
      SET amount = COALESCE(?, amount),
          original_amount = COALESCE(?, original_amount),
          points_used = COALESCE(?, points_used),
          points_original = COALESCE(?, points_original),
          coupon_name = COALESCE(?, coupon_name),
          coupon_amount = COALESCE(?, coupon_amount),
          photo_count = COALESCE(?, photo_count),
          status = COALESCE(?, status)
      WHERE order_id = ?
    `, [amount, original_amount, points_used, points_original, coupon_name, coupon_amount, photo_count, status, order_id]);
  } else {
    run(`
      INSERT INTO orders (order_id, user_id, amount, original_amount, points_used, points_original, coupon_name, coupon_amount, photo_count, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [order_id, user_id, amount || 0, original_amount || 0, points_used || 0, points_original || 0, coupon_name || null, coupon_amount || 0, photo_count || 1, status || 'completed', timeToStore]);
  }

  res.json({ code: 200, message: '同步成功' });
});

// 同步照片记录
router.post('/photo', (req, res) => {
  const { photo_id, user_id, original_image, result_image, spec, bg_color, status, created_at } = req.body;

  if (!photo_id || !user_id) {
    return res.status(400).json({ code: 400, message: 'photo_id 和 user_id 不能为空' });
  }

  // 判断使用哪个表（共享数据库用 photo_history，独立数据库用 photos）
  const isSharedDb = !!process.env.SHARED_DB_PATH;
  const tableName = isSharedDb ? 'photo_history' : 'photos';
  const idField = isSharedDb ? 'id' : 'photo_id';
  const originalField = isSharedDb ? 'original_url' : 'original_image';
  const resultField = isSharedDb ? 'result_url' : 'result_image';

  const existing = getOne(`SELECT id FROM ${tableName} WHERE ${idField} = ?`, [photo_id]);
  const timeToStore = toBeijingTime(created_at) || getNowBeijingTime();

  if (existing) {
    run(`
      UPDATE ${tableName}
      SET ${originalField} = COALESCE(?, ${originalField}),
          ${resultField} = COALESCE(?, ${resultField}),
          spec = COALESCE(?, spec),
          bg_color = COALESCE(?, bg_color),
          status = COALESCE(?, status)
      WHERE ${idField} = ?
    `, [original_image, result_image, spec, bg_color, status, photo_id]);
  } else {
    if (isSharedDb) {
      run(`
        INSERT INTO ${tableName} (id, user_id, original_url, result_url, spec, bg_color, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [photo_id, user_id, original_image || null, result_image || null, spec || null, bg_color || null, status || 'done', timeToStore]);
    } else {
      run(`
        INSERT INTO ${tableName} (photo_id, user_id, original_image, result_image, spec, bg_color, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [photo_id, user_id, original_image || null, result_image || null, spec || null, bg_color || null, status || 'done', timeToStore]);
    }
  }

  res.json({ code: 200, message: '同步成功' });
});

// 同步优惠券
router.post('/coupon', (req, res) => {
  const { coupon_id, user_id, name, amount, type, used, expire_time, created_at } = req.body;

  if (!coupon_id || !user_id) {
    return res.status(400).json({ code: 400, message: 'coupon_id 和 user_id 不能为空' });
  }

  const existing = getOne('SELECT id FROM coupons WHERE coupon_id = ?', [coupon_id]);
  const timeToStore = toBeijingTime(created_at) || getNowBeijingTime();

  if (existing) {
    run(`
      UPDATE coupons
      SET name = COALESCE(?, name),
          amount = COALESCE(?, amount),
          type = COALESCE(?, type),
          used = COALESCE(?, used),
          expire_time = COALESCE(?, expire_time)
      WHERE coupon_id = ?
    `, [name, amount, type, used, expire_time, coupon_id]);
  } else {
    run(`
      INSERT INTO coupons (coupon_id, user_id, name, amount, type, used, expire_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [coupon_id, user_id, name || '', amount || 0, type || '', used ?? 0, expire_time || null, timeToStore]);
  }

  res.json({ code: 200, message: '同步成功' });
});

// 获取用户照片历史（供小程序恢复缓存使用）
router.get('/photos/:userId', (req, res) => {
  const { userId } = req.params;
  const { page = 1, pageSize = 100 } = req.query;

  if (!userId) {
    return res.status(400).json({ code: 400, message: 'userId 不能为空' });
  }

  // 判断使用哪个表（共享数据库用 photo_history，独立数据库用 photos）
  const isSharedDb = !!process.env.SHARED_DB_PATH;
  const tableName = isSharedDb ? 'photo_history' : 'photos';
  const idField = isSharedDb ? 'id' : 'photo_id';

  const offset = (page - 1) * pageSize;
  const { getAll } = require('../config/database');
  
  const photos = getAll(`
    SELECT ${idField} as photo_id, user_id, original_url as original_image, result_url as result_image, spec, bg_color, status, created_at
    FROM ${tableName}
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [userId, parseInt(pageSize), offset]);

  const countResult = getOne(`SELECT COUNT(*) as total FROM ${tableName} WHERE user_id = ?`, [userId]);

  res.json({
    code: 200,
    data: {
      list: photos || [],
      total: countResult?.total || 0,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }
  });
});

// 批量同步
router.post('/batch', (req, res) => {
  const { users = [], orders = [], photos = [], coupons = [] } = req.body;
  const nowTime = getNowBeijingTime();

  try {
    for (const u of users) {
      run(`INSERT OR REPLACE INTO users (user_id, openid, nickname, avatar_url, bind_email, is_new_user, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [u.user_id, u.openid, u.nickname, u.avatar_url, u.bind_email, u.is_new_user ?? 1, nowTime]);
    }
    for (const o of orders) {
      const orderTime = toBeijingTime(o.created_at) || nowTime;
      run(`INSERT OR REPLACE INTO orders (order_id, user_id, amount, original_amount, coupon_name, coupon_amount, photo_count, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [o.order_id, o.user_id, o.amount, o.original_amount, o.coupon_name, o.coupon_amount, o.photo_count, o.status, orderTime]);
    }
    for (const p of photos) {
      const photoTime = toBeijingTime(p.created_at) || nowTime;
      run(`INSERT OR REPLACE INTO photos (photo_id, user_id, original_image, result_image, spec, bg_color, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.photo_id, p.user_id, p.original_image, p.result_image, p.spec, p.bg_color, p.status, photoTime]);
    }
    for (const c of coupons) {
      const couponTime = toBeijingTime(c.created_at) || nowTime;
      run(`INSERT OR REPLACE INTO coupons (coupon_id, user_id, name, amount, type, used, expire_time, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.coupon_id, c.user_id, c.name, c.amount, c.type, c.used, c.expire_time, couponTime]);
    }

    saveDatabase();

    res.json({
      code: 200,
      message: '批量同步成功',
      data: {
        users: users.length,
        orders: orders.length,
        photos: photos.length,
        coupons: coupons.length
      }
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: '同步失败: ' + error.message });
  }
});

module.exports = router;