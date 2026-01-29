<template>
  <div class="grade-schemes-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <h2>品级方案管理</h2>
      <el-button type="primary" @click="handleCreateScheme">
        <el-icon><Plus /></el-icon>
        新建方案
      </el-button>
    </div>

    <!-- 主体内容 -->
    <div class="page-content">
      <!-- 左侧方案列表 -->
      <div class="scheme-list-panel">
        <div class="panel-header">
          <span>方案列表</span>
          <el-input
            v-model="searchKeyword"
            placeholder="搜索方案"
            size="small"
            clearable
            style="width: 150px"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
        <div class="scheme-list">
          <div
            v-for="scheme in filteredSchemes"
            :key="scheme.id"
            class="scheme-item"
            :class="{ active: currentScheme?.id === scheme.id }"
            @click="selectScheme(scheme)"
          >
            <div class="scheme-info">
              <span class="scheme-name">{{ scheme.name }}</span>
              <el-tag size="small" type="info">{{ scheme.category || '通用' }}</el-tag>
            </div>
            <div class="scheme-meta">
              <span class="grade-count">{{ scheme.grades?.length || 0 }} 个品级</span>
            </div>
          </div>
          <el-empty v-if="filteredSchemes.length === 0" description="暂无方案" />
        </div>
      </div>

      <!-- 右侧方案详情 -->
      <div class="scheme-detail-panel">
        <template v-if="currentScheme">
          <!-- 方案基本信息 -->
          <el-card class="info-card">
            <template #header>
              <div class="card-header">
                <span>方案信息</span>
                <div class="card-actions">
                  <el-button size="small" @click="handleEditScheme">编辑</el-button>
                  <el-button size="small" type="danger" @click="handleDeleteScheme">删除</el-button>
                </div>
              </div>
            </template>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="方案名称">{{ currentScheme.name }}</el-descriptions-item>
              <el-descriptions-item label="分类">{{ currentScheme.category || '通用' }}</el-descriptions-item>
              <el-descriptions-item label="描述" :span="2">{{ currentScheme.description || '暂无描述' }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ formatTime(currentScheme.created_at) }}</el-descriptions-item>
              <el-descriptions-item label="更新时间">{{ formatTime(currentScheme.updated_at) }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 品级列表 -->
          <el-card class="grades-card">
            <template #header>
              <div class="card-header">
                <span>品级列表 ({{ currentScheme.grades?.length || 0 }})</span>
                <el-button type="primary" size="small" @click="handleAddGrade">
                  <el-icon><Plus /></el-icon>
                  添加品级
                </el-button>
              </div>
            </template>
            <div class="grades-container">
              <draggable
                v-model="currentScheme.grades"
                item-key="id"
                handle=".drag-handle"
                @end="handleGradeOrderChange"
              >
                <template #item="{ element: grade, index }">
                  <div class="grade-card">
                    <div class="drag-handle">
                      <el-icon><Rank /></el-icon>
                    </div>
                    <div class="grade-content">
                      <div class="grade-header">
                        <span class="grade-name" :style="{ color: grade.color }">{{ grade.name }}</span>
                        <el-tag size="small">权重: {{ grade.weight }}</el-tag>
                      </div>
                      <div class="grade-image" v-if="grade.image_url">
                        <el-image
                          :src="grade.image_url"
                          fit="cover"
                          style="width: 60px; height: 60px; border-radius: 4px"
                        />
                      </div>
                      <div class="grade-prompt" v-if="grade.prompt">
                        <el-text type="info" size="small" truncated>{{ grade.prompt }}</el-text>
                      </div>
                    </div>
                    <div class="grade-actions">
                      <el-button size="small" link @click="handleEditGrade(grade, index)">
                        <el-icon><Edit /></el-icon>
                      </el-button>
                      <el-button size="small" link type="danger" @click="handleDeleteGrade(index)">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                  </div>
                </template>
              </draggable>
              <el-empty v-if="!currentScheme.grades?.length" description="暂无品级，点击上方按钮添加" />
            </div>
          </el-card>
        </template>
        <el-empty v-else description="请从左侧选择一个方案" class="empty-placeholder" />
      </div>
    </div>

    <!-- 方案编辑对话框 -->
    <el-dialog
      v-model="schemeDialogVisible"
      :title="isEditingScheme ? '编辑方案' : '新建方案'"
      width="500px"
    >
      <el-form :model="schemeForm" label-width="80px">
        <el-form-item label="方案名称" required>
          <el-input v-model="schemeForm.name" placeholder="请输入方案名称" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="schemeForm.category" placeholder="选择分类" clearable style="width: 100%">
            <el-option label="通用" value="通用" />
            <el-option label="新春" value="新春" />
            <el-option label="证件照" value="证件照" />
            <el-option label="艺术照" value="艺术照" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="schemeForm.description" type="textarea" :rows="3" placeholder="请输入方案描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="schemeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveScheme" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 品级编辑对话框 -->
    <el-dialog
      v-model="gradeDialogVisible"
      :title="isEditingGrade ? '编辑品级' : '添加品级'"
      width="600px"
    >
      <el-form :model="gradeForm" label-width="100px">
        <el-form-item label="品级名称" required>
          <el-input v-model="gradeForm.name" placeholder="请输入品级名称" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="gradeForm.color" />
          <span style="margin-left: 10px">{{ gradeForm.color }}</span>
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="gradeForm.weight" :min="1" :max="100" />
          <span style="margin-left: 10px; color: #909399">权重越大，抽中概率越高</span>
        </el-form-item>
        <el-form-item label="图片">
          <div class="image-upload-area">
            <el-image
              v-if="gradeForm.image_url"
              :src="gradeForm.image_url"
              fit="cover"
              style="width: 100px; height: 100px; border-radius: 4px"
            />
            <el-input v-model="gradeForm.image_url" placeholder="请输入图片URL" style="margin-top: 10px" />
          </div>
        </el-form-item>
        <el-form-item label="Prompt 提示词">
          <el-input
            v-model="gradeForm.prompt"
            type="textarea"
            :rows="4"
            placeholder="该品级对应的 AI 生成提示词"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="gradeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveGrade">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Edit, Delete, Rank } from '@element-plus/icons-vue'
