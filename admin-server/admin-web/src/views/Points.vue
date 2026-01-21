<template>
  <div class="points-page">
    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon recharge">
          <el-icon><Money /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-label">总充值金额</div>
          <div class="stat-value">¥{{ stats.totalRecharge || 0 }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon granted">
          <el-icon><Coin /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-label">总发放醒币</div>
          <div class="stat-value">{{ stats.totalGranted || 0 }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon consumed">
          <el-icon><ShoppingCart /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-label">总消费醒币</div>
          <div class="stat-value">{{ stats.totalConsumed || 0 }}</div>
        </div>
      </div>
    </div>

    <div class="config-row">
      <!-- 充值套餐配置 -->
      <div class="page-card flex-1">
        <div class="card-header">
          <span class="card-title">充值套餐列表</span>
        </div>

        <el-table :data="packages" v-loading="packagesLoading" style="width: 100%">
          <el-table-column prop="amount" label="金额" min-width="100">
            <template #default="{ row }">¥{{ row.amount }}</template>
          </el-table-column>
          <el-table-column prop="points" label="醒币" min-width="100">
            <template #default="{ row }">{{ row.points }}</template>
          </el-table-column>
          <el-table-column prop="bonus_points" label="赠送" min-width="100">
            <template #default="{ row }">
              <span v-if="row.bonus_points">+{{ row.bonus_points }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="is_active" label="状态" min-width="100">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
                {{ row.is_active ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="sort_order" label="排序" min-width="80" />
        </el-table>
      </div>

      <!-- 奖励配置 -->
      <div class="page-card flex-1">
        <div class="card-header">
          <span class="card-title">奖励配置</span>
        </div>

        <el-table :data="rewards" v-loading="rewardsLoading" style="width: 100%">
          <el-table-column prop="name" label="类型" min-width="100" />
          <el-table-column prop="points" label="奖励" min-width="80" />
          <el-table-column prop="description" label="描述" min-width="150" show-overflow-tooltip />
          <el-table-column prop="is_active" label="状态" min-width="80">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
                {{ row.is_active ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link @click="openRewardDialog(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 醒币记录 -->
    <div class="page-card records-card">
      <div class="card-header">
        <span class="card-title">醒币记录</span>
        <div class="filter-bar">
          <el-input v-model="recordsFilter.userId" placeholder="用户ID" style="width: 180px" clearable />
          <el-select v-model="recordsFilter.type" placeholder="类型" clearable style="width: 140px">
            <el-option label="新用户" value="new_user" />
            <el-option label="分享" value="share_image" />
            <el-option label="邀请" value="invite_friend" />
            <el-option label="充值" value="recharge" />
            <el-option label="消费" value="consume" />
            <el-option label="调整" value="admin_adjust" />
          </el-select>
          <el-button type="primary" @click="loadRecords">搜索</el-button>
        </div>
      </div>

      <div class="table-wrapper">
        <el-table :data="records" v-loading="recordsLoading" style="width: 100%">
          <el-table-column prop="record_id" label="记录ID" width="180" show-overflow-tooltip />
          <el-table-column label="用户" width="200">
            <template #default="{ row }">
              <div class="user-cell">
                <el-avatar v-if="isValidAvatarUrl(row.avatar_url)" :src="row.avatar_url" :size="28">
                  <span>{{ (row.nickname || '用')[0] }}</span>
                </el-avatar>
                <div v-else class="mini-avatar">{{ (row.nickname || '用')[0] }}</div>
                <div class="user-info">
                  <div class="nickname">{{ row.nickname || '未知用户' }}</div>
                  <div class="user-id">{{ row.user_id }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="100">
            <template #default="{ row }">
              <el-tag size="small">{{ getRewardTypeName(row.type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="amount" label="变动" width="100">
            <template #default="{ row }">
              <span :style="{ color: row.amount > 0 ? '#67c23a' : '#f56c6c' }">
                {{ row.amount > 0 ? '+' : '' }}{{ row.amount }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="balance" label="余额" width="100" />
          <el-table-column prop="description" label="描述" min-width="150" />
          <el-table-column prop="created_at" label="时间" width="160">
            <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="recordsPage"
          v-model:page-size="recordsPageSize"
          :total="recordsTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @change="loadRecords"
        />
      </div>
    </div>

    <!-- 奖励编辑弹窗 -->
    <el-dialog v-model="rewardDialogVisible" title="编辑奖励配置" width="500px" v-dialog-drag>
      <el-form :model="rewardForm" label-width="100px">
        <el-form-item label="类型">
          <el-input :value="getRewardTypeName(rewardForm.type)" disabled />
        </el-form-item>
        <el-form-item label="奖励醒币">
          <el-input-number v-model="rewardForm.points" :min="0" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="rewardForm.description" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="rewardForm.is_active" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rewardDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveReward" :loading="rewardSaving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { ElMessage } from 'element-plus'
import { Money, Coin, ShoppingCart } from '@element-plus/icons-vue'
import { pointsApi } from '../api'

// 配置dayjs支持时区
dayjs.extend(utc)
dayjs.extend(timezone)

// 统计
const stats = ref({})

// 充值套餐
const packagesLoading = ref(false)
const packages = ref([])

// 奖励配置
const rewardsLoading = ref(false)
const rewards = ref([])
const rewardDialogVisible = ref(false)
const rewardSaving = ref(false)
const rewardForm = reactive({
  type: '',
  points: 0,
  description: '',
  is_active: 1
})

// 醒币记录
const recordsLoading = ref(false)
const records = ref([])
const recordsPage = ref(1)
const recordsPageSize = ref(20)
const recordsTotal = ref(0)
const recordsFilter = reactive({
  userId: '',
  type: ''
})

const formatDate = (date) => {
  if (!date) return '-'
  // 数据库存储的是UTC时间，需要转换为北京时间
  return dayjs.utc(date).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm')
}

// 检查头像URL是否有效（过滤掉wxfile://等无效URL）
const isValidAvatarUrl = (url) => {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('wxfile://')) return false
  if (url.startsWith('http://tmp') || url.startsWith('https://tmp')) return false
  return url.startsWith('http://') || url.startsWith('https://')
}

const getRewardTypeName = (type) => {
  const map = {
    new_user: '新用户注册',
    daily_login: '每日登录',
    share_image: '分享图片',
    share_photo: '分享照片',
    invite_friend: '邀请好友',
    invite_reward: '被邀请奖励',
    recharge: '充值',
    consume: '消费',
    admin_adjust: '系统调整',
    reward: '打赏奖励',
    feedback_reward: '反馈奖励',
    refund: '退款',
    '打赏': '打赏奖励'
  }
  return map[type] || type
}

const loadStats = async () => {
  try {
    const res = await pointsApi.getStats()
    if (res.code === 200 || res.code === 0) {
      stats.value = res.data
    }
  } catch (error) {
    console.error(error)
  }
}

const loadPackages = async () => {
  packagesLoading.value = true
  try {
    const res = await pointsApi.getPackages()
    if (res.code === 200 || res.code === 0) {
      packages.value = res.data
    }
  } finally {
    packagesLoading.value = false
  }
}

const loadRewards = async () => {
  rewardsLoading.value = true
  try {
    const res = await pointsApi.getRewards()
    if (res.code === 200 || res.code === 0) {
      rewards.value = res.data
    }
  } finally {
    rewardsLoading.value = false
  }
}

const loadRecords = async () => {
  recordsLoading.value = true
  try {
    const params = {
      page: recordsPage.value,
      pageSize: recordsPageSize.value,
      userId: recordsFilter.userId,
      type: recordsFilter.type
    }
    const res = await pointsApi.getRecords(params)
    if (res.code === 200 || res.code === 0) {
      records.value = res.data.list
      recordsTotal.value = res.data.total
    }
  } finally {
    recordsLoading.value = false
  }
}

const openRewardDialog = (reward) => {
  Object.assign(rewardForm, reward)
  rewardDialogVisible.value = true
}

const handleSaveReward = async () => {
  rewardSaving.value = true
  try {
    const res = await pointsApi.updateReward(rewardForm.type, rewardForm)
    if (res.code === 200 || res.code === 0) {
      ElMessage.success('更新成功')
      rewardDialogVisible.value = false
      loadRewards()
    }
  } finally {
    rewardSaving.value = false
  }
}

onMounted(() => {
  loadStats()
  loadPackages()
  loadRewards()
  loadRecords()
})
</script>

<style lang="scss" scoped>
.stats-row, .config-row {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.flex-1 {
  flex: 1;
  min-width: 0;
}

.records-card {
  margin-top: 0;
}

.table-wrapper {
  margin-bottom: 16px;
}

.stat-card {
  flex: 1;
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #fff;
}

.stat-icon.recharge {
  background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
}

.stat-icon.granted {
  background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
}

.stat-icon.consumed {
  background: linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%);
}


.stat-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 14px;
  color: #999;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #333;
}

.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mini-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 12px;
  flex-shrink: 0;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-info .nickname {
  font-size: 13px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-info .user-id {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
