<template>
  <div class="template-management">
    <!-- 头部 -->
    <div class="page-header">
      <h2>模板管理</h2>
      <span class="subtitle">管理创作者提交的模板，AI 自动审核</span>
    </div>

    <!-- Tab 切换 -->
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <!-- 审核区域 -->
      <el-tab-pane name="review">
        <template #label>
          <span>
            <el-icon><Clock /></el-icon>
            审核区域
            <el-badge v-if="reviewCount > 0" :value="reviewCount" class="tab-badge" />
          </span>
        </template>

        <div class="tab-content">
          <!-- 审核状态筛选 -->
          <div class="filter-bar">
            <el-radio-group v-model="reviewStatusFilter" @change="loadReviewTemplates">
              <el-radio-button label="">全部待处理</el-radio-button>
              <el-radio-button label="reviewing">审核中</el-radio-button>
              <el-radio-button label="pending">待人工复核</el-radio-button>
            </el-radio-group>
            <span class="count-text">共 {{ reviewTotal }} 个待审核</span>
          </div>

          <!-- 审核列表 -->
          <div class="template-list" v-loading="reviewLoading">
            <el-table :data="reviewTemplates" row-key="id" empty-text="暂无待审核模板">
              <el-table-column label="模板信息" min-width="300">
                <template #default="{ row }">
                  <div class="template-info">
                    <el-image
                      class="template-cover"
                      :src="row.cover_image"
                      fit="cover"
                      :preview-src-list="[row.cover_image, row.reference_image].filter(Boolean)"
                      preview-teleported
                    >
                      <template #error>
                        <div class="image-placeholder">{{ row.name?.charAt(0) || '?' }}</div>
                      </template>
                    </el-image>
                    <div class="template-detail">
                      <div class="template-name">{{ row.name }}</div>
                      <div class="template-desc">{{ row.description || '暂无描述' }}</div>
                      <div class="template-meta">
                        <span>创作者: {{ row.creator_name }}</span>
                        <span>提交时间: {{ formatTime(row.updated_at) }}</span>
                      </div>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="审核状态" width="140" align="center">
                <template #default="{ row }">
                  <el-tag :type="getReviewStatusType(row.status)">
                    {{ getReviewStatusText(row.status) }}
                  </el-tag>
                  <div v-if="row.review_score" class="review-score">
                    得分: {{ row.review_score }}
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="审核详情" width="200">
                <template #default="{ row }">
                  <div v-if="row.review_details" class="review-details">
                    <el-popover placement="left" :width="400" trigger="hover">
                      <template #reference>
                        <el-button link type="primary" size="small">查看详情</el-button>
                      </template>
                      <div class="review-details-content">
                        <pre>{{ formatReviewDetails(row.review_details) }}</pre>
                      </div>
                    </el-popover>
                  </div>
                  <span v-else class="no-details">等待审核</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="200" fixed="right">
                <template #default="{ row }">
                  <div class="action-btns">
                    <el-button type="success" link size="small" @click="approveTemplate(row)">
                      通过
                    </el-button>
                    <el-button type="danger" link size="small" @click="showRejectDialog(row)">
                      拒绝
                    </el-button>
                    <el-button type="primary" link size="small" @click="previewTemplate(row)">
                      预览
                    </el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>

            <div class="pagination-wrap" v-if="reviewTotal > reviewPageSize">
              <el-pagination
                v-model:current-page="reviewPage"
                :page-size="reviewPageSize"
                :total="reviewTotal"
                layout="prev, pager, next"
                @current-change="loadReviewTemplates"
              />
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 清单区域 -->
      <el-tab-pane name="list">
        <template #label>
          <span>
            <el-icon><List /></el-icon>
            模板清单
          </span>
        </template>

        <div class="tab-content">
          <!-- 筛选栏 -->
          <div class="filter-bar">
            <el-radio-group v-model="listStatusFilter" @change="loadListTemplates">
              <el-radio-button label="">全部</el-radio-button>
              <el-radio-button label="active">已上架</el-radio-button>
              <el-radio-button label="offline">已下架</el-radio-button>
              <el-radio-button label="rejected">已拒绝</el-radio-button>
            </el-radio-group>
            <el-select
              v-model="listCategoryFilter"
              placeholder="选择分类"
              clearable
              style="width: 150px; margin-left: 16px;"
              @change="loadListTemplates"
            >
              <el-option
                v-for="cat in categories"
                :key="cat.id"
                :label="cat.name"
                :value="cat.id"
              />
            </el-select>
            <el-input
              v-model="listKeyword"
              placeholder="搜索模板名称"
              clearable
              style="width: 200px; margin-left: 16px;"
              @clear="loadListTemplates"
              @keyup.enter="loadListTemplates"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <span class="count-text">共 {{ listTotal }} 个模板</span>
          </div>

          <!-- 模板列表 -->
          <div class="template-list" v-loading="listLoading">
            <el-table :data="listTemplates" row-key="id" empty-text="暂无模板">
              <el-table-column label="模板信息" min-width="280">
                <template #default="{ row }">
                  <div class="template-info">
                    <el-image
                      class="template-cover"
                      :src="row.cover_image"
                      fit="cover"
                      :preview-src-list="[row.cover_image]"
                      preview-teleported
                    >
                      <template #error>
                        <div class="image-placeholder">{{ row.name?.charAt(0) || '?' }}</div>
                      </template>
                    </el-image>
                    <div class="template-detail">
                      <div class="template-name">
                        {{ row.name }}
                        <el-tag v-if="row.is_official" type="warning" size="small">官方</el-tag>
                      </div>
                      <div class="template-desc">{{ row.description || '暂无描述' }}</div>
                      <div class="template-meta">
                        <span>创作者: {{ row.creator_name || '官方' }}</span>
                      </div>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="分类" width="100" align="center">
                <template #default="{ row }">
                  <el-tag size="small">{{ row.category_name || '未分类' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="100" align="center">
                <template #default="{ row }">
                  <el-tag :type="getListStatusType(row.status)">
                    {{ getListStatusText(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="精选" width="80" align="center">
                <template #default="{ row }">
                  <el-switch
                    v-model="row.is_featured"
                    :active-value="1"
                    :inactive-value="0"
                    @change="updateTemplateFeatured(row)"
                  />
                </template>
              </el-table-column>
              <el-table-column label="醒币" width="80" align="center">
                <template #default="{ row }">
                  <span class="points-value">{{ row.points_cost }}</span>
                </template>
              </el-table-column>
              <el-table-column label="数据" width="120" align="center">
                <template #default="{ row }">
                  <div class="stats-info">
                    <span>使用: {{ row.use_count || 0 }}</span>
                    <span>收藏: {{ row.favorite_count || 0 }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="180" fixed="right">
                <template #default="{ row }">
                  <div class="action-btns">
                    <el-button type="primary" link size="small" @click="editTemplate(row)">
                      编辑
                    </el-button>
                    <el-button
                      v-if="row.status === 'active'"
                      type="warning" link size="small"
                      @click="offlineTemplate(row)"
                    >
                      下架
                    </el-button>
                    <el-button
                      v-else-if="row.status === 'offline'"
                      type="success" link size="small"
                      @click="onlineTemplate(row)"
                    >
                      上架
                    </el-button>
                    <el-button type="danger" link size="small" @click="deleteTemplate(row)">
                      删除
                    </el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>

            <div class="pagination-wrap" v-if="listTotal > listPageSize">
              <el-pagination
                v-model:current-page="listPage"
                :page-size="listPageSize"
                :total="listTotal"
                layout="prev, pager, next"
                @current-change="loadListTemplates"
              />
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 拒绝原因对话框 -->
    <el-dialog v-model="rejectDialogVisible" title="拒绝模板" width="500px">
      <el-form :model="rejectForm" label-width="80px">
        <el-form-item label="拒绝原因">
          <el-input
            v-model="rejectForm.reason"
            type="textarea"
            :rows="4"
            placeholder="请输入拒绝原因，将通知创作者"
          />
        </el-form-item>
        <el-form-item label="快捷选择">
          <div class="quick-reasons">
            <el-tag
              v-for="reason in quickRejectReasons"
              :key="reason"
              @click="rejectForm.reason = reason"
              style="cursor: pointer; margin: 4px;"
            >
              {{ reason }}
            </el-tag>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="confirmReject" :loading="rejecting">确认拒绝</el-button>
      </template>
    </el-dialog>

    <!-- 编辑模板对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑模板" width="700px" top="5vh">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="模板名称">
          <el-input v-model="editForm.name" placeholder="中文名称" />
        </el-form-item>
        <el-form-item label="模板描述">
          <el-input v-model="editForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="封面图">
          <el-input v-model="editForm.cover_image" placeholder="封面图URL" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="editForm.category_id" placeholder="选择分类" clearable>
            <el-option
              v-for="cat in categories"
              :key="cat.id"
              :label="cat.name"
              :value="cat.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="消耗醒币">
          <el-input-number v-model="editForm.points_cost" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="精选">
          <el-switch v-model="editForm.is_featured" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTemplate" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Clock, List, Search } from '@element-plus/icons-vue'
import api from '../api'

// Tab 状态
const activeTab = ref('review')

// 审核区域数据
const reviewTemplates = ref([])
const reviewTotal = ref(0)
const reviewPage = ref(1)
const reviewPageSize = ref(20)
const reviewLoading = ref(false)
const reviewStatusFilter = ref('')
const reviewCount = computed(() => reviewTotal.value)

// 清单区域数据
const listTemplates = ref([])
const listTotal = ref(0)
const listPage = ref(1)
const listPageSize = ref(20)
const listLoading = ref(false)
const listStatusFilter = ref('')
const listCategoryFilter = ref('')
const listKeyword = ref('')

// 分类列表
const categories = ref([])

// 拒绝对话框
const rejectDialogVisible = ref(false)
const rejectForm = reactive({ templateId: '', reason: '' })
const rejecting = ref(false)
const quickRejectReasons = [
  '图片包含不当内容',
  '文字描述不符合规范',
  '模板配置不完整',
  '与现有模板重复',
  '质量不符合要求'
]

// 编辑对话框
const editDialogVisible = ref(false)
const editForm = reactive({
  id: '',
  name: '',
  description: '',
  cover_image: '',
  category_id: null,
  points_cost: 50,
  is_featured: 0
})
const saving = ref(false)

// 加载审核区域模板
const loadReviewTemplates = async () => {
  reviewLoading.value = true
  try {
    const params = {
      page: reviewPage.value,
      pageSize: reviewPageSize.value,
      status: reviewStatusFilter.value || 'reviewing,pending'
    }
    const res = await api.get('/admin/template-review/list', { params })
    if (res.code === 200) {
      reviewTemplates.value = res.data.list || []
      reviewTotal.value = res.data.total || 0
    }
  } catch (error) {
    console.error('加载审核列表失败:', error)
  } finally {
    reviewLoading.value = false
  }
}

// 加载清单区域模板
const loadListTemplates = async () => {
  listLoading.value = true
  try {
    const params = {
      page: listPage.value,
      pageSize: listPageSize.value,
      status: listStatusFilter.value,
      category_id: listCategoryFilter.value,
      keyword: listKeyword.value
    }
    const res = await api.get('/admin/template-review/all', { params })
    if (res.code === 200) {
      listTemplates.value = res.data.list || []
      listTotal.value = res.data.total || 0
    }
  } catch (error) {
    console.error('加载模板列表失败:', error)
  } finally {
    listLoading.value = false
  }
}

// 加载分类
const loadCategories = async () => {
  try {
    const res = await api.get('/admin/template-review/categories')
    if (res.code === 200) {
      categories.value = res.data || []
    }
  } catch (error) {
    console.error('加载分类失败:', error)
  }
}

// Tab 切换
const handleTabChange = (tab) => {
  if (tab === 'review') {
    loadReviewTemplates()
  } else {
    loadListTemplates()
  }
}

// 审核通过
const approveTemplate = async (row) => {
  try {
    await ElMessageBox.confirm('确定要通过该模板的审核吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info'
    })

    const res = await api.post(`/api/admin/template-review/${row.id}/approve`)
    if (res.code === 200) {
      ElMessage.success('审核通过')
      loadReviewTemplates()
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('审核失败:', error)
    }
  }
}

// 显示拒绝对话框
const showRejectDialog = (row) => {
  rejectForm.templateId = row.id
  rejectForm.reason = ''
  rejectDialogVisible.value = true
}

// 确认拒绝
const confirmReject = async () => {
  if (!rejectForm.reason) {
    ElMessage.warning('请输入拒绝原因')
    return
  }

  rejecting.value = true
  try {
    const res = await api.post(`/api/admin/template-review/${rejectForm.templateId}/reject`, {
      reason: rejectForm.reason
    })
    if (res.code === 200) {
      ElMessage.success('已拒绝')
      rejectDialogVisible.value = false
      loadReviewTemplates()
    }
  } catch (error) {
    console.error('拒绝失败:', error)
  } finally {
    rejecting.value = false
  }
}

// 预览模板
const previewTemplate = (row) => {
  // 可以打开新窗口预览或弹窗预览
  ElMessage.info('预览功能开发中')
}

// 编辑模板
const editTemplate = (row) => {
  Object.assign(editForm, {
    id: row.id,
    name: row.name,
    description: row.description || '',
    cover_image: row.cover_image,
    category_id: row.category_id,
    points_cost: row.points_cost,
    is_featured: row.is_featured
  })
  editDialogVisible.value = true
}

// 保存模板
const saveTemplate = async () => {
  saving.value = true
  try {
    const res = await api.put(`/api/admin/template-review/${editForm.id}`, editForm)
    if (res.code === 200) {
      ElMessage.success('保存成功')
      editDialogVisible.value = false
      loadListTemplates()
    }
  } catch (error) {
    console.error('保存失败:', error)
  } finally {
    saving.value = false
  }
}

// 更新精选状态
const updateTemplateFeatured = async (row) => {
  try {
    await api.put(`/api/admin/template-review/${row.id}`, {
      is_featured: row.is_featured
    })
    ElMessage.success('更新成功')
  } catch (error) {
    console.error('更新失败:', error)
    loadListTemplates()
  }
}

// 下架模板
const offlineTemplate = async (row) => {
  try {
    await ElMessageBox.confirm('确定要下架该模板吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const res = await api.post(`/api/admin/template-review/${row.id}/offline`)
    if (res.code === 200) {
      ElMessage.success('已下架')
      loadListTemplates()
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('下架失败:', error)
    }
  }
}

// 上架模板
const onlineTemplate = async (row) => {
  try {
    await ElMessageBox.confirm('确定要重新上架该模板吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info'
    })

    const res = await api.post(`/api/admin/template-review/${row.id}/online`)
    if (res.code === 200) {
      ElMessage.success('已上架')
      loadListTemplates()
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('上架失败:', error)
    }
  }
}

// 删除模板
const deleteTemplate = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除该模板吗？此操作不可恢复。', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const res = await api.delete(`/api/admin/template-review/${row.id}`)
    if (res.code === 200) {
      ElMessage.success('删除成功')
      loadListTemplates()
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
    }
  }
}

// 格式化时间
const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

// 格式化审核详情
const formatReviewDetails = (details) => {
  try {
    const obj = typeof details === 'string' ? JSON.parse(details) : details
    return JSON.stringify(obj, null, 2)
  } catch {
    return details
  }
}

// 审核状态类型
const getReviewStatusType = (status) => {
  const map = {
    reviewing: 'warning',
    pending: 'info'
  }
  return map[status] || 'info'
}

// 审核状态文本
const getReviewStatusText = (status) => {
  const map = {
    reviewing: '审核中',
    pending: '待人工复核'
  }
  return map[status] || status
}

// 清单状态类型
const getListStatusType = (status) => {
  const map = {
    active: 'success',
    offline: 'info',
    rejected: 'danger',
    draft: 'warning'
  }
  return map[status] || 'info'
}

// 清单状态文本
const getListStatusText = (status) => {
  const map = {
    active: '已上架',
    offline: '已下架',
    rejected: '已拒绝',
    draft: '草稿'
  }
  return map[status] || status
}

// 初始化
onMounted(() => {
  loadReviewTemplates()
  loadCategories()
})
</script>

<style scoped>
.template-management {
  padding: 20px;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
}

.page-header .subtitle {
  color: #909399;
  font-size: 14px;
}

.tab-badge {
  margin-left: 8px;
}

.tab-content {
  padding-top: 16px;
}

.filter-bar {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
}

.count-text {
  margin-left: auto;
  color: #909399;
  font-size: 14px;
}

.template-list {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
}

.template-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.template-cover {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  flex-shrink: 0;
}

.template-detail {
  flex: 1;
  min-width: 0;
}

.template-name {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.template-desc {
  font-size: 13px;
  color: #909399;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-meta {
  font-size: 12px;
  color: #c0c4cc;
  display: flex;
  gap: 16px;
}

.image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  color: #909399;
  font-size: 24px;
  font-weight: 600;
}

.review-score {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.review-details-content {
  max-height: 400px;
  overflow: auto;
}

.review-details-content pre {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.no-details {
  color: #c0c4cc;
  font-size: 13px;
}

.points-value {
  color: #e6a23c;
  font-weight: 500;
}

.stats-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #909399;
}

.action-btns {
  display: flex;
  gap: 8px;
}

.pagination-wrap {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.quick-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
