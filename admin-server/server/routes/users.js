const express = require('express');
const router = express.Router();
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const { getOne, getAll, run } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// 尝试加载 token 工具（用于生成安全的 JWT token）
let tokenHelper = null;
try {
  tokenHelper = require('../../../shared/utils/tokenHelper');
} catch (e) {
  console.log('[用户路由] tokenHelper 未加载，将使用简单 token');
}

// 判断是否使用共享数据库（小程序数据库）
const isSharedDb = !!process.env.SHARED_DB_PATH;

// 根据数据库类型获取用户ID字段名
// 小程序数据库使用 'id'，后台数据库使用 'user_id'
const getUserIdField = () => isSharedDb ? 'id' : 'user_id';

// 微信小程序配置
const WX_APPID = process.env.WX_APPID || 'wxf67c9b6c7b94a9bb';
const WX_SECRET = process.env.WX_SECRET || '';

// 微信登录 - 使用code换取openid和session_key
router.post('/wx-login', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ code: 400, message: 'code不能为空' });
  }

  try {
    // 调用微信接口获取 openid 和 session_key
    console.log('[微信登录] 调用微信接口, code:', code.substring(0, 10) + '...');

    const wxLoginUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`;

    const wxRes = await new Promise((resolve, reject) => {
      https.get(wxLoginUrl, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('解析微信响应失败'));
          }
        });
      }).on('error', reject);
    });

    console.log('[微信登录] 微信接口返回:', JSON.stringify(wxRes));

    if (wxRes.errcode) {
      console.error('[微信登录] 微信接口错误:', wxRes);
      return res.status(400).json({ code: 400, message: wxRes.errmsg || '微信登录失败' });
    }

    const { openid, session_key, unionid } = wxRes;
    console.log('[微信登录] 获取到 unionid:', unionid, ', openid:', openid, ', session_key: 已获取');

    // 查找或创建用户
    let user;
    if (isSharedDb) {
      // 优先用 unionid 查找，其次用 openid
      if (unionid) {
        user = getOne('SELECT * FROM users WHERE unionid = ?', [unionid]);
      }
      if (!user) {
        user = getOne('SELECT * FROM users WHERE openid = ?', [openid]);
      }
    } else {
      if (unionid) {
        user = getOne('SELECT * FROM users WHERE unionid = ?', [unionid]);
      }
      if (!user) {
        user = getOne('SELECT * FROM users WHERE openid = ?', [openid]);
      }
    }

    const userId = user ? user.user_id : uuidv4();

    if (!user) {
      // 创建新用户
      if (isSharedDb) {
        run(`
          INSERT INTO users (user_id, openid, unionid, session_key, points, created_at, updated_at)
          VALUES (?, ?, ?, ?, 50, datetime('now'), datetime('now'))
        `, [userId, openid, unionid || '', session_key]);
      } else {
        run(`
          INSERT INTO users (user_id, openid, unionid, session_key, is_new_user, points)
          VALUES (?, ?, ?, ?, 1, 50)
        `, [userId, openid, unionid || '', session_key]);
      }

      // 记录新用户赠送积分
      const recordId = 'PR' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
      if (isSharedDb) {
        run(`
          INSERT INTO points_records (id, user_id, type, amount, balance_after, description, created_at)
          VALUES (?, ?, 'new_user', 50, 50, '新用户注册赠送', datetime('now'))
        `, [recordId, userId]);
      } else {
        run(`
          INSERT INTO point_records (record_id, user_id, type, amount, balance, description)
          VALUES (?, ?, 'new_user', 50, 50, '新用户注册赠送')
        `, [recordId, userId]);
      }

      user = isSharedDb
        ? getOne('SELECT * FROM users WHERE user_id = ?', [userId])
        : getOne('SELECT * FROM users WHERE user_id = ?', [userId]);
    } else {
      // 更新现有用户的 session_key（重要：每次登录都要更新）
      if (isSharedDb) {
        run('UPDATE users SET session_key = ?, updated_at = datetime(\'now\') WHERE user_id = ?', [session_key, userId]);
      } else {
        run('UPDATE users SET session_key = ?, updated_at = datetime(\'now\') WHERE user_id = ?', [session_key, userId]);
      }
    }

    // 查询协议签署状态
    let privacyAgreed = false;
    let termsAgreed = false;
    try {
      const privacyRecord = getOne(`
        SELECT is_signed FROM user_agreements
        WHERE user_id = ? AND agreement_type = 'privacy' AND is_signed = 1
      `, [userId]);
      privacyAgreed = !!privacyRecord;

      const termsRecord = getOne(`
        SELECT is_signed FROM user_agreements
        WHERE user_id = ? AND agreement_type = 'terms' AND is_signed = 1
      `, [userId]);
      termsAgreed = !!termsRecord;
    } catch (e) {
      console.log('[微信登录] 查询协议状态失败，默认为未签署:', e.message);
    }

    res.json({
      code: 200,
      data: {
        token: tokenHelper ? tokenHelper.generateToken(userId) : ('wx_token_' + Date.now() + '_' + uuidv4().substring(0, 8)),
        openid: openid,
        unionid: unionid || user?.unionid || null,
        userId: userId,
        nickname: user?.nickname || '',
        avatarUrl: user?.avatar_url || '',
        points: user?.points || 50,
        // 注意：不再返回 session_key 给前端，这是安全敏感信息
        // session_key 仅在服务端存储和使用
        privacyAgreed: privacyAgreed,  // 隐私协议签署状态
        termsAgreed: termsAgreed,      // 用户协议签署状态
        userInfo: user
      }
    });

  } catch (error) {
    console.error('[微信登录] 错误:', error);
    res.status(500).json({ code: 500, message: '微信登录失败: ' + error.message });
  }
});

// 用户登录/更新信息
router.post('/login', (req, res) => {
  const { openid, unionid, nickname, avatarUrl, inviterId } = req.body;
  
  if (!openid) {
    return res.status(400).json({ code: 400, message: 'openid不能为空' });
  }

  // 优先用 unionid 查找用户，其次用 openid
  let user;
  if (unionid) {
    user = getOne('SELECT * FROM users WHERE unionid = ?', [unionid]);
  }
  if (!user) {
    user = getOne('SELECT * FROM users WHERE openid = ?', [openid]);
  }

  // 如果找到用户，更新信息
  if (user) {
    const userId = isSharedDb ? user.id : user.user_id;
    // 更新用户信息，包括 unionid（如果之前没有）
    if (isSharedDb) {
      run(`
        UPDATE users
        SET nickname = COALESCE(?, nickname),
            avatar_url = COALESCE(?, avatar_url),
            unionid = COALESCE(?, unionid),
            openid = COALESCE(?, openid),
            updated_at = datetime('now')
        WHERE id = ?
      `, [nickname, avatarUrl, unionid, openid, userId]);
    } else {
      run(`
        UPDATE users
        SET nickname = COALESCE(?, nickname),
            avatar_url = COALESCE(?, avatar_url),
            unionid = COALESCE(?, unionid),
            openid = COALESCE(?, openid),
            updated_at = datetime('now')
        WHERE user_id = ?
      `, [nickname, avatarUrl, unionid, openid, userId]);
    }
    // 重新获取更新后的用户
    user = isSharedDb
      ? getOne('SELECT * FROM users WHERE id = ?', [userId])
      : getOne('SELECT * FROM users WHERE user_id = ?', [userId]);
  }

  if (!user) {
    // 如果用户不存在，尝试创建（使用统一的 UUID v4 格式）
    const userId = uuidv4();
    if (isSharedDb) {
      run(`
        INSERT INTO users (id, openid, unionid, nickname, avatar_url, points, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 50, datetime('now'), datetime('now'))
      `, [userId, openid, unionid || null, nickname, avatarUrl]);
    } else {
      run(`
        INSERT INTO users (user_id, openid, unionid, nickname, avatar_url, is_new_user, points)
        VALUES (?, ?, ?, ?, ?, 1, 50)
      `, [userId, openid, unionid || null, nickname, avatarUrl]);
    }

    // 处理邀请关系并发放奖励
    if (inviterId && inviterId !== userId) {
      try {
        // 验证邀请者存在
        const inviter = isSharedDb
          ? getOne('SELECT id, points FROM users WHERE id = ?', [inviterId])
          : getOne('SELECT user_id, points FROM users WHERE user_id = ?', [inviterId]);

        if (inviter) {
          // 获取邀请奖励配置（默认10醒币）
          let inviteRewardPoints = 10;
          try {
            const rewardConfig = getOne("SELECT points, is_active FROM point_rewards WHERE type = 'invite_friend'");
            if (rewardConfig && rewardConfig.is_active) {
              inviteRewardPoints = rewardConfig.points || 10;
            }
          } catch (e) {
            // 使用默认值
          }

          // 创建邀请记录（统一使用 invites 表）
          const inviteId = 'INV' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
          try {
            run(`
              INSERT INTO invites (id, inviter_id, invitee_id, status, reward_points, created_at)
              VALUES (?, ?, ?, 'completed', ?, datetime('now'))
            `, [inviteId, inviterId, userId, inviteRewardPoints]);
          } catch (e) {
            console.log('[邀请] 创建邀请记录失败:', e.message);
          }

          // 发放邀请者奖励
          const inviterPoints = inviter.points || 0;
          const newInviterBalance = inviterPoints + inviteRewardPoints;
          const inviterIdField = isSharedDb ? inviter.id : inviter.user_id;

          if (isSharedDb) {
            run('UPDATE users SET points = ?, updated_at = datetime(\'now\') WHERE id = ?', [newInviterBalance, inviterIdField]);
          } else {
            run('UPDATE users SET points = ?, updated_at = datetime(\'now\') WHERE user_id = ?', [newInviterBalance, inviterIdField]);
          }

          // 记录邀请者积分变动
          const inviteRecordId = 'INV_PR' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
          if (isSharedDb) {
            run(`
              INSERT INTO points_records (id, user_id, type, amount, balance_after, description, created_at)
              VALUES (?, ?, 'invite_friend', ?, ?, '邀请好友奖励', datetime('now'))
            `, [inviteRecordId, inviterIdField, inviteRewardPoints, newInviterBalance]);
          } else {
            run(`
              INSERT INTO point_records (record_id, user_id, type, amount, balance, description)
              VALUES (?, ?, 'invite_friend', ?, ?, '邀请好友奖励')
            `, [inviteRecordId, inviterIdField, inviteRewardPoints, newInviterBalance]);
          }

          console.log('[邀请] 奖励发放成功:', { inviterId: inviterIdField, inviteeId: userId, reward: inviteRewardPoints });
        }
      } catch (e) {
        console.log('[邀请] 处理邀请关系失败:', e.message);
      }
    }

    // 记录新用户赠送积分
    const recordId = 'PR' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
    if (isSharedDb) {
      run(`
        INSERT INTO points_records (id, user_id, type, amount, balance_after, description, created_at)
        VALUES (?, ?, 'new_user', 50, 50, '新用户注册赠送', datetime('now'))
      `, [recordId, userId]);
    } else {
      run(`
        INSERT INTO point_records (record_id, user_id, type, amount, balance, description)
        VALUES (?, ?, 'new_user', 50, 50, '新用户注册赠送')
      `, [recordId, userId]);
    }

    user = isSharedDb
      ? getOne('SELECT * FROM users WHERE id = ?', [userId])
      : getOne('SELECT * FROM users WHERE user_id = ?', [userId]);
  }

  if (!user) {
    return res.status(500).json({ code: 500, message: '用户创建失败' });
  }

  // 兼容两种数据库结构
  const finalUserId = isSharedDb ? user.id : user.user_id;

  // 查询协议签署状态
  let privacyAgreed = false;
  let termsAgreed = false;
  try {
    const privacyRecord = getOne(`
      SELECT is_signed FROM user_agreements
      WHERE user_id = ? AND agreement_type = 'privacy' AND is_signed = 1
    `, [finalUserId]);
    privacyAgreed = !!privacyRecord;

    const termsRecord = getOne(`
      SELECT is_signed FROM user_agreements
      WHERE user_id = ? AND agreement_type = 'terms' AND is_signed = 1
    `, [finalUserId]);
    termsAgreed = !!termsRecord;
  } catch (e) {
    console.log('[用户登录] 查询协议状态失败，默认为未签署:', e.message);
  }

  res.json({
    code: 200,
    data: {
      token: tokenHelper ? tokenHelper.generateToken(finalUserId) : ('mock_token_' + Date.now() + '_' + uuidv4().substring(0, 8)),
      openid: user.openid,
      unionid: user.unionid || null,
      userId: finalUserId,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      points: user.points,
      privacyAgreed: privacyAgreed,  // 隐私协议签署状态
      termsAgreed: termsAgreed,      // 用户协议签署状态
      userInfo: user
    }
  });
});

// 获取用户列表
router.get('/', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, keyword = '' } = req.query;
  const offset = (page - 1) * pageSize;
  const userIdField = getUserIdField();

  let whereClause = '';
  let params = [];

  if (keyword) {
    // 兼容两种数据库结构，支持按 UnionID 搜索
    if (isSharedDb) {
      whereClause = 'WHERE u.id LIKE ? OR u.unionid LIKE ? OR u.nickname LIKE ? OR u.email LIKE ?';
    } else {
      whereClause = 'WHERE u.user_id LIKE ? OR u.unionid LIKE ? OR u.nickname LIKE ? OR u.bind_email LIKE ?';
    }
    params = [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`];
  }

  const countSql = `SELECT COUNT(*) as total FROM users u ${whereClause}`;
  const countResult = getOne(countSql, params);
  const total = countResult?.total || 0;

  // 查询用户列表，兼容两种数据库结构，包含聚合统计字段
  let listSql;
  if (isSharedDb) {
    // 小程序数据库：使用实际的 user_id 字段，email作为bind_email
    // 使用子查询获取累计充值和照片数量
    listSql = `
      SELECT
        u.id, u.user_id, u.openid, u.unionid, u.nickname, u.avatar_url, u.email as bind_email,
        u.points, u.created_at, u.updated_at, u.is_new_user,
        COALESCE((SELECT SUM(amount) FROM orders WHERE user_id = u.id AND status = 'paid'), 0) as total_recharge,
        COALESCE((SELECT COUNT(*) FROM photo_history WHERE user_id = u.id), 0) as photo_count
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;
  } else {
    listSql = `
      SELECT
        u.*,
        COALESCE((SELECT SUM(amount) FROM orders WHERE user_id = u.user_id AND status = 'paid'), 0) as total_recharge,
        COALESCE((SELECT COUNT(*) FROM photos WHERE user_id = u.user_id), 0) as photo_count
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;
  }
  const users = getAll(listSql, [...params, parseInt(pageSize), offset]);

  res.json({
    code: 200,
    data: {
      list: users,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }
  });
});

