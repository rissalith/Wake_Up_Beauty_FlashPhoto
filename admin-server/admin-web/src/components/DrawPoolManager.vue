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

    <!-- 批量操作栏 -->
    <div class="batch-bar">
      <div class="batch-select-row">
        <span class="batch-label">快速选择:</span>
        <el-input
          v-model="rangeInput"
          placeholder="序号范围，如 1-20 或 1,3,5,10-15"
          size="small"
          style="width: 200px"
          @keyup.enter="selectByRange"
        />
        <el-button size="small" @click="selectByRange">选取</el-button>
        <el-button size="small" @click="selectAll">全选</el-button>
        <el-button size="small" @click="clearSelection" v-if="selectedItems.length > 0">清除</el-button>
      </div>
      <div class="batch-action-row" v-if="selectedItems.length > 0">
        <span class="selected-count">已选 {{ selectedItems.length }} 项</span>
        <el-select v-model="batchRarity" placeholder="选择品级" size="small" style="width: 100px">
          <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.name" />
        </el-select>
        <el-button type="primary" size="small" @click="batchSetRarity" :disabled="!batchRarity">设置品级</el-button>
      </div>
    </div>

    <!-- 列表 -->
    <el-table
      ref="tableRef"
      :data="items"
      v-loading="loading"
      stripe
      size="small"
      max-height="350"
      @selection-change="handleSelectionChange"
    >
      <!-- 序号列 -->
      <el-table-column type="index" label="#" width="45" :index="getRowIndex" />

      <!-- 多选列 -->
      <el-table-column type="selection" width="40" />

      <!-- 图片列（可选） -->
      <el-table-column v-if="showImage" prop="image" label="图" width="50" align="center">
        <template #default="{ row }">
          <el-image v-if="row.image" :src="row.image" style="width: 30px; height: 30px" fit="cover" :preview-src-list="[row.image]" />
          <span v-else class="placeholder-icon">-</span>
        </template>
      </el-table-column>

      <!-- 名称 -->
      <el-table-column prop="name" label="名称" width="100" show-overflow-tooltip />
      <el-table-column prop="name_en" label="英文" min-width="140" show-overflow-tooltip />

      <!-- 品级 -->
      <el-table-column prop="rarity" label="品级" width="100" align="center">
        <template #default="{ row }">
          <el-tag size="small" :color="getGradeColor(row.rarity)" style="color: #fff; border: none;">{{ row.rarity || '-' }}</el-tag>
        </template>
      </el-table-column>

      <!-- 概率 -->
      <el-table-column label="概率" width="60" align="center">
        <template #default="{ row }">
          <span class="probability">{{ getItemProbability(row) }}</span>
        </template>
      </el-table-column>

      <!-- 启用 -->
      <el-table-column prop="is_active" label="启用" width="55" align="center">
        <template #default="{ row }">
          <el-switch v-model="row.is_active" :active-value="1" :inactive-value="0" @change="updateItem(row)" size="small" />
        </template>
      </el-table-column>

      <!-- 操作 -->
      <el-table-column label="操作" width="90" align="center" fixed="right">
        <template #default="{ row }">
          <div class="action-btns">
            <el-button type="primary" link size="small" @click="editItem(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="deleteItem(row)">删除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 - 已移除，直接显示所有数据 -->

    <!-- 品级方案管理弹窗 -->
    <el-dialog v-model="gradesDialogVisible" title="品级方案管理" width="700px">
      <div class="grades-dialog-content">
        <div class="grades-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>每个步骤可以选择不同的品级方案。品级方案可以复用，例如"马品级方案"和"题词品级方案"可以分别配置。</span>
        </div>
        <GradeSchemeManager
          v-if="gradesDialogVisible && sceneId && stepKey"
          :scene-id="String(sceneId)"
          :step-key="stepKey"
          @change="onSchemeChange"
        />
      </div>
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
import GradeSchemeManager from './GradeSchemeManager.vue'

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

// 显示品级管理弹窗
const showGradesDialog = () => {
  gradesDialogVisible.value = true
}

// 品级方案变更回调
const onSchemeChange = (schemeId) => {
  // 重新加载品级列表
  loadGrades()
}