import draggable from 'vuedraggable'
import api from '../api'

// 状态
const schemes = ref([])
const currentScheme = ref(null)
const searchKeyword = ref('')
const loading = ref(false)
const saving = ref(false)

// 方案对话框
const schemeDialogVisible = ref(false)
const isEditingScheme = ref(false)
const schemeForm = ref({
  name: '',
  category: '',
  description: ''
})

// 品级对话框
const gradeDialogVisible = ref(false)
const isEditingGrade = ref(false)
const editingGradeIndex = ref(-1)
const gradeForm = ref({
  name: '',
  color: '#409EFF',
  weight: 10,
  image_url: '',
  prompt: ''
})

// 计算属性
const filteredSchemes = computed(() => {
  if (!searchKeyword.value) return schemes.value
  const keyword = searchKeyword.value.toLowerCase()
  return schemes.value.filter(s =>
    s.name.toLowerCase().includes(keyword) ||
    (s.category && s.category.toLowerCase().includes(keyword))
  )
})

// 加载方案列表
const loadSchemes = async () => {
  loading.value = true
  try {
    const res = await api.get('/admin/grade-schemes')
    schemes.value = res.data.data || []
    // 如果有当前选中的方案，刷新其数据
    if (currentScheme.value) {
      const updated = schemes.value.find(s => s.id === currentScheme.value.id)
      if (updated) {
        currentScheme.value = updated
      }
    }
  } catch (error) {
    console.error('加载方案失败:', error)
    ElMessage.error('加载方案列表失败')
  } finally {
    loading.value = false
  }
}

// 选择方案
const selectScheme = (scheme) => {
  currentScheme.value = { ...scheme, grades: scheme.grades || [] }
}

// 创建方案
const handleCreateScheme = () => {
  isEditingScheme.value = false
  schemeForm.value = { name: '', category: '', description: '' }
  schemeDialogVisible.value = true
}

// 编辑方案
const handleEditScheme = () => {
  isEditingScheme.value = true
  schemeForm.value = {
    name: currentScheme.value.name,
    category: currentScheme.value.category || '',
    description: currentScheme.value.description || ''
  }
  schemeDialogVisible.value = true
}

// 保存方案
const saveScheme = async () => {
  if (!schemeForm.value.name) {
    ElMessage.warning('请输入方案名称')
    return
  }
  saving.value = true
  try {
    if (isEditingScheme.value) {
      await api.put(`/admin/grade-schemes/${currentScheme.value.id}`, schemeForm.value)
      ElMessage.success('方案更新成功')
    } else {
      const res = await api.post('/admin/grade-schemes', schemeForm.value)
      ElMessage.success('方案创建成功')
      // 选中新创建的方案
      if (res.data.data) {
        currentScheme.value = res.data.data
      }
    }
    schemeDialogVisible.value = false
    await loadSchemes()
  } catch (error) {
    console.error('保存方案失败:', error)
    ElMessage.error('保存方案失败')
  } finally {
    saving.value = false
  }
}

