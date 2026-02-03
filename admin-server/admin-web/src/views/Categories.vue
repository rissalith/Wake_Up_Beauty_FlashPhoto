<template>
  <div class="category-management">
    <!-- 头部操作栏 -->
    <div class="page-header">
      <div class="header-left">
        <h2>分类管理</h2>
        <span class="subtitle">管理模板市场的分类标签，拖拽调整顺序</span>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="showAddDialog">
          <el-icon><Plus /></el-icon> 新增分类
        </el-button>
      </div>
    </div>

    <!-- 分类列表 -->
    <div class="category-list" v-loading="loading">
      <el-table
        :data="categories"
        row-key="id"
        empty-text="暂无分类数据"
        @row-drop="handleDrop"
      >
        <el-table-column label="" width="50" align="center">
          <template #default>
            <el-icon class="drag-handle"><Rank /></el-icon>
          </template>
        </el-table-column>
        <el-table-column label="分类名称" min-width="200">
          <template #default="{ row }">
            <div class="category-info">
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

      <!-- 拖拽提示 -->
      <div class="drag-tip">
        <el-icon><InfoFilled /></el-icon>
        <span>拖拽行可调整分类顺序</span>
      </div>
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
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { Plus, Rank, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { categoriesApi } from '../api'
import Sortable from 'sortablejs'

const loading = ref(false)
const categories = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const formRef = ref(null)
const editingId = ref(null)

const form = ref({
  name: '',
  name_en: ''
})

const rules = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }]
}

// 初始化拖拽排序
const initSortable = () => {
  nextTick(() => {
    const el = document.querySelector('.category-list .el-table__body-wrapper tbody')
    if (el) {
      Sortable.create(el, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: async ({ oldIndex, newIndex }) => {
          if (oldIndex === newIndex) return

          // 更新本地数据顺序
          const movedItem = categories.value.splice(oldIndex, 1)[0]
          categories.value.splice(newIndex, 0, movedItem)

          // 生成新的排序数据
          const orders = categories.value.map((item, index) => ({
            id: item.id,
            sort_order: index
          }))

          // 调用后端更新排序
          try {
            await categoriesApi.reorder(orders)
            ElMessage.success('排序已更新')
          } catch (error) {
            console.error('更新排序失败:', error)
            // 失败时重新加载
            loadCategories()
          }
        }
      })
    }
  })
}

// 加载分类列表
const loadCategories = async () => {
  loading.value = true
  try {
    const res = await categoriesApi.getList()
    if (res.code === 200) {
      categories.value = res.data || []
      initSortable()
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
    name_en: ''
  }
  dialogVisible.value = true
}

// 编辑分类
const editCategory = (row) => {
  isEdit.value = true
  editingId.value = row.id
  form.value = {
    name: row.name,
    name_en: row.name_en || ''
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
        // 新增时设置排序为最后
        await categoriesApi.create({
          ...form.value,
          sort_order: categories.value.length
        })
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

.drag-handle {
  cursor: move;
  color: #c0c4cc;
  font-size: 18px;
}

.drag-handle:hover {
  color: #409eff;
}

.category-info {
  display: flex;
  align-items: center;
  gap: 12px;
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

.drag-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 10px 16px;
  background: #f4f4f5;
  border-radius: 4px;
  font-size: 13px;
  color: #909399;
}

/* 拖拽时的样式 */
:deep(.sortable-ghost) {
  opacity: 0.5;
  background: #e6f7ff;
}

:deep(.el-table__row) {
  cursor: default;
}

:deep(.el-table__row .drag-handle) {
  cursor: move;
}
</style>
