<template>
  <div class="creator-scenes-page">
    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card pending">
          <div class="stat-content">
            <div class="stat-value">{{ stats.pending }}</div>
            <div class="stat-label">待审核</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card approved">
          <div class="stat-content">
            <div class="stat-value">{{ stats.approved }}</div>
            <div class="stat-label">已通过</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card rejected">
          <div class="stat-content">
            <div class="stat-value">{{ stats.rejected }}</div>
            <div class="stat-label">已拒绝</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card total">
          <div class="stat-content">
            <div class="stat-value">{{ stats.total }}</div>
            <div class="stat-label">总数</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选栏 -->
    <el-card class="filter-card">
      <el-form :inline="true">
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部" clearable @change="loadScenes">
            <el-option label="全部" value="all" />
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
            <el-option label="草稿" value="draft" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadScenes">刷新</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 场景列表 -->
    <el-card class="table-card">
      <el-table :data="scenes" v-loading="loading" stripe>
        <el-table-column label="场景" min-width="200">
          <template #default="{ row }">
            <div class="scene-info">
              <el-image
                :src="row.icon"
                class="scene-icon"
                fit="cover"
                :preview-src-list="[row.icon]"
              >
                <template #error>
                  <div class="image-placeholder">
                    <el-icon><Picture /></el-icon>
                  </div>
                </template>
              </el-image>
              <div class="scene-detail">
                <div class="scene-name">{{ row.name }}</div>
                <div class="scene-desc">{{ row.description || '暂无描述' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="创作者" width="150">
          <template #default="{ row }">
            <div class="creator-info">
              <el-avatar :src="row.creator_avatar" :size="32" />
              <span class="creator-name">{{ row.creator_pen_name || row.creator_nickname || '未知' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="消耗" width="100" align="center">
          <template #default="{ row }">
            <span class="points-cost">{{ row.points_cost }}醒币</span>
          </template>
        </el-table-column>

        <el-table-column label="步骤数" width="80" align="center">
          <template #default="{ row }">
            {{ row.step_count || 0 }}
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.review_status)">
              {{ getStatusText(row.review_status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="提交时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.submitted_at) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewDetail(row)">查看</el-button>
            <template v-if="row.review_status === 'pending'">
              <el-button type="success" link @click="approveScene(row)">通过</el-button>
              <el-button type="danger" link @click="showRejectDialog(row)">拒绝</el-button>
            </template>
            <el-button type="warning" link v-if="row.review_status === 'approved'" @click="offlineScene(row)">下架</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadScenes"
          @current-change="loadScenes"
        />
      </div>
    </el-card>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="场景详情" width="800px">
      <div class="detail-content" v-if="currentScene">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="场景名称">{{ currentScene.name }}</el-descriptions-item>
          <el-descriptions-item label="消耗醒币">{{ currentScene.points_cost }}</el-descriptions-item>
          <el-descriptions-item label="创作者">{{ currentScene.creator_pen_name || currentScene.creator_nickname }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(currentScene.review_status)">
              {{ getStatusText(currentScene.review_status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{ currentScene.description || '暂无' }}</el-descriptions-item>
        </el-descriptions>

        <div class="section-title">步骤配置 ({{ currentScene.steps?.length || 0 }}步)</div>
        <el-table :data="currentScene.steps" size="small" border>
          <el-table-column prop="step_order" label="序号" width="60" />
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="step_type" label="类型" width="120" />
          <el-table-column label="选项数" width="80">
            <template #default="{ row }">{{ row.options?.length || 0 }}</template>
          </el-table-column>
        </el-table>

        <div class="section-title">Prompt模板</div>
        <el-input
          type="textarea"
          :rows="4"
          :value="currentScene.prompts?.[0]?.prompt_template || '未配置'"
          readonly
        />
      </div>
    </el-dialog>

    <!-- 拒绝原因弹窗 -->
    <el-dialog v-model="rejectVisible" title="拒绝原因" width="500px">
      <el-form>
        <el-form-item label="拒绝原因" required>
          <el-input
            v-model="rejectReason"
            type="textarea"
            :rows="4"
            placeholder="请输入拒绝原因，将展示给创作者"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" @click="confirmReject" :loading="rejecting">确认拒绝</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import request from '../api'

// 统计数据
const stats = ref({
  pending: 0,
  approved: 0,
  rejected: 0,
  draft: 0,
  total: 0
})

// 筛选条件
const filters = reactive({
  status: 'pending'
})

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

// 数据
const loading = ref(false)
const scenes = ref([])
const currentScene = ref(null)
const detailVisible = ref(false)
const rejectVisible = ref(false)
const rejectReason = ref('')
const rejecting = ref(false)
const rejectingScene = ref(null)

// 加载统计
const loadStats = async () => {
  try {
    const res = await request.get('/admin/creator-scenes/stats/overview')
    if (res.code === 0) {
      stats.value = res.data
    }
  } catch (error) {
    console.error('加载统计失败:', error)
  }
}

// 加载场景列表
const loadScenes = async () => {
  loading.value = true
  try {
    const res = await request.get('/admin/creator-scenes/pending', {
      params: {
        status: filters.status,
        page: pagination.page,
        pageSize: pagination.pageSize
      }
    })
    if (res.code === 0) {
      scenes.value = res.data.list
      pagination.total = res.data.total
    }
  } catch (error) {
    console.error('加载场景列表失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

// 查看详情
const viewDetail = async (row) => {
  try {
    const res = await request.get(`/admin/creator-scenes/${row.id}`)
    if (res.code === 0) {
      currentScene.value = res.data
      detailVisible.value = true
    }
  } catch (error) {
    console.error('加载详情失败:', error)
    ElMessage.error('加载详情失败')
  }
}

// 审核通过
const approveScene = async (row) => {
  try {
    await ElMessageBox.confirm('确定要通过该场景的审核吗？', '确认通过', {
      type: 'success'
    })

    const res = await request.post(`/admin/creator-scenes/${row.id}/approve`)
    if (res.code === 0) {
      ElMessage.success('审核通过')
      loadScenes()
      loadStats()
    } else {
      ElMessage.error(res.message || '操作失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('审核通过失败:', error)
      ElMessage.error('操作失败')
    }
  }
}

// 显示拒绝弹窗
const showRejectDialog = (row) => {
  rejectingScene.value = row
  rejectReason.value = ''
  rejectVisible.value = true
}

// 确认拒绝
const confirmReject = async () => {
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请输入拒绝原因')
    return
  }

  rejecting.value = true
  try {
    const res = await request.post(`/admin/creator-scenes/${rejectingScene.value.id}/reject`, {
      reason: rejectReason.value
    })
    if (res.code === 0) {
      ElMessage.success('已拒绝')
      rejectVisible.value = false
      loadScenes()
      loadStats()
    } else {
      ElMessage.error(res.message || '操作失败')
    }
  } catch (error) {
    console.error('拒绝失败:', error)
    ElMessage.error('操作失败')
  } finally {
    rejecting.value = false
  }
}

// 下架场景
const offlineScene = async (row) => {
  try {
    const { value: reason } = await ElMessageBox.prompt('请输入下架原因', '下架场景', {
      inputPlaceholder: '可选',
      type: 'warning'
    })

    const res = await request.post(`/admin/creator-scenes/${row.id}/offline`, {
      reason: reason || '管理员下架'
    })
    if (res.code === 0) {
      ElMessage.success('已下架')
      loadScenes()
      loadStats()
    } else {
      ElMessage.error(res.message || '操作失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('下架失败:', error)
      ElMessage.error('操作失败')
    }
  }
}

// 状态类型
const getStatusType = (status) => {
  const types = {
    draft: 'info',
    pending: 'warning',
    approved: 'success',
    rejected: 'danger'
  }
  return types[status] || 'info'
}

// 状态文本
const getStatusText = (status) => {
  const texts = {
    draft: '草稿',
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝'
  }
  return texts[status] || status
}

// 格式化日期
const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

onMounted(() => {
  loadStats()
  loadScenes()
})
</script>

<style scoped>
.creator-scenes-page {
  padding: 20px;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  cursor: pointer;
}

.stat-content {
  text-align: center;
}

.stat-value {
  font-size: 32px;
  font-weight: 600;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 8px;
}

.stat-card.pending .stat-value {
  color: #E6A23C;
}

.stat-card.approved .stat-value {
  color: #67C23A;
}

.stat-card.rejected .stat-value {
  color: #F56C6C;
}

.stat-card.total .stat-value {
  color: #409EFF;
}

.filter-card {
  margin-bottom: 20px;
}

.table-card {
  margin-bottom: 20px;
}

.scene-info {
  display: flex;
  align-items: center;
}

.scene-icon {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  flex-shrink: 0;
}

.image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  color: #ccc;
  font-size: 24px;
}

.scene-detail {
  margin-left: 12px;
  flex: 1;
  min-width: 0;
}

.scene-name {
  font-weight: 500;
  color: #303133;
}

.scene-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.creator-info {
  display: flex;
  align-items: center;
}

.creator-name {
  margin-left: 8px;
  font-size: 13px;
}

.points-cost {
  color: #E6A23C;
  font-weight: 500;
}

.pagination-wrap {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin: 20px 0 10px;
}

.detail-content :deep(.el-descriptions) {
  margin-bottom: 20px;
}
</style>
