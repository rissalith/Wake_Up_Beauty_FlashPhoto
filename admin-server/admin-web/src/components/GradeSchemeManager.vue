<template>
  <div class="grade-scheme-manager">
    <!-- 方案选择区域 -->
    <div class="scheme-selector">
      <div class="selector-header">
        <span class="label">品级方案</span>
        <el-select
          v-model="selectedSchemeId"
          placeholder="选择品级方案"
          size="small"
          style="width: 200px"
          @change="onSchemeChange"
        >
          <el-option label="不使用品级方案" :value="null" />
          <el-option
            v-for="scheme in schemes"
            :key="scheme.id"
            :label="`${scheme.name} (${scheme.gradeCount || 0}个品级)`"
            :value="scheme.id"
          />
        </el-select>
        <el-button type="primary" size="small" :icon="Plus" @click="showCreateSchemeDialog">
          新建方案
        </el-button>
      </div>
    </div>

    <!-- 当前方案详情 -->
    <div v-if="currentScheme" class="scheme-detail">
      <div class="scheme-header">
        <div class="scheme-info">
          <span class="scheme-name">{{ currentScheme.name }}</span>
          <el-tag size="small" type="info">{{ currentScheme.category }}</el-tag>
        </div>
        <div class="scheme-actions">
          <el-button size="small" @click="showEditSchemeDialog">编辑方案</el-button>
          <el-button size="small" type="danger" @click="deleteScheme" :disabled="currentScheme.is_system">删除</el-button>
        </div>
      </div>

      <!-- 品级列表 -->
      <div class="grades-section">
        <div class="section-header">
          <span>品级列表</span>
          <el-button type="primary" size="small" :icon="Plus" @click="showAddGradeDialog">添加品级</el-button>
        </div>

        <div class="grades-list" v-if="grades.length > 0">
          <draggable
            v-model="grades"
            item-key="id"
            handle=".drag-handle"
            @end="onGradeReorder"
          >
            <template #item="{ element: grade }">
              <div class="grade-item" :style="getGradeItemStyle(grade)">
                <div class="drag-handle">
                  <el-icon><Rank /></el-icon>
                </div>
                <div class="grade-preview" :style="getGradePreviewStyle(grade)">
                  <span class="preview-text">{{ grade.name }}</span>
                </div>
                <div class="grade-info">
                  <div class="grade-name">{{ grade.name }}</div>
                  <div class="grade-meta">
                    <span>权重: {{ grade.weight }}</span>
                    <span>概率: {{ calculateProbability(grade) }}</span>
                  </div>
                </div>
                <div class="grade-actions">
                  <el-button type="primary" link size="small" @click="showEditGradeDialog(grade)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                  <el-button type="primary" link size="small" @click="showStyleEditor(grade)">
                    <el-icon><Brush /></el-icon>
                  </el-button>
                  <el-button type="danger" link size="small" @click="deleteGrade(grade)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </template>
          </draggable>
        </div>

        <div class="grades-empty" v-else>
          <el-empty description="暂无品级，请添加" :image-size="60" />
        </div>
      </div>
    </div>

    <!-- 未选择方案提示 -->
    <div v-else class="no-scheme-tip">
      <el-empty description="请选择或创建品级方案" :image-size="80">
        <el-button type="primary" @click="showCreateSchemeDialog">创建品级方案</el-button>
      </el-empty>
    </div>

    <!-- 创建/编辑方案对话框 -->
    <el-dialog
      v-model="schemeDialogVisible"
      :title="isEditScheme ? '编辑品级方案' : '创建品级方案'"
      width="450px"
    >
      <el-form :model="schemeForm" :rules="schemeRules" ref="schemeFormRef" label-width="80px">
        <el-form-item label="方案标识" prop="schemeKey" v-if="!isEditScheme">
          <el-input v-model="schemeForm.schemeKey" placeholder="如: couplet_fortune" />
          <div class="form-tip">唯一标识，创建后不可修改</div>
        </el-form-item>
        <el-form-item label="方案名称" prop="name">
          <el-input v-model="schemeForm.name" placeholder="如: 对联品级方案" />
        </el-form-item>
        <el-form-item label="英文名称">
          <el-input v-model="schemeForm.nameEn" placeholder="如: Couplet Fortune Scheme" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="schemeForm.category" style="width: 100%">
            <el-option label="通用" value="general" />
            <el-option label="对联/题词" value="couplet" />
            <el-option label="坐骑" value="mount" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="schemeForm.description" type="textarea" :rows="2" placeholder="方案描述（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="schemeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveScheme">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加/编辑品级对话框 -->
    <el-dialog
      v-model="gradeDialogVisible"
      :title="isEditGrade ? '编辑品级' : '添加品级'"
      width="500px"
    >
      <el-form :model="gradeForm" :rules="gradeRules" ref="gradeFormRef" label-width="80px">
        <el-form-item label="品级名称" prop="name">
          <el-input v-model="gradeForm.name" placeholder="如: 大吉、上上签、传说" />
        </el-form-item>
        <el-form-item label="英文名称">
          <el-input v-model="gradeForm.nameEn" placeholder="如: Great Fortune" />
        </el-form-item>
        <el-form-item label="权重" prop="weight">
          <el-input-number v-model="gradeForm.weight" :min="1" :max="10000" style="width: 100%" />
          <div class="form-tip">权重越高，抽中该品级的概率越大</div>
        </el-form-item>
        <el-form-item label="AI Prompt">
          <el-input
            v-model="gradeForm.promptText"
            type="textarea"
            :rows="3"
            placeholder="用于AI生成时的风格提示，如: 极其华丽喜庆的风格，金光闪闪"
          />
        </el-form-item>
        <el-form-item label="主题色">
          <el-color-picker v-model="gradeForm.color" />
          <span class="color-preview" :style="{ background: gradeForm.color }">{{ gradeForm.color }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="gradeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveGrade">保存</el-button>
      </template>
    </el-dialog>

    <!-- 样式编辑器对话框 -->
    <el-dialog
      v-model="styleEditorVisible"
      title="样式配置"
      width="800px"
      class="style-editor-dialog"
    >
      <GradeStyleEditor
        v-if="editingGrade"
        :grade="editingGrade"
        @save="onStyleSave"
        @cancel="styleEditorVisible = false"
      />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Brush, Rank } from '@element-plus/icons-vue'
