<template>
  <div class="orders-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>订单管理</span>
          <div class="filter-bar">
            <el-input
              v-model="keyword"
              placeholder="搜索订单号/用户ID/昵称"
              style="width: 200px"
              clearable
            />
            <el-select v-model="status" placeholder="状态" clearable style="width: 120px">
              <el-option label="已支付" value="paid" />
              <el-option label="未支付" value="pending" />
              <el-option label="已取消" value="cancelled" />
            </el-select>
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              style="width: 240px"
            />
            <el-button type="primary" @click="loadOrders">搜索</el-button>
          </div>
        </div>
      </template>

      <!-- 统计摘要 -->
      <div class="stats-summary">
        <div class="stat-item">
          <span class="label">总订单</span>
          <span class="value">{{ stats.totalOrders || 0 }}</span>
        </div>
        <div class="stat-item">
          <span class="label">已支付</span>
          <span class="value">{{ stats.paidOrders || 0 }}</span>
        </div>
        <div class="stat-item">
          <span class="label">总金额</span>
          <span class="value amount">¥{{ formatMoney(stats.totalAmount) }}</span>
        </div>
        <div class="stat-item">
          <span class="label">今日订单</span>
          <span class="value">{{ stats.todayOrders || 0 }}</span>
        </div>
        <div class="stat-item">
          <span class="label">今日金额</span>
          <span class="value amount">¥{{ formatMoney(stats.todayAmount) }}</span>
        </div>
      </div>

      <el-table :data="orders" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="order_id" label="订单号" min-width="200" show-overflow-tooltip />
        <el-table-column label="用户" min-width="200">
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
        <el-table-column prop="amount" label="金额" min-width="100">
          <template #default="{ row }">
            <span class="amount-text">¥{{ row.amount }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="points" label="醒币" min-width="100">
          <template #default="{ row }">
            <span class="points-text">{{ row.points }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" min-width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" min-width="170">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="paid_at" label="支付时间" min-width="170">
          <template #default="{ row }">{{ row.paid_at ? formatDate(row.paid_at) : '-' }}</template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @change="loadOrders"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { ordersApi } from '../api'

// 配置dayjs支持时区
dayjs.extend(utc)
dayjs.extend(timezone)

const loading = ref(false)
const orders = ref([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const keyword = ref('')
const status = ref('')
const dateRange = ref([])
const stats = ref({})

const formatDate = (date) => {
  if (!date) return '-'
  // 数据库存储的是UTC时间，需要转换为北京时间
  return dayjs.utc(date).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
}
const formatMoney = (val) => (val || 0).toFixed(2)

// 订单状态显示
const getStatusType = (status) => {
  const types = {
    paid: 'success',
    pending: 'warning',
    cancelled: 'info'
  }
  return types[status] || 'info'
}

const getStatusText = (status) => {
  const texts = {
    paid: '已支付',
    pending: '未支付',
    cancelled: '已取消'
  }
  return texts[status] || status
}

// 检查头像URL是否有效（过滤掉wxfile://等无效URL）
const isValidAvatarUrl = (url) => {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('wxfile://')) return false
  if (url.startsWith('http://tmp') || url.startsWith('https://tmp')) return false
  return url.startsWith('http://') || url.startsWith('https://')
}

const loadOrders = async () => {
  loading.value = true
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value,
      status: status.value
    }
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    const res = await ordersApi.getList(params)
    if (res.code === 200 || res.code === 0) {
      orders.value = res.data.list
      total.value = res.data.total
    }
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  try {
    const res = await ordersApi.getStats()
    if (res.code === 200 || res.code === 0) {
      stats.value = res.data
    }
  } catch (error) {
    console.error(error)
  }
}

onMounted(() => {
  loadOrders()
  loadStats()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.stats-summary {
  display: flex;
  gap: 40px;
  padding: 16px 0;
  margin-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-item .label {
  font-size: 12px;
  color: #999;
}

.stat-item .value {
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

.stat-item .value.amount {
  color: #C68B4D;
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

.amount-text {
  color: #f56c6c;
  font-weight: 600;
}

.points-text {
  color: #e6a23c;
  font-weight: 600;
}

.pagination-wrap {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