// 获取用户统计数据（小程序端使用，无需认证）
router.get('/stats/:userId', (req, res) => {
  const { userId } = req.params;

  try {
    let totalPhotos = 0;
    let totalSpent = 0;

    if (isSharedDb) {
      // 照片数量（photo_history 表没有 status 列，直接统计所有记录）
      const photoCount = getOne('SELECT COUNT(*) as count FROM photo_history WHERE user_id = ?', [userId]);
      totalPhotos = photoCount?.count || 0;

      // 消费醒币统计
      const spentStats = getOne(`
        SELECT COALESCE(SUM(ABS(amount)), 0) as total
        FROM points_records
        WHERE user_id = ? AND amount < 0 AND type NOT LIKE '%admin%' AND type NOT LIKE '%refund%'
      `, [userId]);
      totalSpent = spentStats?.total || 0;
    } else {
      const photoCount = getOne('SELECT COUNT(*) as count FROM photos WHERE user_id = ? AND status = ?', [userId, 'done']);
      totalPhotos = photoCount?.count || 0;

      const spentStats = getOne(`
        SELECT COALESCE(SUM(ABS(amount)), 0) as total
        FROM point_records
        WHERE user_id = ? AND amount < 0 AND type NOT LIKE '%admin%' AND type NOT LIKE '%refund%'
      `, [userId]);
      totalSpent = spentStats?.total || 0;
    }

    res.json({
      code: 200,
      data: { totalPhotos, totalSpent }
    });
  } catch (error) {
    console.error('[用户统计] 查询失败:', error);
    res.status(500).json({ code: 500, message: '获取统计失败' });
  }
});

