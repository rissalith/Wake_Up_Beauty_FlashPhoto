<template>
  <div class="draw-pool-manager">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="filterRarity" placeholder="稀有度筛选" clearable style="width: 120px" @change="loadItems">
          <el-option label="全部" value="" />
          <el-option v-for="r in rarityOptions" :key="r.value" :label="r.label" :value="r.value" />
        </el-select>
        <el-input v-model="searchKeyword" placeholder="搜索" clearable style="width: 200px; margin-left: 10px" @clear="loadItems" @keyup.enter="loadItems">
          <template #append>
            <el-button :icon="Search" @click="loadItems" />
          </template>
        </el-input>
      </div>
      <div class="toolbar-right">
        <el-button type="primary" :icon="Plus" @click="showAddDialog">添加{{ itemLabel }}</el-button>
        <el-button :icon="Upload" @click="showBatchDialog" v-if="poolType === 'phrase'">批量导入</el-button>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="stats-bar">
      <span>共 {{ total }} 个{{ itemLabel }}</span>
      <template v-if="poolType === 'phrase'">
        <span v-for="r in rarityOptions" :key="r.value" :class="['stat-item', r.value]">
          {{ r.label }}: {{ stats[r.value] || 0 }}
        </span>
      </template>
      <template v-else>
        <span class="stat-item">概率总和: {{ probabilitySum }}%</span>
        <el-tag :type="probabilitySum === 100 ? 'success' : 'danger'" size="small">
          {{ probabilitySum === 100 ? '✓ 正确' : '✗ 需要等于100%' }}
        </el-tag>
      </template>
    </div>

    <!-- 列表 -->
    <el-table :data="items" v-loading="loading" stripe>
      <!-- 词组池列 -->
      <template v-if="poolType === 'phrase'">
        <el-table-column prop="phrase" label="中文" min-width="120" />
        <el-table-column prop="phrase_en" label="英文" min-width="150" />
        <el-table-column prop="rarity" label="稀有度" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getRarityType(row.rarity)" size="small">{{ getRarityText(row.rarity) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="weight" label="权重" width="80" align="center" />
      </template>

      <!-- 马品级列 -->
      <template v-else>
        <el-table-column prop="image" label="图片" width="80" align="center">
          <template #default="{ row }">
            <el-image v-if="row.image" :src="row.image" style="width: 50px; height: 50px" fit="cover" :preview-src-list="[row.image]" />
            <span v-else class="horse-emoji">🐴</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="100" />
        <el-table-column prop="name_en" label="英文名" min-width="120" />
        <el-table-column prop="grade_key" label="品级标识" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getGradeType(row.grade_key)" size="small">{{ row.grade_key }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="probability" label="概率" width="100" align="center">
          <template #default="{ row }">
            {{ (row.probability * 100).toFixed(0) }}%
          </template>
        </el-table-column>
        <el-table-column prop="sort_order" label="排序" width="70" align="center" />
      </template>

      <!-- 公共列 -->
      <el-table-column prop="prompt_text" label="Prompt文本" min-width="150" show-overflow-tooltip />
      <el-table-column prop="is_active" label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-switch v-model="row.is_active" :active-value="1" :inactive-value="0" @change="updateItem(row)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
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
        @current-change="loadItems"
      />
    </div>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? `编辑${itemLabel}` : `添加${itemLabel}`" width="550px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <!-- 词组池表单 -->
        <template v-if="poolType === 'phrase'">
          <el-form-item label="中文词组" prop="phrase">
            <el-input v-model="form.phrase" placeholder="如：马到成功" />
          </el-form-item>
          <el-form-item label="英文翻译">
            <el-input v-model="form.phraseEn" placeholder="如：Instant Success" />
          </el-form-item>
          <el-form-item label="稀有度" prop="rarity">
            <el-select v-model="form.rarity" style="width: 100%">
              <el-option v-for="r in rarityOptions" :key="r.value" :label="r.label" :value="r.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="权重">
            <el-input-number v-model="form.weight" :min="1" :max="1000" style="width: 100%" />
            <div class="form-tip">权重越高，抽中概率越大</div>
          </el-form-item>
        </template>

        <!-- 马品级表单 -->
        <template v-else>
          <el-form-item label="品级标识" prop="gradeKey">
            <el-input v-model="form.gradeKey" placeholder="如：common, silver, gold, divine" :disabled="isEdit" />
            <div class="form-tip">唯一标识，用于程序识别</div>
          </el-form-item>
          <el-form-item label="中文名称" prop="name">
            <el-input v-model="form.name" placeholder="如：普通马" />
          </el-form-item>
          <el-form-item label="英文名称">
            <el-input v-model="form.nameEn" placeholder="如：Common Horse" />
          </el-form-item>
          <el-form-item label="图片">
            <div class="image-upload-area">
              <el-image v-if="form.image" :src="form.image" style="width: 100px; height: 100px" fit="cover" />
              <el-input v-model="form.image" placeholder="图片URL" style="flex: 1; margin-left: 10px" />
            </div>
          </el-form-item>
          <el-form-item label="概率" prop="probability">
            <el-input-number v-model="form.probability" :min="0" :max="100" :precision="0" style="width: 100%">
              <template #append>%</template>
            </el-input-number>
            <div class="form-tip">所有品级概率之和必须等于100%</div>
          </el-form-item>
          <el-form-item label="排序">
            <el-input-number v-model="form.sortOrder" :min="0" :max="100" style="width: 100%" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="form.description" type="textarea" :rows="2" placeholder="品级描述" />
          </el-form-item>
        </template>

        <!-- 公共字段 -->
        <el-form-item label="Prompt文本">
          <el-input v-model="form.promptText" type="textarea" :rows="2" placeholder="用于AI生成的文本描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveItem">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入对话框 -->
    <el-dialog v-model="batchDialogVisible" title="批量导入词组" width="600px">
      <el-alert type="info" :closable="false" style="margin-bottom: 15px">
        <template #title>
          每行一个词组，格式：中文,英文,稀有度,权重<br>
          示例：马到成功,Instant Success,epic,80
        </template>
      </el-alert>
      <el-input v-model="batchText" type="textarea" :rows="10" placeholder="马到成功,Instant Success,epic,80
