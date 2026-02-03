<template>
  <div class="official-templates">
    <!-- 头部操作栏 -->
    <div class="page-header">
      <div class="header-left">
        <h2>官方模板管理</h2>
        <span class="subtitle">管理官方模板，支持从场景同步</span>
      </div>
      <div class="header-right">
        <el-button @click="showSyncDialog">
          <el-icon><Refresh /></el-icon> 从场景同步
        </el-button>
        <el-button type="primary" @click="showAddDialog">
          <el-icon><Plus /></el-icon> 新增模板
        </el-button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-radio-group v-model="statusFilter" @change="loadTemplates">
        <el-radio-button label="">全部</el-radio-button>
        <el-radio-button label="active">已上架</el-radio-button>
        <el-radio-button label="offline">已下架</el-radio-button>
      </el-radio-group>
      <el-input
        v-model="keyword"
        placeholder="搜索模板名称"
        clearable
        style="width: 200px; margin-left: 16px;"
        @clear="loadTemplates"
        @keyup.enter="loadTemplates"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <span class="template-count">共 {{ total }} 个模板</span>
    </div>

    <!-- 模板列表 -->
    <div class="template-list" v-loading="loading">
      <el-table :data="templates" row-key="id" empty-text="暂无官方模板">
        <el-table-column label="模板" min-width="280">
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
                <div class="template-name">{{ row.name }}</div>
                <div class="template-desc">{{ row.description || '暂无描述' }}</div>
                <div class="template-id">ID: {{ row.id }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="120" align="center">
          <template #default="{ row }">
            <el-tag size="small">{{ row.category_name || '未分类' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '已上架' : '已下架' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="精选" width="80" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.is_featured"
              :active-value="1"
              :inactive-value="0"
              @change="updateTemplate(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="醒币" width="80" align="center">
          <template #default="{ row }">
            <span class="points-value">{{ row.points_cost }}</span>
          </template>
        </el-table-column>
        <el-table-column label="使用次数" width="100" align="center">
          <template #default="{ row }">
            {{ row.use_count || 0 }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <div class="action-btns">
              <el-button type="primary" link size="small" @click="editTemplate(row)">编辑</el-button>
              <el-button
                :type="row.status === 'active' ? 'warning' : 'success'"
                link
                size="small"
                @click="toggleStatus(row)"
              >
                {{ row.status === 'active' ? '下架' : '上架' }}
              </el-button>
              <el-button type="danger" link size="small" @click="deleteTemplate(row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrap" v-if="total > pageSize">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="loadTemplates"
        />
      </div>
    </div>

    <!-- 新增/编辑模板对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑官方模板' : '新增官方模板'"
      width="700px"
      top="5vh"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="form.name" placeholder="中文名称" />
        </el-form-item>
        <el-form-item label="英文名称">
          <el-input v-model="form.name_en" placeholder="English name" />
        </el-form-item>
        <el-form-item label="模板描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="简短描述" />
        </el-form-item>
        <el-form-item label="封面图" prop="cover_image">
          <el-input v-model="form.cover_image" placeholder="封面图URL" />
        </el-form-item>
        <el-form-item label="参考图">
          <el-input v-model="form.reference_image" placeholder="参考图URL（可选）" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category_id" placeholder="选择分类" clearable>
            <el-option
              v-for="cat in categories"
              :key="cat.id"
              :label="cat.name"
              :value="cat.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="form.tags" placeholder="多个标签用逗号分隔" />
        </el-form-item>
        <el-form-item label="消耗醒币" prop="points_cost">
          <el-input-number v-model="form.points_cost" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="精选">
          <el-switch v-model="form.is_featured" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 从场景同步对话框 -->
    <el-dialog v-model="syncDialogVisible" title="从场景同步" width="500px">
      <el-form label-width="100px">
        <el-form-item label="选择场景">
          <el-select v-model="syncSceneKey" placeholder="选择要同步的场景" style="width: 100%;">
            <el-option
              v-for="scene in scenes"
              :key="scene.scene_key || scene.id"
              :label="scene.name"
              :value="scene.scene_key || scene.id"
            />
          </el-select>
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          style="margin-top: 16px;"
        >
          同步将复制场景的基本信息、步骤配置和Prompt模板到官方模板系统。
          如果模板已存在，将更新现有数据。
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="syncDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="syncFromScene" :loading="syncing">同步</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import { officialTemplatesApi, categoriesApi, scenesApi } from '../api'

// 列表数据
const templates = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const statusFilter = ref('')
const keyword = ref('')

// 分类列表
const categories = ref([])

// 场景列表（用于同步）
const scenes = ref([])

// 对话框
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const submitting = ref(false)

// 同步对话框
const syncDialogVisible = ref(false)
const syncSceneKey = ref('')
const syncing = ref(false)

// 表单数据
const form = reactive({
  id: '',
  name: '',
  name_en: '',
  description: '',
  description_en: '',
  cover_image: '',
  reference_image: '',
  category_id: null,
  tags: '',
  points_cost: 50,
  is_featured: 0
})

// 表单验证规则
const rules = {
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  cover_image: [{ required: true, message: '请输入封面图URL', trigger: 'blur' }],
  points_cost: [{ required: true, message: '请输入消耗醒币', trigger: 'blur' }]
}

// 加载模板列表
const loadTemplates = async () => {
  loading.value = true
  try {
    const res = await officialTemplatesApi.getList({
      page: page.value,
      pageSize: pageSize.value,
      status: statusFilter.value,
      keyword: keyword.value
    })
    if (res.code === 200) {
      templates.value = res.data.list || []
      total.value = res.data.total || 0
    }
  } catch (error) {
    console.error('加载模板列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 加载分类列表
const loadCategories = async () => {
  try {
    const res = await categoriesApi.getList()
    if (res.code === 200) {
      categories.value = res.data || []
    }
  } catch (error) {
    console.error('加载分类失败:', error)
  }
}

// 加载场景列表
const loadScenes = async () => {
  try {
    const res = await scenesApi.getList()
    if (res.code === 200 || res.code === 0) {
      scenes.value = res.data || []
    }
  } catch (error) {
    console.error('加载场景失败:', error)
  }
}

// 显示新增对话框
const showAddDialog = () => {
  isEdit.value = false
  Object.assign(form, {
    id: '',
    name: '',
    name_en: '',
    description: '',
    description_en: '',
    cover_image: '',
    reference_image: '',
    category_id: null,
    tags: '',
    points_cost: 50,
    is_featured: 0
  })
  dialogVisible.value = true
}

// 编辑模板
const editTemplate = (row) => {
  isEdit.value = true
  Object.assign(form, {
    id: row.id,
    name: row.name,
    name_en: row.name_en || '',
    description: row.description || '',
    description_en: row.description_en || '',
    cover_image: row.cover_image,
    reference_image: row.reference_image || '',
    category_id: row.category_id,
    tags: Array.isArray(row.tags) ? row.tags.join(',') : (row.tags || ''),
    points_cost: row.points_cost,
    is_featured: row.is_featured
  })
  dialogVisible.value = true
}

// 提交表单
const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate()

  submitting.value = true
  try {
    if (isEdit.value) {
      await officialTemplatesApi.update(form.id, form)
      ElMessage.success('更新成功')
    } else {
      await officialTemplatesApi.create(form)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadTemplates()
  } catch (error) {
    console.error('提交失败:', error)
  } finally {
    submitting.value = false
  }
}

// 更新模板（精选开关）
const updateTemplate = async (row) => {
  try {
    await officialTemplatesApi.update(row.id, { is_featured: row.is_featured })
    ElMessage.success('更新成功')
  } catch (error) {
    console.error('更新失败:', error)
    loadTemplates()
  }
}

// 切换状态
const toggleStatus = async (row) => {
  const newStatus = row.status === 'active' ? 'offline' : 'active'
  const action = newStatus === 'active' ? '上架' : '下架'

  try {
    await ElMessageBox.confirm(`确定要${action}该模板吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    await officialTemplatesApi.toggleStatus(row.id, { status: newStatus })
    ElMessage.success(`${action}成功`)
    loadTemplates()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('操作失败:', error)
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

    await officialTemplatesApi.delete(row.id)
    ElMessage.success('删除成功')
    loadTemplates()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
    }
  }
}

// 显示同步对话框
const showSyncDialog = () => {
  syncSceneKey.value = ''
  syncDialogVisible.value = true
}

// 从场景同步
const syncFromScene = async () => {
  if (!syncSceneKey.value) {
    ElMessage.warning('请选择要同步的场景')
    return
  }

  syncing.value = true
  try {
    const res = await officialTemplatesApi.syncFromScene({ scene_key: syncSceneKey.value })
    if (res.code === 200) {
      ElMessage.success(res.msg || '同步成功')
      syncDialogVisible.value = false
      loadTemplates()
    }
  } catch (error) {
    console.error('同步失败:', error)
  } finally {
    syncing.value = false
  }
}

// 初始化
onMounted(() => {
  loadTemplates()
  loadCategories()
  loadScenes()
})
</script>

<style scoped>
.official-templates {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-left h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
}

.header-left .subtitle {
  color: #909399;
  font-size: 14px;
}

.header-right {
  display: flex;
  gap: 12px;
}

.filter-bar {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
}

.template-count {
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
}

.template-desc {
  font-size: 13px;
  color: #909399;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-id {
  font-size: 12px;
  color: #c0c4cc;
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

.points-value {
  color: #e6a23c;
  font-weight: 500;
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
</style>