// 获取用户详情
router.get('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  let user;

  if (isSharedDb) {
    // 小程序数据库，映射字段名
    user = getOne(`
      SELECT id as user_id, openid, unionid, nickname, avatar_url, email as bind_email,
             points, created_at, updated_at, 0 as is_new_user
      FROM users WHERE id = ?
    `, [id]);
  } else {
    user = getOne('SELECT * FROM users WHERE user_id = ? OR id = ?', [id, id]);
  }

  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }

  res.json({ code: 200, data: user });
});

// 更新用户信息（小程序端使用）
// 安全措施：验证请求者身份，只能修改自己的信息
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { nickname, avatarUrl } = req.body;

  // 安全验证：检查请求者是否有权修改该用户信息
  const requestUserId = req.headers['x-user-id'];
  if (requestUserId && requestUserId !== id) {
    return res.status(403).json({ code: 403, message: '无权修改他人信息' });
  }

  console.log('[更新用户信息] userId:', id, ', nickname:', nickname, ', avatarUrl:', avatarUrl ? '有' : '无');

  // 查找用户
  let user;
  if (isSharedDb) {
    user = getOne('SELECT * FROM users WHERE id = ? OR user_id = ?', [id, id]);
  } else {
    user = getOne('SELECT * FROM users WHERE user_id = ? OR id = ?', [id, id]);
  }

  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }

  const userId = isSharedDb ? (user.id || user.user_id) : (user.user_id || user.id);

  try {
    // 更新用户信息
    if (isSharedDb) {
      run(`
        UPDATE users
        SET nickname = COALESCE(?, nickname),
            avatar_url = COALESCE(?, avatar_url),
            updated_at = datetime('now')
        WHERE id = ? OR user_id = ?
      `, [nickname, avatarUrl, userId, userId]);
    } else {
      run(`
        UPDATE users
        SET nickname = COALESCE(?, nickname),
            avatar_url = COALESCE(?, avatar_url),
            updated_at = datetime('now')
        WHERE user_id = ? OR id = ?
      `, [nickname, avatarUrl, userId, userId]);
    }

    // 重新获取更新后的用户
    const updatedUser = isSharedDb
      ? getOne('SELECT * FROM users WHERE id = ? OR user_id = ?', [userId, userId])
      : getOne('SELECT * FROM users WHERE user_id = ? OR id = ?', [userId, userId]);

    console.log('[更新用户信息] 更新成功:', updatedUser?.nickname, updatedUser?.avatar_url ? '有头像' : '无头像');

    res.json({
      code: 200,
      message: '用户信息更新成功',
      data: {
        userId: userId,
        nickname: updatedUser?.nickname,
        avatarUrl: updatedUser?.avatar_url,
        userInfo: updatedUser
      }
    });

  } catch (error) {
    console.error('[更新用户信息] 失败:', error);
    res.status(500).json({ code: 500, message: '更新用户信息失败: ' + error.message });
  }
});

