/**
 * 用户行为追踪 API
 * 用于接收小程序端上报的用户行为数据
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../../config/database');

// 允许的行为类型
const ALLOWED_BEHAVIOR_TYPES = ['page_view', 'click', 'event', 'error'];

// 字段长度限制
const FIELD_LIMITS = {
  behavior_name: 100,
  page_path: 200,
  page_query: 500,
  element_id: 100,
  element_type: 50,
  element_text: 200,
  extra_data: 2000,
  device_brand: 50,
  device_model: 100,
  system_info: 100,
  network_type: 20,
  session_id: 50
};

/**
 * 截断字符串到指定长度
 */
function truncate(str, limit) {
  if (!str) return null;
  return String(str).substring(0, limit);
}

/**
 * 批量上报用户行为
 * POST /api/behavior/report
 */
router.post('/report', async (req, res) => {
  try {
    const { behaviors } = req.body;

    // 验证数据
    if (!behaviors || !Array.isArray(behaviors) || behaviors.length === 0) {
      return res.json({ code: -1, msg: '无效的行为数据' });
    }

    // 限制单次上报数量
    if (behaviors.length > 50) {
      return res.json({ code: -1, msg: '单次上报数量不能超过50条' });
    }

    const db = getDb();
    const insertStmt = db.prepare(`
      INSERT INTO user_behaviors (
        id, user_id, session_id, behavior_type, behavior_name,
        page_path, page_query, element_id, element_type, element_text,
        extra_data, device_brand, device_model, system_info, network_type,
        duration, client_time, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    // 使用事务批量插入
    const insertMany = db.transaction((items) => {
      let successCount = 0;
      for (const item of items) {
        try {
          // 验证必填字段
          if (!item.behavior_type || !item.behavior_name) {
            continue;
          }

          // 验证行为类型
          if (!ALLOWED_BEHAVIOR_TYPES.includes(item.behavior_type)) {
            continue;
          }

          insertStmt.run(
            uuidv4(),
            item.user_id || null,
            truncate(item.session_id, FIELD_LIMITS.session_id),
            item.behavior_type,
            truncate(item.behavior_name, FIELD_LIMITS.behavior_name),
            truncate(item.page_path, FIELD_LIMITS.page_path),
            truncate(item.page_query, FIELD_LIMITS.page_query),
            truncate(item.element_id, FIELD_LIMITS.element_id),
            truncate(item.element_type, FIELD_LIMITS.element_type),
            truncate(item.element_text, FIELD_LIMITS.element_text),
            truncate(item.extra_data, FIELD_LIMITS.extra_data),
            truncate(item.device_brand, FIELD_LIMITS.device_brand),
            truncate(item.device_model, FIELD_LIMITS.device_model),
            truncate(item.system_info, FIELD_LIMITS.system_info),
            truncate(item.network_type, FIELD_LIMITS.network_type),
            item.duration || null,
            item.client_time || null
          );
          successCount++;
        } catch (e) {
          // 单条插入失败，继续处理其他数据
          console.error('[Behavior] 插入失败:', e.message);
        }
      }
      return successCount;
    });

    const successCount = insertMany(behaviors);

    res.json({
      code: 0,
      msg: '上报成功',
      data: { received: behaviors.length, saved: successCount }
    });

  } catch (error) {
    console.error('[Behavior] 上报错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