龙马精神,Vigorous Spirit,legendary,50
一马当先,Take the Lead,rare,90" />
      <template #footer>
        <el-button @click="batchDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="batchImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload, Search } from '@element-plus/icons-vue'
import request from '@/api'

const props = defineProps({
  sceneId: {
    type: String,
    required: true
  },
  // 池类型: phrase(词组池) / horse(马品级)
  poolType: {
    type: String,
    default: 'phrase',
    validator: (v) => ['phrase', 'horse'].includes(v)
  }
})

// 计算属性
const itemLabel = computed(() => props.poolType === 'phrase' ? '词组' : '品级')
const apiPath = computed(() => props.poolType === 'phrase' ? 'phrases' : 'horse-grades')

// 稀有度选项
const rarityOptions = [
  { value: 'common', label: '普通' },
  { value: 'rare', label: '稀有' },
  { value: 'epic', label: '史诗' },
  { value: 'legendary', label: '传说' }
]

// 数据
const loading = ref(false)
const items = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(50)
const filterRarity = ref('')
const searchKeyword = ref('')

// 统计
const stats = computed(() => {
  const result = { common: 0, rare: 0, epic: 0, legendary: 0 }
  items.value.forEach(item => {
    const key = props.poolType === 'phrase' ? item.rarity : item.grade_key
    if (result[key] !== undefined) {
      result[key]++
    }
  })
  return result
})

const probabilitySum = computed(() => {
  if (props.poolType !== 'horse') return 0
  return Math.round(items.value.reduce((sum, item) => sum + (item.probability || 0) * 100, 0))
})

// 对话框
const dialogVisible = ref(false)
const batchDialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const form = reactive({
  id: null,
  // 词组池字段
  phrase: '',
  phraseEn: '',
  rarity: 'common',
  weight: 100,
  // 马品级字段
  gradeKey: '',
  name: '',
  nameEn: '',
  image: '',
  probability: 10,
  sortOrder: 0,
  description: '',
  // 公共字段
  promptText: ''
})
const batchText = ref('')

const rules = computed(() => {
  if (props.poolType === 'phrase') {
    return {
      phrase: [{ required: true, message: '请输入中文词组', trigger: 'blur' }],
      rarity: [{ required: true, message: '请选择稀有度', trigger: 'change' }]
    }
  } else {
    return {
      gradeKey: [{ required: true, message: '请输入品级标识', trigger: 'blur' }],
      name: [{ required: true, message: '请输入中文名称', trigger: 'blur' }],
      probability: [{ required: true, message: '请输入概率', trigger: 'blur' }]
    }
  }
})

// 加载列表
const loadItems = async () => {
  if (!props.sceneId) return

  loading.value = true
  try {
    const params = { page: currentPage.value, pageSize: pageSize.value }
    if (filterRarity.value) params.rarity = filterRarity.value

    const res = await request.get(`/admin/scenes/${props.sceneId}/${apiPath.value}`, { params })
    if (res.code === 0) {
      items.value = res.data.list || res.data || []
      total.value = res.data.total || items.value.length

      // 前端搜索过滤
      if (searchKeyword.value) {
        const keyword = searchKeyword.value.toLowerCase()
        items.value = items.value.filter(item => {
          if (props.poolType === 'phrase') {
            return item.phrase?.toLowerCase().includes(keyword) ||
                   item.phrase_en?.toLowerCase().includes(keyword)
          } else {
            return item.name?.toLowerCase().includes(keyword) ||
                   item.name_en?.toLowerCase().includes(keyword) ||
                   item.grade_key?.toLowerCase().includes(keyword)
          }
        })
      }
    }
  } catch (error) {
    console.error('加载列表失败:', error)
    ElMessage.error('加载列表失败')
  } finally {
    loading.value = false
  }
}