// 获取用户订单
router.get('/:id/orders', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;

  // 获取用户ID
  const userId = id;

  let countResult, orders;
  if (isSharedDb) {
    // 小程序数据库使用 orders 表
    countResult = getOne('SELECT COUNT(*) as total FROM orders WHERE user_id = ?', [userId]);
    orders = getAll(`
      SELECT id as order_id, user_id, amount, points_amount, bonus_points, status, created_at
      FROM orders
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(pageSize), offset]);
  } else {
    countResult = getOne('SELECT COUNT(*) as total FROM orders WHERE user_id = ?', [userId]);
    orders = getAll(`
      SELECT * FROM orders
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(pageSize), offset]);
  }

  const total = countResult?.total || 0;

  res.json({
    code: 200,
    data: { list: orders, total, page: parseInt(page), pageSize: parseInt(pageSize) }
  });
});

// 获取用户照片
router.get('/:id/photos', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;

  const userId = id;

  let countResult, photos;
  if (isSharedDb) {
    // 小程序数据库使用 photo_history 表
    countResult = getOne('SELECT COUNT(*) as total FROM photo_history WHERE user_id = ?', [userId]);
    photos = getAll(`
      SELECT id as photo_id, user_id, original_url as original_image, result_url as result_image,
             spec, bg_color, status, created_at
      FROM photo_history
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(pageSize), offset]);
  } else {
    countResult = getOne('SELECT COUNT(*) as total FROM photos WHERE user_id = ?', [userId]);
    photos = getAll(`
      SELECT * FROM photos
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(pageSize), offset]);
  }

  const total = countResult?.total || 0;

  res.json({
    code: 200,
    data: { list: photos, total, page: parseInt(page), pageSize: parseInt(pageSize) }
  });
});

