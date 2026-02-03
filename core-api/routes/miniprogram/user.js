/**
 * 小程序用户路由
 */
const express = require('express');
const router = express.Router();
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const { getDb, dbRun, dbGet, dbAll, saveDatabase } = require('../../config/database');

// 微信小程序配置
const WX_CONFIG = {
  appId: process.env.WX_APPID || '',
  appSecret: process.env.WX_SECRET || ''
};

// 用户认证中间件
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ code: 401, message: '未提供认证信息' });
    }

    // 支持 Bearer token 或直接传 userId
    let userId = authHeader;
    if (authHeader.startsWith('Bearer ')) {
      userId = authHeader.substring(7);
    }

    if (!userId) {
      return res.status(401).json({ code: 401, message: '无效的认证信息' });
    }

    // 查找用户
    const db = getDb();
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      user = db.prepare('SELECT * FROM users WHERE openid = ?').get(userId);
    }

    if (!user) {
      return res.status(401).json({ code: 401, message: '用户不存在' });
    }

    req.user = { userId: user.id, openid: user.openid };
    next();
  } catch (error) {
    console.error('认证中间件错误:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
};

// 辅助函数：通过 id 或 openid 查找用户
function findUserByIdOrOpenid(userId) {
  const db = getDb();
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE openid = ?').get(userId);
  }
  return user;
}

// 生成默认昵称（醒宝_XXX格式）
function generateDefaultNickname() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomId = '';
  for (let i = 0; i < 11; i++) {
    randomId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `醒宝_${randomId}`;
}

// 获取奖励配置
function getRewardConfig(type) {
  const db = getDb();
  try {
    const row = db.prepare('SELECT points, is_active, max_times FROM point_rewards WHERE type = ?').get(type);
    if (row) {
      return { points: row.points, isActive: row.is_active === 1, maxTimes: row.max_times };
    }
  } catch (e) {
    console.error('获取奖励配置失败:', e.message);
  }
  const defaults = {
    new_user: { points: 50, isActive: true, maxTimes: 1 },
    daily_login: { points: 2, isActive: true, maxTimes: 1 },
    invite_friend: { points: 10, isActive: true, maxTimes: -1 }
  };
  return defaults[type] || { points: 0, isActive: false, maxTimes: 0 };
}