// 显示添加对话框
const showAddDialog = () => {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

// 重置表单
const resetForm = () => {
  Object.assign(form, {
    id: null,
    phrase: '',
    phraseEn: '',
    rarity: 'common',
    weight: 100,
    gradeKey: '',
    name: '',
    nameEn: '',
    image: '',
    probability: 10,
    sortOrder: 0,
    description: '',
    promptText: ''
  })
}

// 编辑
const editItem = (row) => {
  isEdit.value = true
  if (props.poolType === 'phrase') {
    Object.assign(form, {
      id: row.id,
      phrase: row.phrase,
      phraseEn: row.phrase_en,
      rarity: row.rarity,
      weight: row.weight,
      promptText: row.prompt_text
    })
  } else {
    Object.assign(form, {
      id: row.id,
      gradeKey: row.grade_key,
      name: row.name,
      nameEn: row.name_en,
      image: row.image,
      probability: Math.round((row.probability || 0) * 100),
      sortOrder: row.sort_order,
      description: row.description,
      promptText: row.prompt_text
    })
  }
  dialogVisible.value = true
}

// 保存
const saveItem = async () => {
  try {
    await formRef.value.validate()

    let data
    if (props.poolType === 'phrase') {
      data = {
        phrase: form.phrase,
        phraseEn: form.phraseEn,
        rarity: form.rarity,
        weight: form.weight,
        promptText: form.promptText || form.phrase
      }
    } else {
      data = {
        gradeKey: form.gradeKey,
        name: form.name,
        nameEn: form.nameEn,
        image: form.image,
        probability: form.probability / 100,
        sortOrder: form.sortOrder,
        description: form.description,
        promptText: form.promptText || form.name
      }
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

// 更新状态
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

// 删除
const deleteItem = async (row) => {
  const name = props.poolType === 'phrase' ? row.phrase : row.name
  try {
    await ElMessageBox.confirm(`确定删除"${name}"吗？`, '确认删除', { type: 'warning' })
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
  const phrases = []

  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim())
    if (parts[0]) {
      phrases.push({
        phrase: parts[0],
        phraseEn: parts[1] || '',
        rarity: parts[2] || 'common',
        weight: parseInt(parts[3]) || 100
      })
    }
  }

  if (phrases.length === 0) {
    ElMessage.warning('没有有效的数据')
    return
  }

  try {
    await request.post(`/admin/scenes/${props.sceneId}/phrases/batch`, { phrases })
    ElMessage.success(`成功导入 ${phrases.length} 个词组`)
    batchDialogVisible.value = false
    loadItems()
  } catch (error) {
    console.error('批量导入失败:', error)
    ElMessage.error('批量导入失败')
  }
}

// 辅助方法
const getRarityType = (rarity) => {
  const map = { common: 'info', rare: '', epic: 'warning', legendary: 'danger' }
  return map[rarity] || 'info'
}

const getRarityText = (rarity) => {
  const map = { common: '普通', rare: '稀有', epic: '史诗', legendary: '传说' }
  return map[rarity] || '普通'
}

const getGradeType = (grade) => {
  const map = { common: 'info', silver: '', gold: 'warning', divine: 'danger' }
  return map[grade] || 'info'
}

// 监听 sceneId 变化
watch(() => props.sceneId, (newVal) => {
  if (newVal) loadItems()
})

// 初始化
onMounted(() => {
  if (props.sceneId) loadItems()
})

defineExpose({ reload: loadItems })
</script>

<style scoped>
.draw-pool-manager {
  padding: 10px 0;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.toolbar-left {
  display: flex;
  align-items: center;
}

.stats-bar {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px 15px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 15px;
  font-size: 14px;
  color: #606266;
}

.stat-item {
  padding: 2px 8px;
  border-radius: 4px;
  background: #e0e0e0;
}

.stat-item.rare { background: #409eff; color: #fff; }
.stat-item.epic { background: #e6a23c; color: #fff; }
.stat-item.legendary { background: #f56c6c; color: #fff; }

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 15px;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}

.image-upload-area {
  display: flex;
  align-items: center;
}

.horse-emoji {
  font-size: 30px;
}
</style>