import draggable from 'vuedraggable'
import request from '@/api'
import GradeStyleEditor from './GradeStyleEditor.vue'

const props = defineProps({
  sceneId: {
    type: String,
    required: true
  },
  stepKey: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['change'])

// ==================== 方案相关 ====================
const schemes = ref([])
const selectedSchemeId = ref(null)
const currentScheme = ref(null)
const grades = ref([])

const schemeDialogVisible = ref(false)
const isEditScheme = ref(false)
const schemeFormRef = ref(null)
const schemeForm = reactive({
  id: null,
  schemeKey: '',
  name: '',
  nameEn: '',
  description: '',
  category: 'general'
})

const schemeRules = {
  schemeKey: [{ required: true, message: '请输入方案标识', trigger: 'blur' }],
  name: [{ required: true, message: '请输入方案名称', trigger: 'blur' }]
}

// 加载方案列表
const loadSchemes = async () => {
  try {
    const res = await request.get('/admin/grade-schemes')
    if (res.code === 0) {
      schemes.value = res.data.list || []
    }
  } catch (error) {
    console.error('加载方案列表失败:', error)
  }
}

// 加载当前步骤的方案映射
const loadCurrentMapping = async () => {
  if (!props.sceneId || !props.stepKey) return

  try {
    const res = await request.get(`/admin/grade-schemes/mapping/${props.sceneId}/${props.stepKey}`)
    if (res.code === 0 && res.data) {
      selectedSchemeId.value = res.data.scheme_id
      currentScheme.value = res.data
      grades.value = res.data.grades || []
    } else {
      selectedSchemeId.value = null
      currentScheme.value = null
      grades.value = []
    }
  } catch (error) {
    console.error('加载方案映射失败:', error)
  }
}

// 方案选择变化
const onSchemeChange = async (schemeId) => {
  if (schemeId) {
    // 设置映射
    try {
      await request.put(`/admin/grade-schemes/mapping/${props.sceneId}/${props.stepKey}`, {
        schemeId
      })
      ElMessage.success('方案已绑定')
      await loadSchemeDetail(schemeId)
      emit('change', schemeId)
    } catch (error) {
      console.error('绑定方案失败:', error)
      ElMessage.error('绑定失败')
    }
  } else {
    // 移除映射
    try {
      await request.delete(`/admin/grade-schemes/mapping/${props.sceneId}/${props.stepKey}`)
      currentScheme.value = null
      grades.value = []
      emit('change', null)
    } catch (error) {
      console.error('移除映射失败:', error)
    }
  }
}

// 加载方案详情
const loadSchemeDetail = async (schemeId) => {
  try {
    const res = await request.get(`/admin/grade-schemes/${schemeId}`)
    if (res.code === 0) {
      currentScheme.value = res.data
      grades.value = res.data.grades || []
    }
  } catch (error) {
    console.error('加载方案详情失败:', error)
  }
}

// 显示创建方案对话框
const showCreateSchemeDialog = () => {
  isEditScheme.value = false
  Object.assign(schemeForm, {
    id: null,
    schemeKey: '',
    name: '',
    nameEn: '',
    description: '',
    category: 'general'
  })
  schemeDialogVisible.value = true
}

// 显示编辑方案对话框
const showEditSchemeDialog = () => {
  if (!currentScheme.value) return
  isEditScheme.value = true
  Object.assign(schemeForm, {
    id: currentScheme.value.id,
    schemeKey: currentScheme.value.scheme_key,
    name: currentScheme.value.name,
    nameEn: currentScheme.value.name_en || '',
    description: currentScheme.value.description || '',
    category: currentScheme.value.category || 'general'
  })
  schemeDialogVisible.value = true
}

// 保存方案
const saveScheme = async () => {
  try {
    await schemeFormRef.value.validate()

    if (isEditScheme.value) {
      await request.put(`/admin/grade-schemes/${schemeForm.id}`, {
        name: schemeForm.name,
        nameEn: schemeForm.nameEn,
        description: schemeForm.description,
        category: schemeForm.category
      })
      ElMessage.success('更新成功')
      await loadSchemeDetail(schemeForm.id)
    } else {
      const res = await request.post('/admin/grade-schemes', {
        schemeKey: schemeForm.schemeKey,
        name: schemeForm.name,
        nameEn: schemeForm.nameEn,
        description: schemeForm.description,
        category: schemeForm.category
      })
      ElMessage.success('创建成功')
      await loadSchemes()
      // 自动选择新创建的方案
      if (res.data?.id) {
        selectedSchemeId.value = res.data.id
        await onSchemeChange(res.data.id)
      }
    }

    schemeDialogVisible.value = false
  } catch (error) {
    if (error !== 'cancel') {
      console.error('保存方案失败:', error)
      ElMessage.error('保存失败')
    }
  }
}

// 删除方案
const deleteScheme = async () => {
  if (!currentScheme.value) return

  try {
    await ElMessageBox.confirm(
      `确定删除方案"${currentScheme.value.name}"吗？删除后无法恢复。`,
      '确认删除',
      { type: 'warning' }
    )

    await request.delete(`/admin/grade-schemes/${currentScheme.value.id}`)
    ElMessage.success('删除成功')

    selectedSchemeId.value = null
    currentScheme.value = null
    grades.value = []
    await loadSchemes()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除方案失败:', error)
      ElMessage.error(error.response?.data?.msg || '删除失败')
    }
  }
}