// 删除方案
const handleDeleteScheme = async () => {
  try {
    await ElMessageBox.confirm('确定要删除该方案吗？删除后无法恢复。', '删除确认', {
      type: 'warning'
    })
    await api.delete(`/admin/grade-schemes/${currentScheme.value.id}`)
    ElMessage.success('方案删除成功')
    currentScheme.value = null
    await loadSchemes()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除方案失败:', error)
      ElMessage.error('删除方案失败')
    }
  }
}

// 添加品级
const handleAddGrade = () => {
  isEditingGrade.value = false
  editingGradeIndex.value = -1
  gradeForm.value = {
    name: '',
    color: '#409EFF',
    weight: 10,
    image_url: '',
    prompt: ''
  }
  gradeDialogVisible.value = true
}

// 编辑品级
const handleEditGrade = (grade, index) => {
  isEditingGrade.value = true
  editingGradeIndex.value = index
  gradeForm.value = { ...grade }
  gradeDialogVisible.value = true
}

// 保存品级
const saveGrade = async () => {
  if (!gradeForm.value.name) {
    ElMessage.warning('请输入品级名称')
    return
  }

  const grades = [...(currentScheme.value.grades || [])]

  if (isEditingGrade.value) {
    grades[editingGradeIndex.value] = { ...gradeForm.value }
  } else {
    grades.push({
      ...gradeForm.value,
      id: Date.now() // 临时 ID
    })
  }

  try {
    await api.put(`/admin/grade-schemes/${currentScheme.value.id}`, {
      ...currentScheme.value,
      grades
    })
    ElMessage.success(isEditingGrade.value ? '品级更新成功' : '品级添加成功')
    gradeDialogVisible.value = false
    await loadSchemes()
  } catch (error) {
    console.error('保存品级失败:', error)
    ElMessage.error('保存品级失败')
  }
}

// 删除品级
const handleDeleteGrade = async (index) => {
  try {
    await ElMessageBox.confirm('确定要删除该品级吗？', '删除确认', {
      type: 'warning'
    })
    const grades = [...currentScheme.value.grades]
    grades.splice(index, 1)

    await api.put(`/admin/grade-schemes/${currentScheme.value.id}`, {
      ...currentScheme.value,
      grades
    })
    ElMessage.success('品级删除成功')
    await loadSchemes()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除品级失败:', error)
      ElMessage.error('删除品级失败')
    }
  }
}

// 品级排序变化
const handleGradeOrderChange = async () => {
  try {
    await api.put(`/admin/grade-schemes/${currentScheme.value.id}`, {
      ...currentScheme.value,
      grades: currentScheme.value.grades
    })
    ElMessage.success('排序已保存')
  } catch (error) {
    console.error('保存排序失败:', error)
    ElMessage.error('保存排序失败')
  }
}

// 格式化时间
const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

// 初始化
onMounted(() => {
  loadSchemes()
})
</script>

<style scoped>
.grade-schemes-page {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
}

.page-content {
  flex: 1;
  display: flex;
  gap: 20px;
  min-height: 0;
}

.scheme-list-panel {
  width: 280px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 15px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
}

.scheme-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.scheme-item {
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
  border: 1px solid #ebeef5;
}

.scheme-item:hover {
  background: #f5f7fa;
}

.scheme-item.active {
  background: #ecf5ff;
  border-color: #409eff;
}

.scheme-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.scheme-name {
  font-weight: 500;
}

.scheme-meta {
  font-size: 12px;
  color: #909399;
}

.scheme-detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.info-card,
.grades-card {
  flex-shrink: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.grades-container {
  min-height: 200px;
}

.grade-card {
  display: flex;
  align-items: center;
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  margin-bottom: 10px;
  background: #fff;
  transition: box-shadow 0.2s;
}

.grade-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.drag-handle {
  cursor: move;
  padding: 8px;
  color: #909399;
}

.grade-content {
  flex: 1;
  margin: 0 12px;
}

.grade-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.grade-name {
  font-weight: 500;
  font-size: 15px;
}

.grade-image {
  margin: 8px 0;
}

.grade-prompt {
  max-width: 400px;
}

.grade-actions {
  display: flex;
  gap: 5px;
}

.empty-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-upload-area {
  display: flex;
  flex-direction: column;
}
</style>
