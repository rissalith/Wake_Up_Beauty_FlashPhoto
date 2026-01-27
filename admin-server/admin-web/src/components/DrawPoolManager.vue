<template>
  <div class="draw-pool-manager">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-button size="small" @click="showGradesDialog">
          品级管理 ({{ grades.length }})
        </el-button>
        <el-select v-model="filterGrade" placeholder="品级筛选" clearable size="small" style="width: 100px" @change="loadItems">
          <el-option label="全部" value="" />
          <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.name" />
        </el-select>
        <el-input v-model="searchKeyword" placeholder="搜索" clearable size="small" style="width: 100px" @clear="loadItems" @keyup.enter="loadItems">
          <template #append>
            <el-button :icon="Search" @click="loadItems" />
          </template>
        </el-input>
      </div>
      <div class="toolbar-right">
        <el-button type="primary" size="small" :icon="Plus" @click="showAddDialog" :disabled="grades.length === 0">添加</el-button>
        <el-button size="small" :icon="Upload" @click="showBatchDialog" :disabled="grades.length === 0">批量导入</el-button>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="stats-bar">
      <span>共 {{ total }} 项</span>
      <span v-for="g in grades" :key="g.id" class="stat-item" :style="{ background: g.color }">
        {{ g.name }}: {{ getGradeCount(g.name) }}
      </span>
    </div>

    <!-- 列表 -->
    <el-table :data="items" v-loading="loading" stripe size="small" max-height="350">
      <!-- 图片列（可选） -->
      <el-table-column v-if="showImage" prop="image" label="图" width="50" align="center">
        <template #default="{ row }">
          <el-image v-if="row.image" :src="row.image" style="width: 30px; height: 30px" fit="cover" :preview-src-list="[row.image]" />
          <span v-else class="placeholder-icon">-</span>
        </template>
      </el-table-column>

      <!-- 名称 -->
      <el-table-column prop="name" label="名称" min-width="80" show-overflow-tooltip />
      <el-table-column prop="name_en" label="英文" min-width="80" show-overflow-tooltip />

      <!-- 品级 -->
      <el-table-column prop="rarity" label="品级" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :color="getGradeColor(row.rarity)" style="color: #fff; border: none;">{{ row.rarity || '-' }}</el-tag>
        </template>
      </el-table-column>

      <!-- 启用 -->
      <el-table-column prop="is_active" label="启用" width="55" align="center">
        <template #default="{ row }">
          <el-switch v-model="row.is_active" :active-value="1" :inactive-value="0" @change="updateItem(row)" size="small" />
        </template>
      </el-table-column>

      <!-- 操作 -->
      <el-table-column label="操作" width="80" align="center" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="editItem(row)">编辑</el-button>
          <el-button type="danger" link size="small" @click="deleteItem(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-wrapper" v-if="total > pageSize">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        size="small"
        @current-change="loadItems"
      />
    </div>

    <!-- 品级管理弹窗 -->
    <el-dialog v-model="gradesDialogVisible" title="品级管理" width="550px">
      <div class="grades-dialog-content">
        <div class="grades-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>品级权重决定抽中概率，权重越高概率越大。抽奖时先按权重抽品级，再从该品级词条中随机选一个。</span>
        </div>
        <div class="grades-list" v-if="grades.length > 0">
          <div v-for="grade in grades" :key="grade.id" class="grade-item" :style="{ borderLeftColor: grade.color }">
            <div class="grade-color">
              <el-color-picker v-model="grade.color" size="small" @change="updateGrade(grade)" />
            </div>
            <div class="grade-info">
              <el-input v-model="grade.name" size="small" style="width: 80px" @blur="updateGrade(grade)" />
              <el-input v-model="grade.name_en" size="small" style="width: 80px" placeholder="英文" @blur="updateGrade(grade)" />
            </div>
            <div class="grade-weight">
              <span class="weight-label">权重:</span>
              <el-input-number v-model="grade.weight" :min="1" :max="10000" size="small" style="width: 100px" @change="updateGrade(grade)" />
            </div>
            <div class="grade-actions">
              <el-button type="danger" link size="small" @click="deleteGrade(grade)">删除</el-button>
            </div>
          </div>
        </div>
        <div class="grades-empty" v-else>
          <span>暂无品级，请添加</span>
        </div>
        <div class="grades-add">
          <el-button type="primary" size="small" :icon="Plus" @click="showAddGradeDialog">添加品级</el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 品级添加对话框 -->
    <el-dialog v-model="gradeDialogVisible" title="添加品级" width="400px" append-to-body>
      <el-form :model="gradeForm" :rules="gradeRules" ref="gradeFormRef" label-width="80px" size="small">
        <el-form-item label="品级名称" prop="name">
          <el-input v-model="gradeForm.name" placeholder="如：大吉、普通、史诗" />
        </el-form-item>
        <el-form-item label="英文名">
          <el-input v-model="gradeForm.nameEn" placeholder="如：Great Luck" />
        </el-form-item>
        <el-form-item label="权重" prop="weight">
          <el-input-number v-model="gradeForm.weight" :min="1" :max="10000" style="width: 100%" />
          <div class="form-tip">权重越高，抽中该品级的概率越大</div>
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="gradeForm.color" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="gradeDialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" @click="saveGrade">保存</el-button>
      </template>
    </el-dialog>

    <!-- 词条添加/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑词条' : '添加词条'" width="450px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px" size="small">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="如：马到成功" />
        </el-form-item>
        <el-form-item label="英文">
          <el-input v-model="form.nameEn" placeholder="如：Instant Success" />
        </el-form-item>
        <el-form-item v-if="showImage" label="图片">
          <el-input v-model="form.image" placeholder="图片URL" />
        </el-form-item>
        <el-form-item label="品级" prop="rarity">
          <el-select v-model="form.rarity" style="width: 100%">
            <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="Prompt">
          <el-input v-model="form.promptText" type="textarea" :rows="2" placeholder="用于AI生成的文本描述（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" @click="saveItem">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入对话框 -->
    <el-dialog v-model="batchDialogVisible" title="批量导入词条" width="500px">
      <el-alert type="info" :closable="false" style="margin-bottom: 15px">
        <template #title>
          每行一项，格式：名称,英文,品级<br>
          品级必须是已定义的品级名称<br>
          示例：马到成功,Instant Success,rare
        </template>
      </el-alert>
      <el-input v-model="batchText" type="textarea" :rows="8" placeholder="马到成功,Instant Success,rare
