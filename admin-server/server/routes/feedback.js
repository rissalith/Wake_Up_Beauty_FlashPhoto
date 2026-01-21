const express = require('express');
const router = express.Router();
const { run, getOne, getAll } = require('../config/database');

// 判断是否使用共享数据库
const isSharedDb = !!process.env.SHARED_DB_PATH;

// 生成随机ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// 路由健康检查
router.get('/check', (req, res) => {
  res.json({ code: 200, message: '反馈模块服务正常' });
});

// 调试：查看数据库所有反馈（不限用户）
router.get('/debug/all', (req, res) => {
  try {
    const all = getAll('SELECT * FROM feedbacks');
    res.json({ code: 200, count: all.length, data: all });
  } catch (e) {
    res.json({ code: 500, error: e.message });
  }
});

// 提交反馈
router.post('/submit', (req, res) => {
  const { userId, content, images, contact } = req.body;
  if (!userId || !content) {
    return res.json({ code: 400, message: '用户ID和反馈内容不能为空' });
  }

  const feedbackId = 'fb_' + generateId();
  console.log(`[Backend] 收到提交请求, userId: ${userId}, feedbackId: ${feedbackId}`);
  try {
    const imagesStr = JSON.stringify(images || []);
    console.log(`[Backend] 准备写入数据库: feedbackId=${feedbackId}, imagesLen=${imagesStr.length}`);
    
    run(`
      INSERT INTO feedbacks (feedback_id, user_id, content, images, contact, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [feedbackId, userId, content, imagesStr, contact, 'pending']);

    res.json({
      code: 200,
      message: '反馈提交成功',
      data: { feedbackId }
    });
  } catch (error) {
    console.error('[Backend] SQL写入失败!!! 错误详情:', error);
    res.status(500).json({ code: 500, message: '提交失败: ' + error.message });
  }
});

// 获取用户的反馈列表
router.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  console.log(`[Backend] 正在查询反馈列表, userId: ${userId} (类型: ${typeof userId})`);
  try {
    // 尝试同时匹配字符串和数字类型的ID
    const list = getAll(`
      SELECT * FROM feedbacks
      WHERE user_id = ? OR user_id = CAST(? AS TEXT)
      ORDER BY created_at DESC
    `, [userId, userId]);

    // 解析图片字段
    const formattedList = list.map(item => ({
      ...item,
      images: item.images ? JSON.parse(item.images) : []
    }));

    res.json({
      code: 200,
      data: formattedList
    });
  } catch (error) {
    console.error('获取反馈列表失败:', error);
    res.status(500).json({ code: 500, message: '获取失败' });
  }
});

// 管理员：获取所有反馈列表
router.get('/admin/list', (req, res) => {
  try {
    const list = getAll('SELECT * FROM feedbacks ORDER BY created_at DESC');
    const formattedList = list.map(item => ({
      ...item,
      images: item.images ? JSON.parse(item.images) : []
    }));

    res.json({
      code: 200,
      data: formattedList
    });
  } catch (error) {
    console.error('获取反馈列表失败:', error);
    res.status(500).json({ code: 500, message: '获取失败' });
  }
});

// 管理员：回复反馈
router.post('/admin/reply', (req, res) => {
  const { feedbackId, replyContent } = req.body;
  if (!feedbackId || !replyContent) {
    return res.json({ code: 400, message: '反馈ID和回复内容不能为空' });
  }

  try {
    run(`
      UPDATE feedbacks
      SET reply_content = ?, status = 'replied', replied_at = CURRENT_TIMESTAMP
      WHERE feedback_id = ?
    `, [replyContent, feedbackId]);

    res.json({
      code: 200,
      message: '回复成功'
    });
  } catch (error) {
    console.error('回复反馈失败:', error);
    res.status(500).json({ code: 500, message: '回复失败' });
  }
});

// 管理员：打赏醒币
router.post('/admin/reward', (req, res) => {
  const { feedbackId, amount } = req.body;

  console.log('[Feedback] 打赏请求:', { feedbackId, amount, isSharedDb });

  if (!feedbackId || !amount) {
    return res.json({ code: 400, message: '反馈ID和打赏金额不能为空' });
  }

  if (amount <= 0 || amount > 500) {
    return res.json({ code: 400, message: '打赏金额必须在1-500之间' });
  }

  try {
    // 获取反馈信息
    const feedback = getOne('SELECT * FROM feedbacks WHERE feedback_id = ?', [feedbackId]);
    console.log('[Feedback] 查询到反馈:', feedback ? '存在' : '不存在', feedback?.user_id);

    if (!feedback) {
      return res.json({ code: 404, message: '反馈不存在' });
    }

    if (feedback.reward_amount > 0) {
      return res.json({ code: 400, message: '该反馈已经打赏过了' });
    }

    const userId = feedback.user_id;

    // 获取用户当前醒币余额（尝试多种查询方式）
    let user = null;
    try {
      user = getOne('SELECT * FROM users WHERE id = ?', [userId]);
    } catch (e1) {
      console.log('[Feedback] id字段查询失败，尝试user_id');
    }
    if (!user) {
      try {
        user = getOne('SELECT * FROM users WHERE user_id = ?', [userId]);
      } catch (e2) {
        console.log('[Feedback] user_id字段也不存在');
      }
    }

    console.log('[Feedback] 查询到用户:', user ? '存在' : '不存在', user?.points);

    if (!user) {
      console.error('[Feedback] 用户不存在:', userId);
      return res.json({ code: 404, message: '用户不存在' });
    }

    const currentPoints = user.points || 0;
    const newPoints = currentPoints + amount;

    // 更新用户醒币余额（尝试多种方式）
    try {
      run('UPDATE users SET points = ? WHERE id = ?', [newPoints, userId]);
    } catch (e1) {
      console.log('[Feedback] 尝试 user_id 更新');
      run('UPDATE users SET points = ? WHERE user_id = ?', [newPoints, userId]);
    }

    // 记录醒币变动（尝试多种表结构）
    const recordId = 'pr_' + generateId();

    // 尝试插入醒币记录（多种表结构兼容）
    let recordInserted = false;
    const recordTables = [
      { table: 'points_records', idField: 'id', balanceField: 'balance_after' },
      { table: 'point_records', idField: 'record_id', balanceField: 'balance' }
    ];

    for (const { table, idField, balanceField } of recordTables) {
      if (recordInserted) break;
      try {
        run(`
          INSERT INTO ${table} (${idField}, user_id, type, amount, ${balanceField}, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [recordId, userId, 'reward', amount, newPoints, '反馈打赏奖励']);
        recordInserted = true;
        console.log(`[Feedback] 醒币记录已插入到 ${table}`);
      } catch (e) {
        console.log(`[Feedback] 尝试 ${table} 失败:`, e.message);
      }
    }

    // 更新反馈表的打赏金额
    run('UPDATE feedbacks SET reward_amount = ? WHERE feedback_id = ?', [amount, feedbackId]);

    console.log(`[Feedback] 打赏成功: feedbackId=${feedbackId}, userId=${userId}, amount=${amount}`);

    res.json({
      code: 200,
      message: '打赏成功',
      data: {
        userId,
        amount,
        newBalance: newPoints
      }
    });
  } catch (error) {
    console.error('[Feedback] 打赏失败:', error);
    res.status(500).json({ code: 500, message: '打赏失败: ' + error.message });
  }
});

// 更新反馈内容
router.put('/:feedbackId', (req, res) => {
  const { feedbackId } = req.params;
  const { content, images, contact } = req.body;
  if (!content) {
    return res.json({ code: 400, message: '反馈内容不能为空' });
  }

  try {
    run(`
      UPDATE feedbacks
      SET content = ?, images = ?, contact = ?
      WHERE feedback_id = ? AND status = 'pending'
    `, [content, JSON.stringify(images || []), contact, feedbackId]);

    res.json({
      code: 200,
      message: '更新成功'
    });
  } catch (error) {
    console.error('更新反馈失败:', error);
    res.status(500).json({ code: 500, message: '更新失败' });
  }
});

// 删除反馈
router.delete('/:feedbackId', (req, res) => {
  const { feedbackId } = req.params;
  try {
    run('DELETE FROM feedbacks WHERE feedback_id = ?', [feedbackId]);
    res.json({
      code: 200,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除反馈失败:', error);
    res.status(500).json({ code: 500, message: '删除失败' });
  }
});

module.exports = router;