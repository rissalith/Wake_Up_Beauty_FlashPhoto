const express = require('express');
const router = express.Router();
const { getOne, getAll } = require('../config/database');

const isSharedDb = !!process.env.SHARED_DB_PATH;

// 获取用户邀请统计（统一使用 invites 表）
router.get('/stats/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    // 统计邀请人数和获得的醒币（从 invites 表统一查询）
    let invitedCount = 0;
    let earnedPoints = 0;
    let todayCount = 0;
    
    try {
      const result = getOne(`
        SELECT 
          COUNT(*) as invited_count,
          COALESCE(SUM(reward_points), 0) as earned_points,
          COUNT(CASE WHEN DATE(created_at) = DATE('now') THEN 1 END) as today_count
        FROM invites 
        WHERE inviter_id = ? AND status = 'completed'
      `, [userId]);
      
      invitedCount = result?.invited_count || 0;
      earnedPoints = result?.earned_points || 0;
      todayCount = result?.today_count || 0;
    } catch (e) {
      console.log('[Invite] 查询 invites 表失败，尝试备用方案:', e.message);
      
      // 备用方案：从 points_records 表查询
      try {
        const tableName = isSharedDb ? 'points_records' : 'point_records';
        const pointsResult = getOne(`
          SELECT 
            COALESCE(SUM(amount), 0) as total,
            COUNT(*) as count
          FROM ${tableName} 
          WHERE user_id = ? AND type = 'invite_friend'
        `, [userId]);
        earnedPoints = pointsResult?.total || 0;
        invitedCount = pointsResult?.count || 0;
      } catch (e2) {
        console.log('[Invite] 备用查询也失败:', e2.message);
      }
    }

    res.json({
      code: 200,
      data: {
        invitedCount,
        earnedPoints,
        todayCount
      }
    });
  } catch (e) {
    console.error('[Invite] 获取邀请统计失败:', e.message);
    res.json({ code: 200, data: { invitedCount: 0, earnedPoints: 0, todayCount: 0 } });
  }
});

// 获取邀请记录列表（统一使用 invites 表）
router.get('/records/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    let total = 0;
    let list = [];

    try {
      // 从 invites 表查询总数
      const countResult = getOne('SELECT COUNT(*) as count FROM invites WHERE inviter_id = ?', [userId]);
      total = countResult?.count || 0;
    } catch (e) {
      console.log('[Invite] 查询邀请总数失败:', e.message);
    }

    try {
      // 从 invites 表查询记录，关联 users 表获取被邀请者信息
      list = getAll(`
        SELECT 
          i.id as invite_id,
          i.invitee_id as user_id,
          i.status,
          i.reward_points,
          i.created_at,
          u.nickname,
          u.avatar_url
        FROM invites i
        LEFT JOIN users u ON i.invitee_id = u.id OR i.invitee_id = u.user_id
        WHERE i.inviter_id = ?
        ORDER BY i.created_at DESC
        LIMIT ? OFFSET ?
      `, [userId, parseInt(pageSize), offset]) || [];
    } catch (e) {
      console.log('[Invite] 查询邀请列表失败:', e.message);
    }

    res.json({
      code: 200,
      data: {
        list,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (e) {
    console.error('[Invite] 获取邀请记录失败:', e.message);
    res.json({
      code: 200,
      data: { list: [], total: 0, page: 1, pageSize: 20 }
    });
  }
});

module.exports = router;