龙马精神,Vigorous Spirit,epic
万事如意,All the Best,common" />
      <template #footer>
        <el-button size="small" @click="batchDialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" @click="batchImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload, Search, InfoFilled } from '@element-plus/icons-vue'
import request from '@/api'

const props = defineProps({
  sceneId: {
    type: String,
    required: true
  },
  stepKey: {
    type: String,
    default: ''
  },
  showImage: {
    type: Boolean,
    default: false
  }
})

// ==================== 品级相关 ====================
const grades = ref([])
const gradesDialogVisible = ref(false)
const gradeDialogVisible = ref(false)
const gradeFormRef = ref(null)
const gradeForm = reactive({
  id: null,
  name: '',
  nameEn: '',
  weight: 100,
  color: '#409eff'
})

const gradeRules = {
  name: [{ required: true, message: '请输入品级名称', trigger: 'blur' }],
  weight: [{ required: true, message: '请输入权重', trigger: 'blur' }]
}

// 显示品级管理弹窗
const showGradesDialog = () => {
  gradesDialogVisible.value = true
}

// 加载品级列表
const loadGrades = async () => {
  if (!props.sceneId || !props.stepKey) return

  try {
    const res = await request.get(`/admin/scenes/${props.sceneId}/draw-pool/${props.stepKey}/grades`)
    if (res.code === 0) {
      grades.value = res.data || []
    }
  } catch (error) {
    console.error('加载品级失败:', error)
  }
}

// 显示添加品级对话框
const showAddGradeDialog = () => {
  Object.assign(gradeForm, { id: null, name: '', nameEn: '', weight: 100, color: '#409eff' })
  gradeDialogVisible.value = true
}