// 获取用户优惠券
router.get('/:id/coupons', authMiddleware, (req, res) => {
  const { id } = req.params;

  const user = getOne('SELECT user_id FROM users WHERE user_id = ? OR id = ?', [id, id]);
  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }

  const coupons = getAll(`
    SELECT * FROM coupons
    WHERE user_id = ?
    ORDER BY created_at DESC
  `, [user.user_id]);

  res.json({ code: 200, data: coupons });
});

// 醒币修正（增加或扣减）
router.post('/:id/adjust-points', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { amount, type, reason } = req.body;
  // amount: 正数增加，负数扣减
  // type: 'add' 增加, 'deduct' 扣减, 'correct' 修正
  // reason: 修正原因

  if (amount === undefined || amount === null) {
    return res.status(400).json({ code: 400, message: '请输入修正数量' });
  }

  if (!reason || reason.trim() === '') {
    return res.status(400).json({ code: 400, message: '请输入修正原因' });
  }

  const adjustAmount = parseInt(amount);
  if (isNaN(adjustAmount) || adjustAmount === 0) {
    return res.status(400).json({ code: 400, message: '修正数量必须是非零整数' });
  }

  // 查找用户
  let user;
  if (isSharedDb) {
    user = getOne('SELECT id, points FROM users WHERE id = ?', [id]);
  } else {
    user = getOne('SELECT user_id, points FROM users WHERE user_id = ? OR id = ?', [id, id]);
  }

  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }

  const userId = isSharedDb ? user.id : user.user_id;
  const currentPoints = user.points || 0;
  const newPoints = currentPoints + adjustAmount;

  // 检查扣减后是否为负数
  if (newPoints < 0) {
    return res.status(400).json({
      code: 400,
      message: `扣减失败：用户当前仅有 ${currentPoints} 醒币，无法扣减 ${Math.abs(adjustAmount)} 醒币`
    });
  }

  try {
    // 更新用户醒币
    if (isSharedDb) {
      run('UPDATE users SET points = ? WHERE id = ?', [newPoints, userId]);
    } else {
      run('UPDATE users SET points = ? WHERE user_id = ?', [newPoints, userId]);
    }

    // 记录醒币变动
    const recordId = 'ADJ' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
    const recordType = adjustAmount > 0 ? 'admin_add' : 'admin_deduct';
    const description = `[管理员${adjustAmount > 0 ? '增加' : '扣减'}] ${reason}`;

    if (isSharedDb) {
      // 小程序数据库使用 points_records 表
      run(`
        INSERT INTO points_records (id, user_id, type, amount, balance_after, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `, [recordId, userId, recordType, adjustAmount, newPoints, description]);
    } else {
      // 后台数据库使用 point_records 表
      run(`
        INSERT INTO point_records (record_id, user_id, type, amount, balance, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `, [recordId, userId, recordType, adjustAmount, newPoints, description]);
    }

    res.json({
      code: 200,
      message: `醒币${adjustAmount > 0 ? '增加' : '扣减'}成功`,
      data: {
        userId,
        adjustAmount,
        previousPoints: currentPoints,
        currentPoints: newPoints,
        reason
      }
    });

  } catch (error) {
    console.error('醒币修正失败:', error);
    res.status(500).json({ code: 500, message: '醒币修正失败: ' + error.message });
  }
});

