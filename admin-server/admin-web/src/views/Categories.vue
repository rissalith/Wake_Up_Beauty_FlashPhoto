<template>
  <div class="category-management">
    <!-- 头部操作栏 -->
    <div class="page-header">
      <div class="header-left">
        <h2>分类管理</h2>
        <span class="subtitle">管理模板市场的分类标签</span>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="showAddDialog">
          <el-icon><Plus /></el-icon> 新增分类
        </el-button>
      </div>
    </div>

    <!-- 分类列表 -->
    <div class="category-list" v-loading="loading">
      <el-table :data="categories" row-key="id" empty-text="暂无分类数据">
        <el-table-column label="排序" width="100" align="center">
          <template #default="{ row }">
            <el-input-number
              v-model="row.sort_order"
              :min="0"
              :max="999"
              size="small"
              controls-position="right"
              @change="updateSortOrder(row)"
              style="width: 80px"
            />
          </template>
        </el-table-column>
        <el-table-column label="分类名称" min-width="200">
          <template #default="{ row }">
            <div class="category-info">
              <el-image
                v-if="row.icon"
                class="category-icon"
                :src="row.icon"
                fit="cover"
              >
                <template #error>
                  <div class="icon-placeholder">{{ row.name?.charAt(0) || '?' }}</div>
                </template>
              </el-image>
              <div v-else class="icon-placeholder">{{ row.name?.charAt(0) || '?' }}</div>
              <div class="category-detail">
                <div class="category-name">{{ row.name }}</div>
                <div class="category-name-en" v-if="row.name_en">{{ row.name_en }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="模板数量" width="120" align="center">
          <template #default="{ row }">
            <span class="template-count">{{ row.template_count || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="显示状态" width="120" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.is_visible"
              :active-value="1"
              :inactive-value="0"
              @change="updateVisibility(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <div class="action-btns">
              <el-button type="primary" link size="small" @click="editCategory(row)">编辑</el-button>
              <el-button
                type="danger"
                link
                size="small"
                @click="deleteCategory(row)"
                :disabled="row.template_count > 0"
              >删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增/编辑分类对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑分类' : '新增分类'"
      width="500px"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="分类名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入中文名称" />
        </el-form-item>
        <el-form-item label="英文名称">
          <el-input v-model="form.name_en" placeholder="请输入英文名称（可选）" />
        </el-form-item>
        <el-form-item label="图标URL">
          <el-input v-model="form.icon" placeholder="请输入图标URL（可选）" />
        </el-form-item>
        <el-form-item label="排序权重">
          <el-input-number v-model="form.sort_order" :min="0" :max="999" />
          <span class="form-tip">数值越小越靠前</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { categoriesApi } from '../api'

const loading = ref(false)
const categories = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const formRef = ref(null)
const editingId = ref(null)

const form = ref({
  name: '',
  name_en: '',
  icon: '',
  sort_order: 0
})

const rules = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }]
}

// 加载分类列表
const loadCategories = async () => {
  loading.value = true
  try {
    const res = await categoriesApi.getList()
    if (res.code === 200) {
      categories.value = res.data || []
    }
  } catch (error) {
    console.error('加载分类失败:', error)
  } finally {
    loading.value = false
  }
}

// 显示新增对话框
const showAddDialog = () => {
  isEdit.value = false
  editingId.value = null
  form.value = {
    name: '',
    name_en: '',
    icon: '',
    sort_order: categories.value.length
  }
  dialogVisible.value = true
}

// 编辑分类
const editCategory = (row) => {
  isEdit.value = true
  editingId.value = row.id
  form.value = {
    name: row.name,
    name_en: row.name_en || '',
    icon: row.icon || '',
    sort_order: row.sort_order || 0
  }
  dialogVisible.value = true
}

// 提交表单
const submitForm = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    submitting.value = true
    try {
      if (isEdit.value) {
        await categoriesApi.update(editingId.value, form.value)
        ElMessage.success('更新成功')
      } else {
        await categoriesApi.create(form.value)
        ElMessage.success('创建成功')
      }
      dialogVisible.value = false
      loadCategories()
    } catch (error) {
      console.error('保存失败:', error)
    } finally {
      submitting.value = false
    }
  })
}

// 更新排序
const updateSortOrder = async (row) => {
  try {
    await categoriesApi.update(row.id, { sort_order: row.sort_order })
    ElMessage.success('排序已更新')
    loadCategories()
  } catch (error) {
    console.error('更新排序失败:', error)
  }
}

// 更新显示状态
const updateVisibility = async (row) => {
  try {
    await categoriesApi.update(row.id, { is_visible: row.is_visible })
    ElMessage.success(row.is_visible ? '已显示' : '已隐藏')
  } catch (error) {
    console.error('更新状态失败:', error)
    row.is_visible = row.is_visible ? 0 : 1
  }
}

// 删除分类
const deleteCategory = async (row) => {
  if (row.template_count > 0) {
    ElMessage.warning('该分类下有模板，无法删除')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要删除分类「${row.name}」吗？`,
      '删除确认',
      { type: 'warning' }
    )

    await categoriesApi.delete(row.id)
    ElMessage.success('删除成功')
    loadCategories()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
    }
  }
}

onMounted(() => {
  loadCategories()
})
</script>

<style scoped>
.category-management {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left h2 {
  margin: 0;
  font-size: 20px;
  color: #303133;
}

.header-left .subtitle {
  font-size: 14px;
  color: #909399;
  margin-left: 12px;
}

.category-list {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
}

.category-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.category-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  flex-shrink: 0;
}

.icon-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
}

.category-detail {
  flex: 1;
}

.category-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.category-name-en {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.template-count {
  font-size: 14px;
  color: #606266;
}

.action-btns {
  display: flex;
  gap: 8px;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-left: 12px;
}
</style>
