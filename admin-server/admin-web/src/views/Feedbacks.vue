<template>
  <div class="feedbacks-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>意见反馈管理</span>
          <el-button type="primary" @click="fetchList">刷新</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" style="width: 100%">
        <el-table-column prop="feedback_id" label="反馈ID" width="180" show-overflow-tooltip />
        <el-table-column label="用户" width="180">
          <template #default="{ row }">
            <div class="user-cell">
              <span class="nickname">{{ row.nickname || '未知用户' }}</span>
              <span class="user-id">{{ row.user_id }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="反馈内容" min-width="200" show-overflow-tooltip />
        <el-table-column label="图片" width="160">
          <template #default="{ row }">
            <div v-if="row.images && row.images.length > 0" class="feedback-images">
              <el-image
                v-for="(img, index) in row.images.slice(0, 3)"
                :key="index"
                class="feedback-img"
                :src="img"
                :preview-src-list="row.images"
                :initial-index="index"
                preview-teleported
                fit="cover"
              />
              <span v-if="row.images.length > 3" class="more-images">+{{ row.images.length - 3 }}</span>
            </div>
            <span v-else class="no-images">无</span>
          </template>
        </el-table-column>
        <el-table-column prop="contact" label="联系方式" width="120" show-overflow-tooltip />
        <el-table-column label="打赏" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.reward_amount > 0" type="warning" effect="dark">
              +{{ row.reward_amount }}
            </el-tag>
            <span v-else class="no-reward">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'pending' ? 'warning' : 'success'" size="small">
              {{ row.status === 'pending' ? '待处理' : '已回复' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="提交时间" width="170">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleReply(row)">
              {{ row.status === 'pending' ? '回复' : '查看' }}
            </el-button>
            <el-button
              type="warning"
              link
              size="small"
              @click="handleReward(row)"
              :disabled="row.reward_amount > 0"
            >
              {{ row.reward_amount > 0 ? '已打赏' : '打赏' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 回复弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="currentRow?.status === 'pending' ? '回复反馈' : '反馈详情'"
      width="500px"
      v-dialog-drag
    >
      <div v-if="currentRow">
        <div class="detail-item">
          <strong>反馈内容：</strong>
          <p>{{ currentRow.content }}</p>
        </div>
        <div class="detail-item" v-if="currentRow.reply_content">
          <strong>管理员回复：</strong>
          <p>{{ currentRow.reply_content }}</p>
          <small v-if="currentRow.replied_at">回复时间：{{ currentRow.replied_at }}</small>
        </div>
        <div class="reply-form" v-if="currentRow.status === 'pending'">
          <el-input
            v-model="replyText"
            type="textarea"
            :rows="4"
            placeholder="请输入回复内容..."
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button
          v-if="currentRow?.status === 'pending'"
          type="primary"
          :loading="replyLoading"
          @click="submitReply"
        >
          提交回复
        </el-button>
      </template>
    </el-dialog>

    <!-- 打赏弹窗 -->
    <el-dialog
      v-model="rewardDialogVisible"
      title=""
      width="420px"
      class="reward-dialog-wrapper"
      :show-close="false"
      v-dialog-drag
    >
      <div v-if="rewardRow" class="reward-dialog">
        <!-- 头部 -->
        <div class="reward-header">
          <div class="reward-icon-wrap">
            <svg class="reward-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 12 20 22 4 22 4 12"></polyline>
              <rect x="2" y="7" width="20" height="5"></rect>
              <line x1="12" y1="22" x2="12" y2="7"></line>
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
              <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
            </svg>
          </div>
          <h3 class="reward-title">打赏醒币</h3>
          <p class="reward-subtitle">感谢用户的宝贵反馈</p>
        </div>

        <!-- 用户信息 -->
        <div class="user-info-card">
          <div class="user-avatar">
            <span>{{ (rewardRow.nickname || '用户')[0] }}</span>
          </div>
          <div class="user-details">
            <div class="user-name">{{ rewardRow.nickname || '未知用户' }}</div>
            <div class="user-id-text">ID: {{ rewardRow.user_id }}</div>
          </div>
        </div>

        <!-- 反馈内容 -->
        <div class="feedback-preview">
          <div class="preview-label">反馈内容</div>
          <div class="preview-content">{{ rewardRow.content }}</div>
        </div>

        <!-- 金额选择 -->
        <div class="amount-section">
          <div class="amount-label">选择打赏金额</div>
          <div class="amount-options">
            <div
              v-for="amt in [5, 10, 20, 50, 100, 200]"
              :key="amt"
              class="amount-option"
              :class="{ active: rewardAmount === amt && !useCustom }"
              @click="selectAmount(amt)"
            >
              <span class="amount-value">{{ amt }}</span>
              <span class="amount-unit">醒币</span>
            </div>
          </div>
          <div class="custom-input-wrap">
            <span class="custom-label">自定义金额：</span>
            <el-input-number
              v-model="customAmount"
              :min="1"
              :max="500"
              size="small"
              :controls="true"
              @change="handleCustomAmount"
              @focus="useCustom = true"
            />
            <span class="custom-unit">醒币</span>
            <span class="custom-hint">(上限500)</span>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="reward-footer">
          <el-button @click="rewardDialogVisible = false" size="large">取消</el-button>
          <el-button
            type="warning"
            size="large"
            :loading="rewardLoading"
            @click="submitReward"
            class="confirm-btn"
          >
            确认打赏 {{ rewardAmount }} 醒币
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { ElMessage } from 'element-plus'
import api from '../api'

// 配置dayjs支持时区
dayjs.extend(utc)
dayjs.extend(timezone)

const list = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const currentRow = ref(null)
const replyText = ref('')
const replyLoading = ref(false)

// 打赏相关
const rewardDialogVisible = ref(false)
const rewardRow = ref(null)
const rewardAmount = ref(10)
const customAmount = ref(10)
const rewardLoading = ref(false)
const useCustom = ref(false)

const formatDate = (date) => {
  if (!date) return '-'
  // 数据库存储的是UTC时间，需要转换为北京时间
  return dayjs.utc(date).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await api.get('/feedback/admin/list')
    if (res.code === 200 || res.code === 0) {
      list.value = res.data
    }
  } catch (error) {
    console.error('加载反馈列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleReply = (row) => {
  currentRow.value = row
  replyText.value = row.reply_content || ''
  dialogVisible.value = true
}

const submitReply = async () => {
  if (!replyText.value.trim()) {
    return ElMessage.warning('请输入回复内容')
  }

  replyLoading.value = true
  try {
    const res = await api.post('/feedback/admin/reply', {
      feedbackId: currentRow.value.feedback_id,
      replyContent: replyText.value
    })
    if (res.code === 200 || res.code === 0) {
      ElMessage.success('回复成功')
      dialogVisible.value = false
      fetchList()
    }
  } catch (error) {
    console.error('回复失败:', error)
  } finally {
    replyLoading.value = false
  }
}

onMounted(() => {
  fetchList()
})

// 打赏相关函数
const handleReward = (row) => {
  rewardRow.value = row
  rewardAmount.value = 10
  customAmount.value = 10
  useCustom.value = false
  rewardDialogVisible.value = true
}

const selectAmount = (amt) => {
  rewardAmount.value = amt
  useCustom.value = false
}

const handleCustomAmount = (val) => {
  if (val) {
    rewardAmount.value = val
    useCustom.value = true
  }
}

const submitReward = async () => {
  if (!rewardAmount.value || rewardAmount.value <= 0) {
    return ElMessage.warning('请选择打赏金额')
  }

  if (rewardAmount.value > 500) {
    return ElMessage.warning('打赏金额不能超过500醒币')
  }

  rewardLoading.value = true
  try {
    const res = await api.post('/feedback/admin/reward', {
      feedbackId: rewardRow.value.feedback_id,
      amount: rewardAmount.value
    })
    if (res.code === 200 || res.code === 0) {
      ElMessage.success(`打赏成功！${rewardRow.value.nickname || '用户'}获得 ${rewardAmount.value} 醒币`)
      rewardDialogVisible.value = false
      fetchList()
    } else {
      ElMessage.error(res.message || '打赏失败')
    }
  } catch (error) {
    console.error('打赏失败:', error)
    ElMessage.error('打赏失败')
  } finally {
    rewardLoading.value = false
  }
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.user-cell .nickname {
  font-weight: 500;
  color: #303133;
}
.user-cell .user-id {
  font-size: 11px;
  color: #909399;
}

.detail-item {
  margin-bottom: 20px;
}
.detail-item p {
  background: #f5f7fa;
  padding: 10px;
  border-radius: 4px;
  margin-top: 5px;
  white-space: pre-wrap;
}
.reply-form {
  margin-top: 20px;
}
.no-reward {
  color: #c0c4cc;
}
.no-images {
  color: #c0c4cc;
}
.feedback-images {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.feedback-img {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  cursor: pointer;
}
.more-images {
  font-size: 12px;
  color: #909399;
  margin-left: 2px;
}

/* 打赏弹窗样式 */
.reward-dialog {
  padding: 0 10px;
}

.reward-header {
  text-align: center;
  margin-bottom: 24px;
}

.reward-icon-wrap {
  width: 60px;
  height: 60px;
  margin: 0 auto 12px;
  background: linear-gradient(135deg, #ffd700 0%, #ffb347 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(255, 179, 71, 0.4);
}

.reward-svg {
  width: 32px;
  height: 32px;
  color: white;
}

.reward-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.reward-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #909399;
}

.user-info-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 16px;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 16px;
}

.user-details {
  flex: 1;
}

.user-name {
  font-weight: 500;
  color: #303133;
  font-size: 14px;
}

.user-id-text {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.feedback-preview {
  margin-bottom: 20px;
}

.preview-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 6px;
}

.preview-content {
  background: #f5f7fa;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: #303133;
  max-height: 60px;
  overflow-y: auto;
  line-height: 1.5;
}

.amount-section {
  margin-bottom: 8px;
}

.amount-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 10px;
}

.amount-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}

.amount-option {
  padding: 10px 8px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}

.amount-option:hover {
  border-color: #f0a020;
}

.amount-option.active {
  border-color: #f0a020;
  background: linear-gradient(135deg, #fff9e6 0%, #fff3cc 100%);
  box-shadow: 0 2px 8px rgba(240, 160, 32, 0.2);
}

.amount-value {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.amount-option.active .amount-value {
  color: #d48806;
}

.amount-unit {
  font-size: 11px;
  color: #909399;
}

.custom-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed #ebeef5;
}

.custom-label {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}

.custom-unit {
  font-size: 13px;
  color: #606266;
}

.custom-hint {
  font-size: 11px;
  color: #c0c4cc;
}

.reward-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.confirm-btn {
  min-width: 160px;
}
</style>

<style>
/* 全局样式覆盖弹窗 */
.reward-dialog-wrapper .el-dialog__header {
  display: none;
}
.reward-dialog-wrapper .el-dialog__body {
  padding: 24px 24px 16px;
}
.reward-dialog-wrapper .el-dialog__footer {
  padding: 0 24px 24px;
}
</style>