// 微信登录（用code换取openid和session_key）
router.post('/wx-login', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ code: -1, msg: '缺少code参数' });
    }

    const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_CONFIG.appId}&secret=${WX_CONFIG.appSecret}&js_code=${code}&grant_type=authorization_code`;

    const wxData = await new Promise((resolve, reject) => {
      https.get(wxUrl, (wxRes) => {
        let data = '';
        wxRes.on('data', chunk => { data += chunk; });
        wxRes.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('解析微信响应失败'));
          }
        });
      }).on('error', reject);
    });

    if (wxData.errcode) {
      return res.status(400).json({
        code: -1,
        msg: `微信登录失败: ${wxData.errmsg}`,
        errcode: wxData.errcode
      });
    }

    res.json({
      code: 200,
      msg: 'success',
      data: {
        openid: wxData.openid,
        sessionKey: wxData.session_key,
        unionid: wxData.unionid || null
      }
    });
  } catch (error) {
    console.error('[wx-login] 错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误: ' + error.message });
  }
});

// 用户登录/注册
router.post('/login', (req, res) => {
  try {
    const db = getDb();
    const { openid, unionid, nickname, avatarUrl, inviterId } = req.body;

    // openid 是必须的，unionid 可选（未绑定开放平台时没有）
    if (!openid) {
      return res.status(400).json({ code: -1, msg: '缺少openid' });
    }

    // 优先使用 unionid 查找用户，如果没有 unionid 则使用 openid
    // 这样可以兼容未绑定开放平台的小程序
    let userObj = null;
    if (unionid) {
      userObj = db.prepare('SELECT * FROM users WHERE unionid = ?').get(unionid);
    }
    if (!userObj) {
      userObj = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    }

    if (!userObj) {
      // 新用户注册
      const userId = uuidv4();
      const newUserReward = getRewardConfig('new_user');
      const initialPoints = newUserReward.isActive ? newUserReward.points : 0;
      const now = new Date().toISOString();
      // 如果没有提供昵称，自动生成默认昵称
      const finalNickname = nickname || generateDefaultNickname();

      dbRun(db,
        'INSERT INTO users (id, openid, unionid, nickname, avatar_url, points, inviter_id, last_login_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, openid, unionid, finalNickname, avatarUrl || null, initialPoints, inviterId || null, now]);

      if (initialPoints > 0) {
        dbRun(db,
          'INSERT INTO points_records (id, user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?, ?)',
          [uuidv4(), userId, 'new_user', initialPoints, initialPoints, '新用户注册赠送']);
      }

      // 处理邀请奖励
      if (inviterId) {
        const inviter = db.prepare('SELECT points FROM users WHERE id = ?').get(inviterId);
        if (inviter) {
          const inviteReward = getRewardConfig('invite_friend');
          if (inviteReward.isActive && inviteReward.points > 0) {
            const newInviterBalance = inviter.points + inviteReward.points;
            dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newInviterBalance, inviterId]);
            dbRun(db,
              'INSERT INTO points_records (id, user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?, ?)',
              [uuidv4(), inviterId, 'invite_friend', inviteReward.points, newInviterBalance, '邀请好友奖励']);
            dbRun(db,
              'INSERT INTO invites (id, inviter_id, invitee_id, status, reward_points) VALUES (?, ?, ?, ?, ?)',
              [uuidv4(), inviterId, userId, 'completed', inviteReward.points]);
          }
        }
      }

      saveDatabase();
      userObj = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    } else {
      // 老用户更新信息（包括可能新获取的 unionid）和登录时间
      const now = new Date().toISOString();
      const needsUpdate = nickname || avatarUrl || (unionid && !userObj.unionid);
      if (needsUpdate) {
        dbRun(db,
          'UPDATE users SET nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url), unionid = COALESCE(?, unionid), last_login_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [nickname || null, avatarUrl || null, unionid || null, now, userObj.id]);
        saveDatabase();
        userObj = db.prepare('SELECT * FROM users WHERE id = ?').get(userObj.id);
      } else {
        // 即使没有其他更新，也要更新登录时间
        dbRun(db,
          'UPDATE users SET last_login_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [now, userObj.id]);
        saveDatabase();
        userObj = db.prepare('SELECT * FROM users WHERE id = ?').get(userObj.id);
      }
    }

    res.json({
      code: 0,
      msg: 'success',
      data: {
        userId: userObj.id,
        unionid: userObj.unionid,
        openid: userObj.openid,
        nickname: userObj.nickname,
        avatarUrl: userObj.avatar_url,
        email: userObj.email,
        points: userObj.points,
        privacyAgreed: userObj.privacy_agreed === 1,
        termsAgreed: userObj.terms_agreed === 1,
        agreementTime: userObj.agreement_time
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误: ' + error.message });
  }
});

// 获取用户信息
router.get('/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const userObj = findUserByIdOrOpenid(userId);

    if (!userObj) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    res.json({
      code: 0,
      data: {
        userId: userObj.id,
        nickname: userObj.nickname,
        avatarUrl: userObj.avatar_url,
        email: userObj.email,
        points: userObj.points
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新用户信息
router.put('/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { nickname, avatarUrl, email } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    dbRun(db,
      'UPDATE users SET nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url), email = COALESCE(?, email), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nickname || null, avatarUrl || null, email || null, userId]);
    saveDatabase();

    const userObj = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    res.json({
      code: 0,
      msg: 'success',
      data: {
        userId: userObj.id,
        nickname: userObj.nickname,
        avatarUrl: userObj.avatar_url,
        email: userObj.email,
        points: userObj.points
      }
    });
  } catch (error) {
    console.error('更新用户信息错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 同步用户协议签署状态
router.post('/sign-agreement', (req, res) => {
  try {
    const db = getDb();
    const { userId, agreementType } = req.body;

    if (!userId || !agreementType) {
      return res.status(400).json({ code: -1, msg: '缺少参数' });
    }

    const user = findUserByIdOrOpenid(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const now = new Date().toISOString();

    if (agreementType === 'privacy') {
      dbRun(db, 'UPDATE users SET privacy_agreed = 1, agreement_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [now, user.id]);
    } else if (agreementType === 'terms') {
      dbRun(db, 'UPDATE users SET terms_agreed = 1, agreement_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [now, user.id]);
    } else if (agreementType === 'all') {
      dbRun(db, 'UPDATE users SET privacy_agreed = 1, terms_agreed = 1, agreement_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [now, user.id]);
    }

    saveDatabase();

    const updatedUser = findUserByIdOrOpenid(user.id);

    res.json({
      code: 0,
      msg: 'success',
      data: {
        privacyAgreed: updatedUser?.privacy_agreed === 1,
        termsAgreed: updatedUser?.terms_agreed === 1,
        agreementTime: updatedUser?.agreement_time || now
      }
    });
  } catch (error) {
    console.error('[协议签署] 错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取用户统计数据
router.get('/stats/:userId', (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    const user = findUserByIdOrOpenid(userId);
    const realUserId = user ? user.id : userId;

    const photoCount = db.prepare("SELECT COUNT(*) as count FROM photo_history WHERE user_id = ?").get(realUserId).count;
    const successCount = db.prepare("SELECT COUNT(*) as count FROM photo_history WHERE user_id = ? AND status = 'done'").get(realUserId).count;

    res.json({
      code: 0,
      data: { photoCount, successCount }
    });
  } catch (error) {
    console.error('获取用户统计错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