// 保存品级
const saveGrade = async () => {
  try {
    await gradeFormRef.value.validate()

    const data = {
      name: gradeForm.name,
      nameEn: gradeForm.nameEn,
      weight: gradeForm.weight,
      color: gradeForm.color
    }

    await request.post(`/admin/scenes/${props.sceneId}/draw-pool/${props.stepKey}/grades`, data)
    ElMessage.success('添加成功')

    gradeDialogVisible.value = false
    loadGrades()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('保存品级失败:', error)
      ElMessage.error('保存失败')
    }
  }
}

// 更新品级
const updateGrade = async (grade) => {
  try {
    await request.put(`/admin/scenes/${props.sceneId}/draw-pool/${props.stepKey}/grades/${grade.id}`, {
      name: grade.name,
      nameEn: grade.name_en,
      weight: grade.weight,
      color: grade.color
    })
  } catch (error) {
    console.error('更新品级失败:', error)
    ElMessage.error('更新失败')
  }
}

// 删除品级
const deleteGrade = async (grade) => {
  try {
    await ElMessageBox.confirm(`确定删除品级"${grade.name}"吗？`, '确认删除', { type: 'warning' })
    await request.delete(`/admin/scenes/${props.sceneId}/draw-pool/${props.stepKey}/grades/${grade.id}`)
    ElMessage.success('删除成功')
    loadGrades()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除品级失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// 获取品级颜色
const getGradeColor = (rarityName) => {
  const grade = grades.value.find(g => g.name === rarityName)
  return grade?.color || '#909399'
}

// 获取品级词条数量
const getGradeCount = (gradeName) => {
  return items.value.filter(item => item.rarity === gradeName).length
}

// ==================== 词条相关 ====================
const loading = ref(false)
const items = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(100)
const filterGrade = ref('')
const searchKeyword = ref('')

// 对话框
const dialogVisible = ref(false)
const batchDialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const form = reactive({
  id: null,
  name: '',
  nameEn: '',
  image: '',
  rarity: '',
  promptText: ''
})
const batchText = ref('')

const rules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  rarity: [{ required: true, message: '请选择品级', trigger: 'change' }]
}

// API路径
const apiPath = computed(() => `draw-pool/${props.stepKey || 'default'}`)

// 加载词条列表
const loadItems = async () => {
  if (!props.sceneId || !props.stepKey) return

  loading.value = true
  try {
    const params = { page: currentPage.value, pageSize: pageSize.value }
    if (filterGrade.value) params.rarity = filterGrade.value

    const res = await request.get(`/admin/scenes/${props.sceneId}/${apiPath.value}`, { params })
    if (res.code === 0) {
      items.value = res.data.list || res.data || []
      total.value = res.data.total || items.value.length

      // 前端搜索过滤
      if (searchKeyword.value) {
        const keyword = searchKeyword.value.toLowerCase()
        items.value = items.value.filter(item =>
          item.name?.toLowerCase().includes(keyword) ||
          item.name_en?.toLowerCase().includes(keyword)
        )
      }
    }
  } catch (error) {
    console.error('加载列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 显示添加对话框
const showAddDialog = () => {
  isEdit.value = false
  Object.assign(form, { id: null, name: '', nameEn: '', image: '', rarity: grades.value[0]?.name || '', promptText: '' })
  dialogVisible.value = true
}

// 编辑词条
const editItem = (row) => {
  isEdit.value = true
  Object.assign(form, {
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
    image: row.image || '',
    rarity: row.rarity || '',
    promptText: row.prompt_text || ''
  })
  dialogVisible.value = true
}

// 保存词条
const saveItem = async () => {
  try {
    await formRef.value.validate()

    const data = {
      name: form.name,
      nameEn: form.nameEn,
      image: form.image || null,
      rarity: form.rarity,
      weight: 100,
      promptText: form.promptText || form.name
    }

    if (isEdit.value) {
      await request.put(`/admin/scenes/${props.sceneId}/${apiPath.value}/${form.id}`, data)
      ElMessage.success('更新成功')
    } else {
      await request.post(`/admin/scenes/${props.sceneId}/${apiPath.value}`, data)
      ElMessage.success('添加成功')
    }

    dialogVisible.value = false
    loadItems()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('保存失败:', error)
      ElMessage.error('保存失败')
    }
  }
}

// 更新词条状态
const updateItem = async (row) => {
  try {
    await request.put(`/admin/scenes/${props.sceneId}/${apiPath.value}/${row.id}`, {
      isActive: row.is_active
    })
  } catch (error) {
    console.error('更新失败:', error)
    ElMessage.error('更新失败')
    row.is_active = row.is_active === 1 ? 0 : 1
  }
}

// 删除词条
const deleteItem = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除"${row.name}"吗？`, '确认删除', { type: 'warning' })
    await request.delete(`/admin/scenes/${props.sceneId}/${apiPath.value}/${row.id}`)
    ElMessage.success('删除成功')
    loadItems()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// 批量导入
const showBatchDialog = () => {
  batchText.value = ''
  batchDialogVisible.value = true
}

const batchImport = async () => {
  if (!batchText.value.trim()) {
    ElMessage.warning('请输入要导入的数据')
    return
  }

  const lines = batchText.value.trim().split('\n')
  const importItems = []
  const gradeNames = grades.value.map(g => g.name)

  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim())
    if (parts[0]) {
      const rarity = parts[2] || gradeNames[0] || ''
      if (!gradeNames.includes(rarity)) {
        ElMessage.warning(`品级"${rarity}"不存在，请先在品级管理中添加`)
        return
      }
      importItems.push({
        name: parts[0],
        nameEn: parts[1] || '',
        rarity: rarity,
        weight: 100
      })
    }
  }

  if (importItems.length === 0) {
    ElMessage.warning('没有有效的数据')
    return
  }

  try {
    await request.post(`/admin/scenes/${props.sceneId}/${apiPath.value}/batch`, { items: importItems })
    ElMessage.success(`成功导入 ${importItems.length} 项`)
    batchDialogVisible.value = false
    loadItems()
  } catch (error) {
    console.error('批量导入失败:', error)
    ElMessage.error('批量导入失败')
  }
}

// 监听变化
watch(() => props.sceneId, (newVal) => {
  if (newVal && props.stepKey) {
    loadGrades()
    loadItems()
  }
})

watch(() => props.stepKey, (newVal) => {
  if (props.sceneId && newVal) {
    loadGrades()
    loadItems()
  }
})

// 初始化
onMounted(() => {
  if (props.sceneId && props.stepKey) {
    loadGrades()
    loadItems()
  }
})

defineExpose({ reload: () => { loadGrades(); loadItems() } })
</script>

<style scoped>
.draw-pool-manager {
  padding: 5px 0;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

/* 统计栏 */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 10px;
  font-size: 12px;
  color: #606266;
  flex-wrap: wrap;
}

.stat-item {
  padding: 2px 8px;
  border-radius: 3px;
  color: #fff;
  font-size: 11px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

.form-tip {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
}

.placeholder-icon {
  color: #c0c4cc;
}

/* 品级管理弹窗样式 */
.grades-dialog-content {
  max-height: 400px;
  overflow-y: auto;
}

.grades-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 4px;
  margin-bottom: 15px;
  font-size: 12px;
  color: #606266;
}

.grades-tip .el-icon {
  color: #409eff;
  margin-top: 2px;
}

.grades-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.grade-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  border-left: 3px solid #409eff;
}

.grade-color {
  flex-shrink: 0;
}

.grade-info {
  display: flex;
  gap: 8px;
  flex: 1;
}

.grade-weight {
  display: flex;
  align-items: center;
  gap: 6px;
}

.weight-label {
  font-size: 12px;
  color: #909399;
}

.grade-actions {
  flex-shrink: 0;
}

.grades-empty {
  padding: 30px;
  text-align: center;
  color: #909399;
  font-size: 13px;
}

.grades-add {
  margin-top: 15px;
  text-align: center;
}
</style>
