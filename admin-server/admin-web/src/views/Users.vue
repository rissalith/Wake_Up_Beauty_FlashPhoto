<template>
  <div class="users-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>用户管理</span>
          <div class="header-right">
            <el-input
              v-model="keyword"
              placeholder="搜索用户ID/UnionID/昵称"
              style="width: 250px"
              clearable
              @keyup.enter="loadUsers"
            >
              <template #append>
                <el-button @click="loadUsers">
                  <el-icon><Search /></el-icon>
                </el-button>
              </template>
            </el-input>
            <el-button type="primary" @click="loadUsers">刷新</el-button>
          </div>
        </div>
      </template>

      <!-- 批量操作栏 -->
      <div class="batch-actions" v-if="selectedUsers.length > 0">
        <span class="selected-count">已选择 {{ selectedUsers.length }} 个用户</span>
        <el-button type="danger" size="small" @click="batchDeleteUsers">
          批量注销
        </el-button>
        <el-button size="small" @click="clearSelection">
          取消选择
        </el-button>
      </div>

      <el-table
        ref="tableRef"
        :data="users"
        v-loading="loading"
        stripe
        style="width: 100%"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column label="用户" min-width="320">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar
                v-if="isValidAvatarUrl(row.avatar_url)"
                :src="row.avatar_url"
                :size="36"
                @error="() => handleAvatarError(row)"
              >
                <span>{{ (row.nickname || '用户')[0] }}</span>
              </el-avatar>
              <div v-else class="user-avatar">
                <span>{{ (row.nickname || '用户')[0] }}</span>
              </div>
              <div class="user-info">
                <div class="nickname">{{ row.nickname || '未设置昵称' }}</div>
                <div class="user-id">ID: {{ row.user_id || row.id }}</div>
                <div class="union-id" v-if="row.unionid">UnionID: {{ row.unionid }}</div>
                <div class="union-id" v-else>UnionID: -</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="醒币" width="90" align="center">
          <template #default="{ row }">
            <span class="points-value">{{ row.points || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="累计充值" width="100" align="center">
          <template #default="{ row }">
            <span class="recharge-value">¥{{ formatYuan(row.total_recharge) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="生成次数" width="90" align="center">
          <template #default="{ row }">
            <span>{{ row.photo_count || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="最近登录" width="170">
          <template #default="{ row }">
            <span v-if="row.last_login_time" style="white-space: nowrap;">{{ formatDate(row.last_login_time) }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="170">
          <template #default="{ row }">
            <span style="white-space: nowrap;">{{ formatDate(row.created_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewDetail(row)">详情</el-button>
            <el-button type="primary" link size="small" @click="viewOrders(row)">订单</el-button>
            <el-button type="primary" link size="small" @click="viewPhotos(row)">照片</el-button>
            <el-button type="danger" link size="small" @click="deleteUser(row)">注销</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @change="loadUsers"
        />
      </div>
    </el-card>

    <!-- 用户详情弹窗 -->
    <el-dialog v-model="detailVisible" title="用户详情" width="900px" v-dialog-drag>
      <div v-if="currentUser" class="user-detail" v-loading="statsLoading">
        <div class="detail-header">
          <el-avatar
                v-if="isValidAvatarUrl(currentUser.avatar_url)"
                :src="currentUser.avatar_url"
                :size="60"
                @error="() => handleAvatarError(currentUser)"
              >
                <span>{{ (currentUser.nickname || '用户')[0] }}</span>
              </el-avatar>
          <div v-else class="detail-avatar">
            <span>{{ (currentUser.nickname || '用户')[0] }}</span>
          </div>
          <div class="detail-info">
            <h3>{{ currentUser.nickname || '未设置昵称' }}</h3>
            <p class="detail-id">{{ currentUser.user_id || currentUser.id }}</p>
          </div>
          <div class="detail-points">
            <div class="points-label">醒币余额</div>
            <div class="points-num">{{ currentUser.points || 0 }}</div>
            <el-button type="primary" size="small" @click="showAdjustPoints" style="margin-top: 8px;">
              修正醒币
            </el-button>
          </div>
        </div>

        <!-- 统计数据卡片 -->
        <div class="stats-cards">
          <div class="stat-card recharge">
            <div class="stat-icon">
              <el-icon><Wallet /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-title">累计充值</div>
              <div class="stat-value">¥{{ formatYuan(userStats.totalRecharge?.amount) }}</div>
              <div class="stat-sub">获得 {{ userStats.totalRecharge?.points || 0 }} 醒币 · {{ userStats.totalRecharge?.count || 0 }} 次</div>
            </div>
          </div>
          <div class="stat-card consume">
            <div class="stat-icon">
              <el-icon><ShoppingCart /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-title">累计消费</div>
              <div class="stat-value">{{ userStats.totalConsume?.points || 0 }} 醒币</div>
              <div class="stat-sub">{{ userStats.totalConsume?.count || 0 }} 次</div>
            </div>
          </div>
          <div class="stat-card share">
            <div class="stat-icon">
              <el-icon><Share /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-title">分享奖励</div>
              <div class="stat-value">{{ userStats.totalShare?.points || 0 }} 醒币</div>
              <div class="stat-sub">{{ userStats.totalShare?.count || 0 }} 次分享</div>
            </div>
          </div>
          <div class="stat-card invite">
            <div class="stat-icon">
              <el-icon><UserFilled /></el-icon>
            </div>
            <div class="stat-content">
              <div class="stat-title">邀请奖励</div>
              <div class="stat-value">{{ userStats.totalInvite?.points || 0 }} 醒币</div>
              <div class="stat-sub">{{ userStats.totalInvite?.count || 0 }} 人</div>
            </div>
          </div>
        </div>

        <el-tabs v-model="detailTab" class="detail-tabs">
          <el-tab-pane label="基本信息" name="info">
            <el-descriptions :column="2" border class="detail-desc">
              <el-descriptions-item label="OpenID" label-class-name="desc-label" class-name="desc-content" :span="2">
                <span class="id-text">{{ currentUser.openid || '-' }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="UnionID" label-class-name="desc-label" class-name="desc-content" :span="2">
                <span class="id-text">{{ currentUser.unionid || '-' }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="隐私协议" label-class-name="desc-label">
                <el-tag v-if="userStats.agreements?.privacy?.signed" type="success" size="small">
                  已签署
                </el-tag>
                <el-tag v-else type="info" size="small">未签署</el-tag>
                <span v-if="userStats.agreements?.privacy?.signedAt" class="agreement-time">
                  {{ formatDate(userStats.agreements.privacy.signedAt) }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="用户协议" label-class-name="desc-label">
                <el-tag v-if="userStats.agreements?.terms?.signed" type="success" size="small">
                  已签署
                </el-tag>
                <el-tag v-else type="info" size="small">未签署</el-tag>
                <span v-if="userStats.agreements?.terms?.signedAt" class="agreement-time">
                  {{ formatDate(userStats.agreements.terms.signedAt) }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="最近登录" label-class-name="desc-label">
                <span v-if="currentUser.last_login_time">{{ formatDate(currentUser.last_login_time) }}</span>
                <span v-else class="text-muted">-</span>
              </el-descriptions-item>
              <el-descriptions-item label="注册时间" label-class-name="desc-label">
                {{ formatDate(currentUser.created_at) }}
              </el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>

          <el-tab-pane label="操作记录" name="activities">
            <div class="activities-container" v-loading="activitiesLoading">
              <el-timeline v-if="userActivities.length > 0">
                <el-timeline-item
                  v-for="activity in userActivities"
                  :key="activity.id"
                  :timestamp="formatDate(activity.created_at)"
                  :type="getActivityType(activity).color"
                  placement="top"
                >
                  <div class="activity-item">
                    <el-tag :type="getActivityType(activity).tagType" size="small" class="activity-tag">
                      {{ getActivityType(activity).label }}
                    </el-tag>
                    <span class="activity-desc">{{ getActivityDescription(activity) }}</span>
                  </div>
                </el-timeline-item>
              </el-timeline>
              <el-empty v-else description="暂无操作记录" />
              <div class="activities-pagination" v-if="activitiesTotal > activitiesPageSize">
                <el-pagination
                  v-model:current-page="activitiesPage"
                  :page-size="activitiesPageSize"
                  :total="activitiesTotal"
                  layout="prev, pager, next"
                  @change="loadActivities"
                />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-dialog>

    <!-- 用户订单弹窗 -->
    <el-dialog v-model="ordersVisible" :title="'用户订单 - ' + (currentOrderUser?.nickname || currentOrderUser?.user_id || '')" width="900px" v-dialog-drag>
      <el-table :data="userOrders" v-loading="ordersLoading">
        <el-table-column prop="order_id" label="订单号" min-width="220" />
        <el-table-column prop="amount" label="金额" width="100">
          <template #default="{ row }">
            <span class="amount-text">¥{{ formatYuan(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="获得醒币" width="100">
          <template #default="{ row }">
            <span class="points-value">{{ (row.points_amount || 0) + (row.bonus_points || 0) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'paid' ? 'success' : 'warning'" size="small">
              {{ formatOrderStatus(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="170">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!ordersLoading && userOrders.length === 0" description="暂无订单" />
    </el-dialog>

    <!-- 用户照片弹窗 -->
    <el-dialog v-model="photosVisible" :title="'用户照片 - ' + (currentPhotoUser?.nickname || currentPhotoUser?.user_id || '')" width="900px" v-dialog-drag>
      <div class="photo-grid" v-loading="photosLoading">
        <div class="photo-item" v-for="photo in userPhotos" :key="photo.id">
          <el-image
            :src="photo.result_image"
            :preview-src-list="[photo.result_image]"
            fit="cover"
            class="photo-img"
          />
          <div class="photo-info">
            <span>{{ photo.spec || '-' }}</span>
            <span>{{ photo.bg_color || '-' }}</span>
          </div>
        </div>
      </div>
      <el-empty v-if="!photosLoading && userPhotos.length === 0" description="暂无照片" />
    </el-dialog>

    <!-- 醒币修正弹窗 -->
    <el-dialog v-model="adjustPointsVisible" title="醒币修正" width="500px" v-dialog-drag>
      <el-form :model="adjustForm" label-width="100px" v-if="currentUser">
        <el-form-item label="当前用户">
          <span>{{ currentUser.nickname || currentUser.user_id }}</span>
        </el-form-item>
        <el-form-item label="当前余额">
          <span class="points-value">{{ currentUser.points || 0 }} 醒币</span>
        </el-form-item>
        <el-form-item label="修正类型">
          <el-radio-group v-model="adjustForm.type">
            <el-radio value="add">增加</el-radio>
            <el-radio value="deduct">扣减</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="修正数量" required>
          <el-input-number
            v-model="adjustForm.amount"
            :min="1"
            :max="99999"
            placeholder="请输入修正数量"
          />
          <span style="margin-left: 8px; color: #909399;">醒币</span>
        </el-form-item>
        <el-form-item label="修正后余额">
          <span :class="['points-preview', adjustPreview < 0 ? 'negative' : '']">
            {{ adjustPreview }} 醒币
          </span>
          <span v-if="adjustPreview < 0" style="color: #f56c6c; margin-left: 8px;">
            (余额不足)
          </span>
        </el-form-item>
        <el-form-item label="修正原因" required>
          <el-input
            v-model="adjustForm.reason"
            type="textarea"
            :rows="3"
            placeholder="请输入修正原因，如：客服补偿、系统异常修正等"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustPointsVisible = false">取消</el-button>
        <el-button
          type="primary"
          @click="submitAdjustPoints"
          :loading="adjustLoading"
          :disabled="!adjustForm.amount || !adjustForm.reason || adjustPreview < 0"
        >
          确认修正
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { usersApi } from '../api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Wallet, ShoppingCart, Share, UserFilled } from '@element-plus/icons-vue'

// 配置dayjs支持时区
dayjs.extend(utc)
dayjs.extend(timezone)

const loading = ref(false)
const users = ref([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const keyword = ref('')

const detailVisible = ref(false)
const currentUser = ref(null)
const userStats = ref({})
const statsLoading = ref(false)
const detailTab = ref('info')

// 操作记录相关
const activitiesLoading = ref(false)
const userActivities = ref([])
const activitiesPage = ref(1)
const activitiesPageSize = ref(20)
const activitiesTotal = ref(0)

const ordersVisible = ref(false)
const ordersLoading = ref(false)
const userOrders = ref([])
const currentOrderUser = ref(null)

const photosVisible = ref(false)
const photosLoading = ref(false)
const userPhotos = ref([])
const currentPhotoUser = ref(null)

// 多选相关
const tableRef = ref(null)
const selectedUsers = ref([])

// 醒币修正相关
const adjustPointsVisible = ref(false)
const adjustLoading = ref(false)
const adjustForm = ref({
  type: 'add',
  amount: null,
  reason: ''
})

// 计算修正后的余额预览
const adjustPreview = computed(() => {
  if (!currentUser.value || !adjustForm.value.amount) {
    return currentUser.value?.points || 0
  }
  const current = currentUser.value.points || 0
  const amount = adjustForm.value.amount || 0
  if (adjustForm.value.type === 'add') {
    return current + amount
  } else {
    return current - amount
  }
})

const formatDate = (date) => {
  if (!date) return '-'
  // 数据库存储的是UTC时间，需要转换为北京时间
  // 无论是 "2025-12-22 06:25:31" 还是 "2025-12-22T06:25:31Z" 格式，都当作UTC解析
  return dayjs.utc(date).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
}

// 格式化金额（分转元）
const formatMoney = (val) => {
  if (!val) return '0.00'
  return (val / 100).toFixed(2)
}

// 格式化金额（已经是元，直接格式化）
const formatYuan = (val) => {
  if (!val) return '0.00'
  return Number(val).toFixed(2)
}

// 格式化订单状态
const formatOrderStatus = (status) => {
  const statusMap = {
    'paid': '已支付',
    'pending': '待支付',
    'cancelled': '已取消',
    'refunded': '已退款',
    'failed': '支付失败'
  }
  return statusMap[status] || status
}

// 检查头像URL是否有效（过滤掉wxfile://等无效URL）
const isValidAvatarUrl = (url) => {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('wxfile://')) return false
  if (url.startsWith('http://tmp') || url.startsWith('https://tmp')) return false
  return url.startsWith('http://') || url.startsWith('https://')
}

// 处理头像加载失败（微信头像防盗链等情况）
const handleAvatarError = (user) => {
  // 将头像URL标记为无效，触发显示默认头像
  user.avatar_url = null
}

const loadUsers = async () => {
  loading.value = true
  try {
    const res = await usersApi.getList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value
    })
    if (res.code === 200 || res.code === 0 || res.code === 0) {
      users.value = res.data.list
      total.value = res.data.total
    }
  } finally {
    loading.value = false
  }
}

const viewDetail = async (user) => {
  currentUser.value = user
  userStats.value = {}
  userActivities.value = []
  activitiesPage.value = 1
  activitiesTotal.value = 0
  detailTab.value = 'info'
  detailVisible.value = true
  statsLoading.value = true

  try {
    const res = await usersApi.getStats(user.user_id || user.id)
    if (res.code === 200 || res.code === 0) {
      userStats.value = res.data
    }
  } catch (error) {
    console.error('获取用户统计失败:', error)
  } finally {
    statsLoading.value = false
  }

  // 加载操作记录
  loadActivities()
}

// 加载用户操作记录
const loadActivities = async () => {
  if (!currentUser.value) return

  activitiesLoading.value = true
  try {
    const res = await usersApi.getActivities(currentUser.value.user_id || currentUser.value.id, {
      page: activitiesPage.value,
      pageSize: activitiesPageSize.value
    })
    if (res.code === 200 || res.code === 0) {
      userActivities.value = res.data.list
      activitiesTotal.value = res.data.total
    }
  } catch (error) {
    console.error('获取用户操作记录失败:', error)
  } finally {
    activitiesLoading.value = false
  }
}

// 获取操作类型信息
const getActivityType = (activity) => {
  const typeMap = {
    points: {
      new_user: { label: '新用户注册', color: 'success', tagType: 'success' },
      recharge: { label: '充值', color: 'success', tagType: 'success' },
      consume: { label: '消费', color: 'warning', tagType: 'warning' },
      admin_adjust: { label: '管理员调整', color: 'primary', tagType: '' },
      share_photo: { label: '分享奖励', color: 'primary', tagType: 'primary' },
      invite_friend: { label: '邀请奖励', color: 'primary', tagType: 'primary' },
      daily_login: { label: '每日登录', color: 'info', tagType: 'info' }
    },
    photo: {
      generating: { label: '生成中', color: 'warning', tagType: 'warning' },
      done: { label: '照片生成', color: 'success', tagType: 'success' },
      failed: { label: '生成失败', color: 'danger', tagType: 'danger' }
    },
    order: {
      pending: { label: '创建订单', color: 'info', tagType: 'info' },
      paid: { label: '支付成功', color: 'success', tagType: 'success' },
      cancelled: { label: '订单取消', color: 'info', tagType: 'info' },
      refunded: { label: '订单退款', color: 'warning', tagType: 'warning' }
    },
    invite: {
      completed: { label: '邀请成功', color: 'success', tagType: 'success' },
      pending: { label: '邀请中', color: 'info', tagType: 'info' }
    }
  }

  const activityType = activity.activity_type
  const subType = activity.sub_type

  if (typeMap[activityType] && typeMap[activityType][subType]) {
    return typeMap[activityType][subType]
  }

  return { label: activityType, color: 'info', tagType: 'info' }
}

// 获取操作描述
const getActivityDescription = (activity) => {
  const type = activity.activity_type
  const subType = activity.sub_type

  switch (type) {
    case 'points':
      const amount = activity.amount || 0
      const sign = amount > 0 ? '+' : ''
      const desc = activity.description || ''
      return `${sign}${amount} 醒币${desc ? ' - ' + desc : ''}`

    case 'photo':
      const scene = activity.scene || '未知场景'
      const spec = activity.spec || ''
      const bgColor = activity.bg_color || ''
      if (subType === 'done') {
        return `生成照片成功 - ${scene}${spec ? ' · ' + spec : ''}${bgColor ? ' · ' + bgColor : ''}`
      } else if (subType === 'failed') {
        return `照片生成失败 - ${scene}`
      }
      return `正在生成照片 - ${scene}`

    case 'order':
      const orderAmount = (activity.amount || 0) / 100
      const points = (activity.points_amount || 0) + (activity.bonus_points || 0)
      if (subType === 'paid') {
        return `支付 ¥${orderAmount.toFixed(2)}，获得 ${points} 醒币`
      }
      return `订单金额 ¥${orderAmount.toFixed(2)}`

    case 'invite':
      const inviteeName = activity.invitee_nickname || '用户'
      const rewardPoints = activity.reward_points || 0
      if (subType === 'completed') {
        return `成功邀请 ${inviteeName}，获得 ${rewardPoints} 醒币`
      }
      return `邀请 ${inviteeName}`

    default:
      return activity.description || '-'
  }
}

const viewOrders = async (user) => {
  currentOrderUser.value = user
  ordersVisible.value = true
  ordersLoading.value = true
  userOrders.value = []
  try {
    const res = await usersApi.getOrders(user.user_id || user.id, { pageSize: 50 })
    if (res.code === 200 || res.code === 0) {
      userOrders.value = res.data.list
    }
  } finally {
    ordersLoading.value = false
  }
}

const viewPhotos = async (user) => {
  currentPhotoUser.value = user
  photosVisible.value = true
  photosLoading.value = true
  userPhotos.value = []
  try {
    const res = await usersApi.getPhotos(user.user_id || user.id, { pageSize: 50 })
    if (res.code === 200 || res.code === 0) {
      userPhotos.value = res.data.list
    }
  } finally {
    photosLoading.value = false
  }
}

// 注销用户
const deleteUser = async (user) => {
  try {
    await ElMessageBox.confirm(
      `确定要注销用户 "${user.nickname || user.user_id}" 吗？注销后该用户的所有数据（醒币、订单、照片等）将被永久删除，下次登录将作为新用户。`,
      '注销用户',
      {
        confirmButtonText: '确定注销',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )

    const res = await usersApi.deleteUser(user.user_id || user.id)
    if (res.code === 200 || res.code === 0) {
      ElMessage.success('用户注销成功')
      loadUsers()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('注销失败: ' + (error.message || '未知错误'))
    }
  }
}

// 多选处理
const handleSelectionChange = (selection) => {
  selectedUsers.value = selection
}

// 清除选择
const clearSelection = () => {
  tableRef.value?.clearSelection()
  selectedUsers.value = []
}

// 批量注销用户
const batchDeleteUsers = async () => {
  if (selectedUsers.value.length === 0) {
    ElMessage.warning('请先选择要注销的用户')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要批量注销选中的 ${selectedUsers.value.length} 个用户吗？注销后这些用户的所有数据（醒币、订单、照片等）将被永久删除，下次登录将作为新用户。`,
      '批量注销用户',
      {
        confirmButtonText: '确定注销',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )

    const userIds = selectedUsers.value.map(u => u.user_id || u.id)
    const res = await usersApi.batchDeleteUsers(userIds)
    if (res.code === 200 || res.code === 0) {
      ElMessage.success(`成功注销 ${res.data?.deletedCount || userIds.length} 个用户`)
      clearSelection()
      loadUsers()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('批量注销失败: ' + (error.message || '未知错误'))
    }
  }
}

// 显示醒币修正弹窗
const showAdjustPoints = () => {
  adjustForm.value = {
    type: 'add',
    amount: null,
    reason: ''
  }
  adjustPointsVisible.value = true
}

// 提交醒币修正
const submitAdjustPoints = async () => {
  if (!adjustForm.value.amount || !adjustForm.value.reason) {
    ElMessage.warning('请填写修正数量和原因')
    return
  }

  if (adjustPreview.value < 0) {
    ElMessage.error('扣减后余额不能为负数')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要${adjustForm.value.type === 'add' ? '增加' : '扣减'} ${adjustForm.value.amount} 醒币吗？`,
      '确认修正',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    adjustLoading.value = true

    // 计算实际修正数量（增加为正，扣减为负）
    const actualAmount = adjustForm.value.type === 'add'
      ? adjustForm.value.amount
      : -adjustForm.value.amount

    const res = await usersApi.adjustPoints(currentUser.value.user_id || currentUser.value.id, {
      amount: actualAmount,
      type: adjustForm.value.type,
      reason: adjustForm.value.reason
    })

    if (res.code === 200 || res.code === 0) {
      ElMessage.success(res.message || '醒币修正成功')
      // 调试日志
      console.log('API响应:', JSON.stringify(res))
      console.log('res.data:', res.data)
      console.log('newBalance:', res.data?.newBalance)
      console.log('adjustPreview:', adjustPreview.value)
      // 先保存新余额，再关闭弹窗
      const newPoints = (res.data && res.data.newBalance !== undefined)
        ? res.data.newBalance
        : adjustPreview.value
      console.log('最终newPoints:', newPoints)
      adjustPointsVisible.value = false
      // 更新当前用户的醒币余额
      currentUser.value.points = newPoints
      console.log('更新后currentUser.points:', currentUser.value.points)
      // 刷新用户列表
      loadUsers()
    } else {
      ElMessage.error(res.message || '醒币修正失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('醒币修正失败:', error)
      ElMessage.error(error.response?.data?.message || '醒币修正失败')
    }
  } finally {
    adjustLoading.value = false
  }
}

onMounted(() => {
  loadUsers()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-info .nickname {
  font-weight: 500;
  color: #303133;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-info .user-id {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-info .union-id {
  font-size: 10px;
  color: #b0b3b8;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.points-value {
  font-weight: 600;
  color: #e6a23c;
  font-size: 15px;
}

.recharge-value {
  font-weight: 500;
  color: #67c23a;
  font-size: 14px;
}

.text-muted {
  color: #c0c4cc;
}

.pagination-wrap {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

/* 批量操作栏 */
.batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  border-radius: 4px;
}

.selected-count {
  font-size: 14px;
  color: #f56c6c;
  font-weight: 500;
}

/* 用户详情样式 */
.user-detail {
  padding: 0 10px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid #ebeef5;
}

.detail-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 24px;
  flex-shrink: 0;
}

.detail-info {
  flex: 1;
}

.detail-info h3 {
  margin: 0 0 4px 0;
  font-size: 18px;
  color: #303133;
}

.detail-id {
  margin: 0;
  font-size: 12px;
  color: #909399;
}

.detail-points {
  text-align: center;
  padding: 10px 20px;
  background: linear-gradient(135deg, #fff9e6 0%, #fff3cc 100%);
  border-radius: 8px;
}

.points-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.points-num {
  font-size: 24px;
  font-weight: 600;
  color: #e6a23c;
}

/* 统计卡片 */
.stats-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  background: #f5f7fa;
}

.stat-card.recharge {
  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
}

.stat-card.recharge .stat-icon {
  background: #4caf50;
}

.stat-card.consume {
  background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
}

.stat-card.consume .stat-icon {
  background: #ff9800;
}

.stat-card.share {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
}

.stat-card.share .stat-icon {
  background: #2196f3;
}

.stat-card.invite {
  background: linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%);
}

.stat-card.invite .stat-icon {
  background: #9c27b0;
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
  flex-shrink: 0;
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.stat-sub {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

.detail-desc {
  margin-top: 16px;
}

:deep(.desc-label) {
  width: 80px !important;
  min-width: 80px !important;
  white-space: nowrap;
}

:deep(.desc-content) {
  word-break: break-all;
}

.id-text {
  font-size: 12px;
  color: #606266;
  word-break: break-all;
}

.agreement-time {
  font-size: 11px;
  color: #909399;
  margin-left: 8px;
}

.amount-text {
  font-weight: 500;
  color: #f56c6c;
}

/* 照片网格 */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  min-height: 100px;
}

.photo-item {
  border-radius: 8px;
  overflow: hidden;
  background: #f5f5f5;
}

.photo-img {
  width: 100%;
  height: 150px;
}

.photo-info {
  padding: 8px;
  font-size: 12px;
  color: #666;
  display: flex;
  justify-content: space-between;
}

/* 醒币修正样式 */
.points-preview {
  font-weight: 600;
  color: #67c23a;
  font-size: 16px;
}

.points-preview.negative {
  color: #f56c6c;
}

/* 详情页 Tabs 样式 */
.detail-tabs {
  margin-top: 16px;
}

/* 操作记录样式 */
.activities-container {
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
  padding: 10px 0;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.activity-tag {
  flex-shrink: 0;
}

.activity-desc {
  font-size: 13px;
  color: #606266;
}

.activities-pagination {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
</style>