// ==================== 品级相关 ====================
const gradeDialogVisible = ref(false)
const isEditGrade = ref(false)
const gradeFormRef = ref(null)
const gradeForm = reactive({
  id: null,
  gradeKey: '',
  name: '',
  nameEn: '',
  weight: 100,
  promptText: '',
  color: '#409eff'
})

const gradeRules = {
  name: [{ required: true, message: '请输入品级名称', trigger: 'blur' }],
  weight: [{ required: true, message: '请输入权重', trigger: 'blur' }]
}

// 显示添加品级对话框
const showAddGradeDialog = () => {
  isEditGrade.value = false
  Object.assign(gradeForm, {
    id: null,
    gradeKey: '',
    name: '',
    nameEn: '',
    weight: 100,
    promptText: '',
    color: '#409eff'
  })
  gradeDialogVisible.value = true
}

// 显示编辑品级对话框
const showEditGradeDialog = (grade) => {
  isEditGrade.value = true
  Object.assign(gradeForm, {
    id: grade.id,
    gradeKey: grade.grade_key,
    name: grade.name,
    nameEn: grade.name_en || '',
    weight: grade.weight,
    promptText: grade.prompt_text || '',
    color: grade.color || '#409eff'
  })
  gradeDialogVisible.value = true
}

// 保存品级
const saveGrade = async () => {
  if (!currentScheme.value) return

  try {
    await gradeFormRef.value.validate()

    const data = {
      gradeKey: gradeForm.gradeKey || undefined,
      name: gradeForm.name,
      nameEn: gradeForm.nameEn,
      weight: gradeForm.weight,
      promptText: gradeForm.promptText,
      color: gradeForm.color
    }

    if (isEditGrade.value) {
      await request.put(`/admin/grade-schemes/${currentScheme.value.id}/grades/${gradeForm.id}`, data)
      ElMessage.success('更新成功')
    } else {
      await request.post(`/admin/grade-schemes/${currentScheme.value.id}/grades`, data)
      ElMessage.success('添加成功')
    }

    gradeDialogVisible.value = false
    await loadSchemeDetail(currentScheme.value.id)
  } catch (error) {
    if (error !== 'cancel') {
      console.error('保存品级失败:', error)
      ElMessage.error('保存失败')
    }
  }
}