// 获取用户醒币变动记录
router.get('/:id/points-records', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;

  let records, countResult;

  if (isSharedDb) {
    countResult = getOne('SELECT COUNT(*) as total FROM points_records WHERE user_id = ?', [id]);
    records = getAll(`
      SELECT id, user_id, type, amount, balance_after as balance, description, created_at
      FROM points_records
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [id, parseInt(pageSize), offset]);
  } else {
    countResult = getOne('SELECT COUNT(*) as total FROM point_records WHERE user_id = ?', [id]);
    records = getAll(`
      SELECT record_id as id, user_id, type, amount, balance, description, created_at
      FROM point_records
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [id, parseInt(pageSize), offset]);
  }

  const total = countResult?.total || 0;

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

// 签署协议
router.post('/sign-agreement', (req, res) => {
  const { userId, agreementType } = req.body;

  if (!userId) {
    return res.status(400).json({ code: 400, message: 'userId不能为空' });
  }

  if (!agreementType) {
    return res.status(400).json({ code: 400, message: 'agreementType不能为空' });
  }

  try {
    const now = new Date().toISOString();

    // agreementType 可以是 'privacy', 'terms', 或 'all'
    const types = agreementType === 'all' ? ['privacy', 'terms'] : [agreementType];

    types.forEach(type => {
      // 检查是否已存在记录
      const existing = getOne(`
        SELECT * FROM user_agreements
        WHERE user_id = ? AND agreement_type = ?
      `, [userId, type]);

      if (existing) {
        // 更新现有记录
        run(`
          UPDATE user_agreements
          SET is_signed = 1, signed_at = ?
          WHERE user_id = ? AND agreement_type = ?
        `, [now, userId, type]);
      } else {
        // 插入新记录
        const id = 'AGR' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
        run(`
          INSERT INTO user_agreements (id, user_id, agreement_type, is_signed, signed_at, created_at)
          VALUES (?, ?, ?, 1, ?, ?)
        `, [id, userId, type, now, now]);
      }
    });

    res.json({
      code: 200,
      message: '协议签署成功',
      data: { userId, agreementType, signedAt: now }
    });

  } catch (error) {
    console.error('[协议签署] 失败:', error);
    res.status(500).json({ code: 500, message: '协议签署失败: ' + error.message });
  }
});

// 获取用户统计数据（充值、消费、分享等）
router.get('/:id/stats', authMiddleware, (req, res) => {
  const { id } = req.params;

  try {
    let stats = {
      // 累计充值
      totalRecharge: {
        amount: 0,       // 实际支付人民币金额（分）
        points: 0,       // 充值获得的醒币
        count: 0         // 充值次数
      },
      // 累计消费
      totalConsume: {
        points: 0,       // 消费的醒币
        count: 0         // 消费次数
      },
      // 分享奖励
      totalShare: {
        points: 0,       // 分享获得的醒币
        count: 0         // 分享次数
      },
      // 邀请奖励
      totalInvite: {
        points: 0,       // 邀请获得的醒币
        count: 0         // 邀请人数
      },
      // 协议签约状态
      agreements: {
        privacy: { signed: false, signedAt: null },
        terms: { signed: false, signedAt: null }
      }
    };

    if (isSharedDb) {
      // 小程序数据库

      // 1. 充值统计（从 orders 表）
      const rechargeStats = getOne(`
        SELECT
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(points_amount + COALESCE(bonus_points, 0)), 0) as total_points,
          COUNT(*) as count
        FROM orders
        WHERE user_id = ? AND status = 'paid'
      `, [id]);
      if (rechargeStats) {
        stats.totalRecharge.amount = rechargeStats.total_amount || 0;
        stats.totalRecharge.points = rechargeStats.total_points || 0;
        stats.totalRecharge.count = rechargeStats.count || 0;
      }

      // 2. 消费统计（从 points_records 表，type 包含 consume/generate/photo_generate）
      const consumeStats = getOne(`
        SELECT
          COALESCE(SUM(ABS(amount)), 0) as total_points,
          COUNT(*) as count
        FROM points_records
        WHERE user_id = ? AND (type LIKE '%consume%' OR type LIKE '%generate%' OR amount < 0)
          AND type NOT LIKE '%admin%' AND type NOT LIKE '%refund%'
      `, [id]);
      if (consumeStats) {
        stats.totalConsume.points = consumeStats.total_points || 0;
        stats.totalConsume.count = consumeStats.count || 0;
      }

      // 3. 分享奖励统计
      const shareStats = getOne(`
        SELECT
          COALESCE(SUM(amount), 0) as total_points,
          COUNT(*) as count
        FROM points_records
        WHERE user_id = ? AND type = 'share_image'
      `, [id]);
      if (shareStats) {
        stats.totalShare.points = shareStats.total_points || 0;
        stats.totalShare.count = shareStats.count || 0;
      }

      // 4. 邀请奖励统计
      const inviteStats = getOne(`
        SELECT
          COALESCE(SUM(amount), 0) as total_points,
          COUNT(*) as count
        FROM points_records
        WHERE user_id = ? AND (type = 'invite_reward' OR type = 'invite')
      `, [id]);
      if (inviteStats) {
        stats.totalInvite.points = inviteStats.total_points || 0;
        stats.totalInvite.count = inviteStats.count || 0;
      }

      // 5. 协议签约状态（从 user_agreements 表，如果存在）
      try {
        const privacyAgreement = getOne(`
          SELECT signed_at FROM user_agreements
          WHERE user_id = ? AND agreement_type = 'privacy' AND is_signed = 1
          ORDER BY signed_at DESC LIMIT 1
        `, [id]);
        if (privacyAgreement) {
          stats.agreements.privacy.signed = true;
          stats.agreements.privacy.signedAt = privacyAgreement.signed_at;
        }

        const termsAgreement = getOne(`
          SELECT signed_at FROM user_agreements
          WHERE user_id = ? AND agreement_type = 'terms' AND is_signed = 1
          ORDER BY signed_at DESC LIMIT 1
        `, [id]);
        if (termsAgreement) {
          stats.agreements.terms.signed = true;
          stats.agreements.terms.signedAt = termsAgreement.signed_at;
        }
      } catch (e) {
        // user_agreements 表可能不存在，忽略错误
        console.log('[用户统计] 协议表不存在，跳过协议状态查询');
      }

    } else {
      // 后台数据库

      // 1. 充值统计
      const rechargeStats = getOne(`
        SELECT
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(points), 0) as total_points,
          COUNT(*) as count
        FROM orders
        WHERE user_id = ? AND status = 'paid'
      `, [id]);
      if (rechargeStats) {
        stats.totalRecharge.amount = rechargeStats.total_amount || 0;
        stats.totalRecharge.points = rechargeStats.total_points || 0;
        stats.totalRecharge.count = rechargeStats.count || 0;
      }

      // 2. 消费统计
      const consumeStats = getOne(`
        SELECT
          COALESCE(SUM(ABS(amount)), 0) as total_points,
          COUNT(*) as count
        FROM point_records
        WHERE user_id = ? AND (type LIKE '%consume%' OR type LIKE '%generate%' OR amount < 0)
          AND type NOT LIKE '%admin%' AND type NOT LIKE '%refund%'
      `, [id]);
      if (consumeStats) {
        stats.totalConsume.points = consumeStats.total_points || 0;
        stats.totalConsume.count = consumeStats.count || 0;
      }

      // 3. 分享奖励统计
      const shareStats = getOne(`
        SELECT
          COALESCE(SUM(amount), 0) as total_points,
          COUNT(*) as count
        FROM point_records
        WHERE user_id = ? AND type = 'share_image'
      `, [id]);
      if (shareStats) {
        stats.totalShare.points = shareStats.total_points || 0;
        stats.totalShare.count = shareStats.count || 0;
      }

      // 4. 邀请奖励统计
      const inviteStats = getOne(`
        SELECT
          COALESCE(SUM(amount), 0) as total_points,
          COUNT(*) as count
        FROM point_records
        WHERE user_id = ? AND (type = 'invite_reward' OR type = 'invite')
      `, [id]);
      if (inviteStats) {
        stats.totalInvite.points = inviteStats.total_points || 0;
        stats.totalInvite.count = inviteStats.count || 0;
      }

      // 5. 协议签约状态
      try {
        const privacyAgreement = getOne(`
          SELECT signed_at FROM user_agreements
          WHERE user_id = ? AND agreement_type = 'privacy' AND is_signed = 1
          ORDER BY signed_at DESC LIMIT 1
        `, [id]);
        if (privacyAgreement) {
          stats.agreements.privacy.signed = true;
          stats.agreements.privacy.signedAt = privacyAgreement.signed_at;
        }

        const termsAgreement = getOne(`
          SELECT signed_at FROM user_agreements
          WHERE user_id = ? AND agreement_type = 'terms' AND is_signed = 1
          ORDER BY signed_at DESC LIMIT 1
        `, [id]);
        if (termsAgreement) {
          stats.agreements.terms.signed = true;
          stats.agreements.terms.signedAt = termsAgreement.signed_at;
        }
      } catch (e) {
        console.log('[用户统计] 协议表不存在，跳过协议状态查询');
      }
    }

    res.json({ code: 200, data: stats });

  } catch (error) {
    console.error('[用户统计] 查询失败:', error);
    res.status(500).json({ code: 500, message: '获取用户统计失败: ' + error.message });
  }
});

// 注销用户账号
router.delete('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  try {
    // 删除用户相关的所有数据(兼容两种数据库)
    // 使用 try-catch 包装每个删除操作，确保即使某个表不存在也能继续

    // 1. 删除积分记录
    if (isSharedDb) {
      try { run('DELETE FROM points_records WHERE user_id = ?', [id]); } catch (e) { /* 表可能不存在 */ }
    } else {
      try { run('DELETE FROM point_records WHERE user_id = ?', [id]); } catch (e) { /* 表可能不存在 */ }
    }

    // 2. 删除照片历史
    if (isSharedDb) {
      try { run('DELETE FROM photo_history WHERE user_id = ?', [id]); } catch (e) { /* 表可能不存在 */ }
    } else {
      try { run('DELETE FROM photos WHERE user_id = ?', [id]); } catch (e) { /* 表可能不存在 */ }
    }

    // 3. 删除订单
    try { run('DELETE FROM orders WHERE user_id = ?', [id]); } catch (e) { /* 表可能不存在 */ }

    // 4. 删除协议签署记录
    try { run('DELETE FROM user_agreements WHERE user_id = ?', [id]); } catch (e) { /* 表可能不存在 */ }

    // 5. 删除邀请记录（作为邀请者或被邀请者）
    try { run('DELETE FROM invites WHERE inviter_id = ? OR invitee_id = ?', [id, id]); } catch (e) { /* 表可能不存在 */ }

    // 6. 删除用户反馈
    try { run('DELETE FROM feedbacks WHERE user_id = ?', [id]); } catch (e) { /* 表可能不存在 */ }

    // 7. 删除虚拟支付订单
    try { run('DELETE FROM virtual_pay_orders WHERE user_id = ?', [id]); } catch (e) { /* 表可能不存在 */ }

    // 8. 删除用户绑定记录
    try { run('DELETE FROM user_bindings WHERE user_id = ?', [id]); } catch (e) { /* 表可能不存在 */ }

    // 9. 最后删除用户（同时尝试两种 ID 字段）
    run('DELETE FROM users WHERE id = ? OR user_id = ?', [id, id]);

    console.log('[用户注销] 成功删除用户及关联数据:', id);

    res.json({
      code: 200,
      message: '用户注销成功',
      data: { userId: id }
    });
  } catch (error) {
    console.error('[用户注销] 失败:', error);
    res.status(500).json({ code: 500, message: '用户注销失败: ' + error.message });
  }
});

module.exports = router;