// 加载品级列表（从品级方案中获取）
const loadGrades = async () => {
  if (!props.sceneId || !props.stepKey) return

  try {
    // 先尝试从品级方案映射中获取
    const res = await request.get(`/admin/grade-schemes/mapping/${props.sceneId}/${props.stepKey}`)
    if (res.code === 0 && res.data && res.data.grades) {
      grades.value = res.data.grades || []
    } else {
      // 如果没有映射，尝试从旧的 draw_pool_grades 表获取
      const oldRes = await request.get(`/admin/scenes/${props.sceneId}/draw-pool/${props.stepKey}/grades`)
      if (oldRes.code === 0) {
        grades.value = oldRes.data || []
      }
    }
  } catch (error) {
    // 如果品级方案 API 失败，回退到旧的 API
    try {
      const oldRes = await request.get(`/admin/scenes/${props.sceneId}/draw-pool/${props.stepKey}/grades`)
      if (oldRes.code === 0) {
        grades.value = oldRes.data || []
      }
    } catch (e) {
      console.error('加载品级失败:', e)
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

// 计算词条抽中概率
const getItemProbability = (item) => {
  if (!item.rarity || grades.value.length === 0) return '-'

  // 计算所有品级权重之和
  const totalWeight = grades.value.reduce((sum, g) => sum + (g.weight || 0), 0)
  if (totalWeight === 0) return '-'

  // 找到该词条所属品级
  const grade = grades.value.find(g => g.name === item.rarity)
  if (!grade) return '-'

  // 该品级的词条数量
  const gradeItemCount = items.value.filter(i => i.rarity === item.rarity && i.is_active === 1).length
  if (gradeItemCount === 0) return '-'

  // 概率 = (品级权重 / 总权重) * (1 / 该品级词条数)
  const probability = (grade.weight / totalWeight) * (1 / gradeItemCount) * 100

  if (probability < 0.01) {
    return '<0.01%'
  } else if (probability < 1) {
    return probability.toFixed(2) + '%'
  } else {
    return probability.toFixed(1) + '%'
  }
}

// ==================== 词条相关 ====================
const loading = ref(false)
const items = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(500)
const filterGrade = ref('')
const searchKeyword = ref('')

// 批量选择
const tableRef = ref(null)
const selectedItems = ref([])
const batchRarity = ref('')
const rangeInput = ref('')

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

// 批量选择相关
const handleSelectionChange = (selection) => {
  selectedItems.value = selection
}

const clearSelection = () => {
  tableRef.value?.clearSelection()
  selectedItems.value = []
  batchRarity.value = ''
  rangeInput.value = ''
}

// 获取行序号（用于显示）
const getRowIndex = (index) => {
  return (currentPage.value - 1) * pageSize.value + index + 1
}

// 全选当前页
const selectAll = () => {
  items.value.forEach(row => {
    tableRef.value?.toggleRowSelection(row, true)
  })
}

// 按序号范围选择
const selectByRange = () => {
  if (!rangeInput.value.trim()) {
    ElMessage.warning('请输入序号范围')
    return
  }

  // 先清除现有选择
  tableRef.value?.clearSelection()

  // 解析序号范围，支持格式: 1-20, 1,3,5, 1-10,15,20-25
  const indices = new Set()
  const parts = rangeInput.value.split(',')

  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()))
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          indices.add(i)
        }
      }
    } else {
      const num = parseInt(trimmed)
      if (!isNaN(num)) {
        indices.add(num)
      }
    }
  }

  // 根据序号选择行（序号从1开始，转换为当前页的索引）
  const pageStart = (currentPage.value - 1) * pageSize.value + 1
  const pageEnd = pageStart + items.value.length - 1
  let selectedCount = 0

  indices.forEach(idx => {
    if (idx >= pageStart && idx <= pageEnd) {
      const rowIndex = idx - pageStart
      if (items.value[rowIndex]) {
        tableRef.value?.toggleRowSelection(items.value[rowIndex], true)
        selectedCount++
      }
    }
  })

  if (selectedCount > 0) {
    ElMessage.success(`已选择 ${selectedCount} 项`)
  } else {
    ElMessage.warning('未找到匹配的序号，请检查范围是否在当前页内')
  }
}

// 批量设置品级
const batchSetRarity = async () => {
  if (!selectedItems.value.length || !batchRarity.value) return

  try {
    const ids = selectedItems.value.map(item => item.id)
    const grade = grades.value.find(g => g.name === batchRarity.value)
    const weight = grade?.weight || 100

    await request.put(`/admin/scenes/${props.sceneId}/${apiPath.value}/batch-rarity`, {
      ids,
      rarity: batchRarity.value,
      weight
    })

    ElMessage.success(`已更新 ${ids.length} 个词条的品级`)
    clearSelection()
    loadItems()
  } catch (error) {
    console.error('批量设置品级失败:', error)
    ElMessage.error('批量设置品级失败')
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

.batch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 4px;
  margin-bottom: 10px;
}

.selected-count {
  font-size: 13px;
  color: #1890ff;
  font-weight: 500;
}

.action-btns {
  display: flex;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
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

/* 范围选择 */
.range-select {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f0f9eb;
  border: 1px solid #c2e7b0;
  border-radius: 4px;
  margin-bottom: 10px;
}

.range-select .el-input {
  width: 200px;
}

.range-hint {
  font-size: 12px;
  color: #67c23a;
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

.probability {
  font-size: 12px;
  color: #e6a23c;
  font-weight: 500;
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
  max-height: 500px;
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
</style>