// 删除品级
const deleteGrade = async (grade) => {
  if (!currentScheme.value) return

  try {
    await ElMessageBox.confirm(`确定删除品级"${grade.name}"吗？`, '确认删除', { type: 'warning' })
    await request.delete(`/admin/grade-schemes/${currentScheme.value.id}/grades/${grade.id}`)
    ElMessage.success('删除成功')
    await loadSchemeDetail(currentScheme.value.id)
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除品级失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// 品级排序
const onGradeReorder = async () => {
  if (!currentScheme.value) return

  try {
    const gradeIds = grades.value.map(g => g.id)
    await request.put(`/admin/grade-schemes/${currentScheme.value.id}/grades/reorder`, { gradeIds })
  } catch (error) {
    console.error('更新排序失败:', error)
  }
}

// 计算概率
const calculateProbability = (grade) => {
  const totalWeight = grades.value.reduce((sum, g) => sum + (g.weight || 0), 0)
  if (totalWeight === 0) return '-'
  const prob = (grade.weight / totalWeight) * 100
  return prob < 1 ? prob.toFixed(2) + '%' : prob.toFixed(1) + '%'
}

// ==================== 样式编辑器 ====================
const styleEditorVisible = ref(false)
const editingGrade = ref(null)

const showStyleEditor = (grade) => {
  editingGrade.value = { ...grade }
  styleEditorVisible.value = true
}

const onStyleSave = async (styleConfig) => {
  if (!currentScheme.value || !editingGrade.value) return

  try {
    await request.put(`/admin/grade-schemes/${currentScheme.value.id}/grades/${editingGrade.value.id}`, {
      styleConfig
    })
    ElMessage.success('样式已保存')
    styleEditorVisible.value = false
    await loadSchemeDetail(currentScheme.value.id)
  } catch (error) {
    console.error('保存样式失败:', error)
    ElMessage.error('保存失败')
  }
}

// 获取品级项样式
const getGradeItemStyle = (grade) => {
  return {
    borderLeftColor: grade.color || '#409eff'
  }
}

// 获取品级预览样式
const getGradePreviewStyle = (grade) => {
  const config = grade.styleConfig || grade.style_config
  if (!config) {
    return {
      background: grade.color || '#409eff',
      color: '#fff'
    }
  }

  const parsed = typeof config === 'string' ? JSON.parse(config) : config
  const style = {}

  // 背景
  if (parsed.card?.background) {
    const bg = parsed.card.background
    if (bg.type === 'gradient' && bg.colors) {
      style.background = `linear-gradient(${bg.direction || '135deg'}, ${bg.colors.join(', ')})`
    } else if (bg.color) {
      style.background = bg.color
    }
  } else {
    style.background = grade.color || '#409eff'
  }

  // 文字颜色
  if (parsed.text?.primary?.color) {
    style.color = parsed.text.primary.color
  } else {
    style.color = '#fff'
  }

  // 边框
  if (parsed.card?.border) {
    const border = parsed.card.border
    style.border = `${border.width || '2px'} ${border.style || 'solid'} ${border.color || 'transparent'}`
    style.borderRadius = border.radius || '8px'
  }

  return style
}

// 监听 props 变化
watch(() => [props.sceneId, props.stepKey], () => {
  if (props.sceneId && props.stepKey) {
    loadSchemes()
    loadCurrentMapping()
  }
}, { immediate: true })

// 初始化
onMounted(() => {
  loadSchemes()
  if (props.sceneId && props.stepKey) {
    loadCurrentMapping()
  }
})

defineExpose({
  reload: () => {
    loadSchemes()
    loadCurrentMapping()
  }
})
</script>

<style scoped>
.grade-scheme-manager {
  padding: 10px 0;
}

.scheme-selector {
  margin-bottom: 15px;
}

.selector-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selector-header .label {
  font-weight: 500;
  color: #606266;
}

.scheme-detail {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 15px;
  background: #fafafa;
}

.scheme-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
}

.scheme-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.scheme-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.scheme-actions {
  display: flex;
  gap: 8px;
}

.grades-section {
  margin-top: 10px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: 500;
  color: #606266;
}

.grades-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.grade-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #fff;
  border-radius: 6px;
  border-left: 4px solid #409eff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.drag-handle {
  cursor: move;
  color: #c0c4cc;
  padding: 4px;
}

.drag-handle:hover {
  color: #409eff;
}

.grade-preview {
  width: 60px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}

.preview-text {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.grade-info {
  flex: 1;
  min-width: 0;
}

.grade-name {
  font-weight: 500;
  color: #303133;
  margin-bottom: 2px;
}

.grade-meta {
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: #909399;
}

.grade-actions {
  display: flex;
  gap: 4px;
}

.grades-empty {
  padding: 20px;
  text-align: center;
}

.no-scheme-tip {
  padding: 40px 20px;
  text-align: center;
  background: #fafafa;
  border-radius: 8px;
  border: 1px dashed #dcdfe6;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.color-preview {
  display: inline-block;
  margin-left: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
}

.style-editor-dialog :deep(.el-dialog__body) {
  padding: 0;
}
</style>
