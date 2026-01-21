-- 邀请系统表结构迁移脚本
-- 执行时间: 2026-01-21
-- 目的: 统一邀请表结构，确保所有服务使用相同的 invites 表

-- 1. 确保 invites 表存在（如果不存在则创建）
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  status TEXT DEFAULT 'completed',
  reward_points INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites(inviter_id);
CREATE INDEX IF NOT EXISTS idx_invites_invitee ON invites(invitee_id);
CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(status);
CREATE INDEX IF NOT EXISTS idx_invites_created ON invites(created_at);

-- 3. 如果存在旧的 invite_records 表，迁移数据到 invites 表
-- 注意：执行前请先备份数据库
-- INSERT OR IGNORE INTO invites (id, inviter_id, invitee_id, status, reward_points, created_at)
-- SELECT id, inviter_id, invitee_id, 
--        CASE WHEN status = 'registered' THEN 'completed' ELSE status END,
--        COALESCE(reward_points, 10),
--        created_at
-- FROM invite_records;

-- 4. 从 users 表的 inviter_id 字段迁移历史邀请关系（如果有）
-- 这会为那些只在 users 表记录了邀请关系但没有在 invites 表的记录创建条目
-- INSERT OR IGNORE INTO invites (id, inviter_id, invitee_id, status, reward_points, created_at)
-- SELECT 
--   'MIG_' || u.id,
--   u.inviter_id,
--   u.id,
--   'completed',
--   10,
--   u.created_at
-- FROM users u
-- WHERE u.inviter_id IS NOT NULL 
--   AND u.inviter_id != ''
--   AND NOT EXISTS (
--     SELECT 1 FROM invites i WHERE i.invitee_id = u.id
--   );

-- 5. 验证迁移结果
-- SELECT COUNT(*) as total_invites FROM invites;
-- SELECT inviter_id, COUNT(*) as invite_count FROM invites GROUP BY inviter_id ORDER BY invite_count DESC LIMIT 10;
