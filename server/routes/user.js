const express = require('express');
const router = express.Router();
const https = require('https');
const { v4: uuidv4 } = require('uuid');

// 微信登录（用code换取openid和session_key）
router.post('/wx-login', async (req, res) => {
  try {
    const { code } = req.body;
    console.log('[wx-login] 收到请求, code:', code ? '已提供' : '未提供');
    
    if (!code) {
      return res.status(400).json({ code: -1, msg: '缺少code参数' });
    }

    const WX_CONFIG = {
      appId: process.env.WX_APPID || '',
      appSecret: process.env.WX_SECRET || ''
    };
    
    console.log('[wx-login] 配置检查 - AppID:', WX_CONFIG.appId ? '已配置' : '未配置', 'Secret:', WX_CONFIG.appSecret ? '已配置' : '未配置');
    
    if (!WX_CONFIG.appId || !WX_CONFIG.appSecret) {
      console.error('[wx-login] 错误: 微信配置缺失');
      return res.status(500).json({
        code: -1,
        msg: '服务器配置错误: 缺少微信AppID或Secret',
        detail: `AppID: ${WX_CONFIG.appId ? '已配置' : '未配置'}, Secret: ${WX_CONFIG.appSecret ? '已配置' : '未配置'}`
      });
    }

    const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_CONFIG.appId}&secret=${WX_CONFIG.appSecret}&js_code=${code}&grant_type=authorization_code`;
    console.log('[wx-login] 请求微信API...');

    const wxData = await new Promise((resolve, reject) => {
      https.get(wxUrl, (wxRes) => {
        let data = '';
        wxRes.on('data', chunk => { data += chunk; });
        wxRes.on('end', () => {
          try {
            console.log('[wx-login] 微信API原始响应:', data);
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('解析微信响应失败: ' + data));
          }
        });
      }).on('error', (err) => {
        console.error('[wx-login] 请求微信API失败:', err);
        reject(err);
      });
    });

    console.log('[wx-login] 微信API响应:', JSON.stringify(wxData));

    if (wxData.errcode) {
      console.error('[wx-login] 微信返回错误:', wxData.errcode, wxData.errmsg);
      // 常见错误码说明
      const errorMessages = {
        40029: 'code无效或已过期，请重新登录',
        45011: '频率限制，请稍后再试',
        40013: 'AppID无效',
        40125: 'AppSecret无效',
        '-1': '微信系统繁忙，请稍后再试'
      };
      const friendlyMsg = errorMessages[wxData.errcode] || wxData.errmsg;
      
      return res.status(400).json({
        code: -1,
        msg: `微信登录失败: ${friendlyMsg}`,
        errcode: wxData.errcode,
        errmsg: wxData.errmsg
      });
    }

    console.log('[wx-login] 登录成功, openid:', wxData.openid);
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
    const { getDb, saveDatabase, getRewardConfig, dbRun } = req.app.locals;
    const db = getDb();
    const { openid, unionid, nickname, avatarUrl, inviterId } = req.body;

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
      const userId = uuidv4();
      const newUserReward = getRewardConfig(db, 'new_user');
      const initialPoints = newUserReward.is_active ? newUserReward.points : 0;

      dbRun(db,
        'INSERT INTO users (id, openid, unionid, nickname, avatar_url, points) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, openid, unionid, nickname || null, avatarUrl || null, initialPoints]);

      if (initialPoints > 0) {
        dbRun(db,
          'INSERT INTO points_records (id, user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?, ?)',
          [uuidv4(), userId, 'new_user', initialPoints, initialPoints, '新用户注册赠送']);
      }

      if (inviterId) {
        const inviter = db.prepare('SELECT points FROM users WHERE id = ?').get(inviterId);
        if (inviter) {
          const inviteReward = getRewardConfig(db, 'invite_friend');
          if (inviteReward.is_active && inviteReward.points > 0) {
            const rewardPoints = inviteReward.points;
            const newInviterBalance = inviter.points + rewardPoints;

            dbRun(db, 'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newInviterBalance, inviterId]);
            dbRun(db,
              'INSERT INTO points_records (id, user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?, ?)',
              [uuidv4(), inviterId, 'invite_friend', rewardPoints, newInviterBalance, '邀请好友奖励']);
            dbRun(db,
              'INSERT INTO invites (id, inviter_id, invitee_id, status, reward_points) VALUES (?, ?, ?, ?, ?)',
              [uuidv4(), inviterId, userId, 'completed', rewardPoints]);
          }
        }
      }

      saveDatabase();
      userObj = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    } else {
      // 更新用户信息（包括可能新获取的 unionid）
      const needsUpdate = nickname || avatarUrl || (unionid && !userObj.unionid);
      if (needsUpdate) {
        dbRun(db,
          'UPDATE users SET nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url), unionid = COALESCE(?, unionid), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [nickname || null, avatarUrl || null, unionid || null, userObj.id]);
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
    const { getDb, findUserByIdOrOpenid } = req.app.locals;
    const db = getDb();
    const { userId } = req.params;
    const userObj = findUserByIdOrOpenid(db, userId);

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
    const { getDb, saveDatabase, dbRun } = req.app.locals;
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

// 获取用户统计信息
router.get('/stats/:userId', (req, res) => {
  try {
    const { getDb } = req.app.locals;
    const db = getDb();
    const { userId } = req.params;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const photoCount = db.prepare('SELECT COUNT(*) as count FROM photos WHERE user_id = ?').get(userId).count;
    const totalSpent = db.prepare('SELECT SUM(amount) as total FROM points_records WHERE user_id = ? AND type = "consume"').get(userId).total || 0;
    const inviteCount = db.prepare('SELECT COUNT(*) as count FROM invites WHERE inviter_id = ? AND status = "completed"').get(userId).count;

    res.json({
      code: 0,
      data: {
        userId: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        points: user.points,
        photoCount,
        totalSpent,
        inviteCount,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('获取用户统计错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 用户签署协议
router.post('/sign-agreement', (req, res) => {
  try {
    const { getDb, saveDatabase, dbRun } = req.app.locals;
    const db = getDb();
    const { userId, privacyAgreed, termsAgreed } = req.body;

    if (!userId) {
      return res.status(400).json({ code: -1, msg: '缺少userId' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    dbRun(db,
      'UPDATE users SET privacy_agreed = ?, terms_agreed = ?, agreement_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [privacyAgreed ? 1 : 0, termsAgreed ? 1 : 0, userId]);
    saveDatabase();

    res.json({
      code: 0,
      msg: 'success',
      data: {
        privacyAgreed: privacyAgreed === true,
        termsAgreed: termsAgreed === true
      }
    });
  } catch (error) {
    console.error('签署协议错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
