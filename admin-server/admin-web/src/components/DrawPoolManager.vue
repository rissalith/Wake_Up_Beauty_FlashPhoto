<template>
  <div class="draw-pool-manager">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="filterRarity" placeholder="品级筛选" clearable size="small" style="width: 100px" @change="loadItems">
          <el-option label="全部" value="" />
          <el-option v-for="r in rarityOptions" :key="r.value" :label="r.label" :value="r.value" />
        </el-select>
        <el-input v-model="searchKeyword" placeholder="搜索" clearable size="small" style="width: 120px" @clear="loadItems" @keyup.enter="loadItems">
          <template #append>
            <el-button :icon="Search" @click="loadItems" />
          </template>
        </el-input>
      </div>
      <div class="toolbar-right">
        <el-button type="primary" size="small" :icon="Plus" @click="showAddDialog">添加</el-button>
        <el-button size="small" :icon="Upload" @click="showBatchDialog">批量导入</el-button>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="stats-bar">
      <span>共 {{ total }} 项</span>
      <span v-for="r in rarityOptions" :key="r.value" :class="['stat-item', r.value]">
        {{ r.label }}: {{ stats[r.value] || 0 }}
      </span>
    </div>

    <!-- 列表 -->
    <el-table :data="items" v-loading="loading" stripe size="small">
      <!-- 图片列（可选） -->
      <el-table-column v-if="showImage" prop="image" label="图" width="50" align="center">
        <template #default="{ row }">
          <el-image v-if="row.image" :src="row.image" style="width: 30px; height: 30px" fit="cover" :preview-src-list="[row.image]" />
          <span v-else class="placeholder-icon">📷</span>
        </template>
      </el-table-column>

      <!-- 名称 -->
      <el-table-column prop="name" label="名称" width="100" show-overflow-tooltip />
      <el-table-column prop="name_en" label="英文" width="100" show-overflow-tooltip />

      <!-- 品级 -->
      <el-table-column prop="rarity" label="品级" width="70" align="center">
        <template #default="{ row }">
          <el-tag :type="getRarityType(row.rarity)" size="small">{{ getRarityText(row.rarity) }}</el-tag>
        </template>
      </el-table-column>

      <!-- 权重 -->
      <el-table-column prop="weight" label="权重" width="60" align="center" />

      <!-- 启用 -->
      <el-table-column prop="is_active" label="启用" width="55" align="center">
        <template #default="{ row }">
          <el-switch v-model="row.is_active" :active-value="1" :inactive-value="0" @change="updateItem(row)" size="small" />
        </template>
      </el-table-column>

      <!-- 操作 -->
      <el-table-column label="操作" width="80" align="center">
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

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑' : '添加'" width="450px">
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
            <el-option v-for="r in rarityOptions" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="form.weight" :min="1" :max="1000" style="width: 100%" />
          <div class="form-tip">权重越高，抽中概率越大</div>
        </el-form-item>
        <el-form-item label="Prompt">
          <el-input v-model="form.promptText" type="textarea" :rows="2" placeholder="用于AI生成的文本描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" @click="saveItem">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入对话框 -->
    <el-dialog v-model="batchDialogVisible" title="批量导入" width="500px">
      <el-alert type="info" :closable="false" style="margin-bottom: 15px">
        <template #title>
          每行一项，格式：名称,英文,品级,权重<br>
          品级可选：common/rare/epic/legendary<br>
          示例：马到成功,Instant Success,epic,80
        </template>
      </el-alert>
      <el-input v-model="batchText" type="textarea" :rows="8" placeholder="马到成功,Instant Success,epic,80
龙马精神,Vigorous Spirit,legendary,50" />
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
import { Plus, Upload, Search } from '@element-plus/icons-vue'
import request from '@/api'

const props = defineProps({
  sceneId: {
    type: String,
    required: true
  },
  // 步骤标识，用于区分同一场景下的不同抽奖池
  stepKey: {
    type: String,
    default: ''
  },
  // 是否显示图片列
  showImage: {
    type: Boolean,
    default: false
  }
})

// 品级选项
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
    if (result[item.rarity] !== undefined) {
      result[item.rarity]++
    }
  })
  return result
})

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
  rarity: 'common',
  weight: 100,
  promptText: ''
})
const batchText = ref('')

const rules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  rarity: [{ required: true, message: '请选择品级', trigger: 'change' }]
}

// API路径
const apiPath = computed(() => `draw-pool/${props.stepKey || 'default'}`)

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
  resetForm()
  dialogVisible.value = true
}

// 重置表单
const resetForm = () => {
  Object.assign(form, {
    id: null,
    name: '',
    nameEn: '',
    image: '',
    rarity: 'common',
    weight: 100,
    promptText: ''
  })
}

// 编辑
const editItem = (row) => {
  isEdit.value = true
  Object.assign(form, {
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
    image: row.image || '',
    rarity: row.rarity,
    weight: row.weight,
    promptText: row.prompt_text || ''
  })
  dialogVisible.value = true
}

// 保存
const saveItem = async () => {
  try {
    await formRef.value.validate()

    const data = {
      name: form.name,
      nameEn: form.nameEn,
      image: form.image || null,
      rarity: form.rarity,
      weight: form.weight,
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
  const items = []

  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim())
    if (parts[0]) {
      items.push({
        name: parts[0],
        nameEn: parts[1] || '',
        rarity: parts[2] || 'common',
        weight: parseInt(parts[3]) || 100
      })
    }
  }

  if (items.length === 0) {
    ElMessage.warning('没有有效的数据')
    return
  }

  try {
    await request.post(`/admin/scenes/${props.sceneId}/${apiPath.value}/batch`, { items })
    ElMessage.success(`成功导入 ${items.length} 项`)
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

// 监听 sceneId 变化
watch(() => props.sceneId, (newVal) => {
  if (newVal) loadItems()
})

watch(() => props.stepKey, (newVal) => {
  if (props.sceneId) loadItems()
})

// 初始化
onMounted(() => {
  if (props.sceneId) loadItems()
})

defineExpose({ reload: loadItems })
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
  padding: 2px 6px;
  border-radius: 3px;
  background: #e0e0e0;
  font-size: 11px;
}

.stat-item.rare { background: #409eff; color: #fff; }
.stat-item.epic { background: #e6a23c; color: #fff; }
.stat-item.legendary { background: #f56c6c; color: #fff; }

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
  font-size: 16px;
  opacity: 0.5;
}
</style>
