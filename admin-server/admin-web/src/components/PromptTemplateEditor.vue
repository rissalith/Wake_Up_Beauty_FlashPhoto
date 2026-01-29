<template>
  <div class="prompt-template-editor">
    <div class="editor-layout">
      <!-- 左侧：Prompt 模板编辑 -->
      <div class="editor-left">
        <div class="section-header">
          <span class="section-title">Prompt 模板</span>
          <el-button size="small" @click="copyPrompt">复制</el-button>
        </div>
        <el-input
          ref="textareaRef"
          v-model="localTemplate"
          type="textarea"
          :rows="16"
          placeholder="输入 Prompt 模板，点击下方变量按钮插入步骤参数..."
        />
        <!-- 变量按钮 -->
        <div class="variable-section">
          <span class="section-label">插入变量:</span>
          <div class="variable-buttons" v-if="sceneSteps.length > 0">
            <el-button
              v-for="step in sceneSteps"
              :key="step.step_key"
              size="small"
              class="var-btn"
              @click="insertVariable(step.step_key)"
            >
              <span v-text="getVarDisplay(step.step_key)"></span>
            </el-button>
          </div>
        </div>
      </div>

      <!-- 右侧：参数选择 + 实时预览 -->
      <div class="editor-right">
        <div class="section-header">
          <span class="section-title">实时预览</span>
        </div>

        <!-- 参数输入/选择器 -->
        <div class="preview-selectors" v-if="sceneSteps.length > 0">
          <div v-for="step in sceneSteps" :key="step.step_key" class="selector-item">
            <span class="selector-label">{{ step.title || step.step_key }}:</span>

            <!-- upload/image_upload 类型：只显示占位符 -->
            <el-tag v-if="isUploadType(step)" size="small" type="info">用户照片</el-tag>

            <!-- 性别选择：内置选项 -->
            <el-select
              v-else-if="step.component_type === 'gender_select'"
              v-model="previewSelections[step.step_key]"
              size="small"
              placeholder="选择"
              clearable
              style="width: 120px"
            >
              <el-option label="男士" value="男士" />
              <el-option label="女士" value="女士" />
            </el-select>

            <!-- 有固定选项的步骤用下拉框 -->
            <el-select
              v-else-if="step.options && step.options.length > 0"
              v-model="previewSelections[step.step_key]"
              size="small"
              placeholder="选择"
              clearable
              style="width: 160px"
            >
              <el-option
                v-for="opt in step.options"
                :key="opt.id || opt.option_key"
                :label="opt.label"
                :value="opt.prompt_text || opt.label"
              />
            </el-select>

            <!-- 摇骰子类型：从词条池加载选项 -->
            <el-select
              v-else-if="isDiceType(step) && drawPoolOptions[step.step_key]"
              v-model="previewSelections[step.step_key]"
              size="small"
              placeholder="选择"
              clearable
              filterable
              style="width: 160px"
            >
              <el-option
                v-for="item in drawPoolOptions[step.step_key]"
                :key="item.id"
                :label="item.name"
                :value="item.prompt_text || item.name"
              />
            </el-select>

            <!-- 其他类型：输入框 -->
            <el-input
              v-else
              v-model="previewSelections[step.step_key]"
              size="small"
              :placeholder="getPlaceholder(step)"
              style="width: 160px"
            />
          </div>
        </div>

        <!-- 预览结果 -->
        <div class="preview-result">
          <template v-for="(part, idx) in previewParts" :key="idx">
            <span :class="getPartClass(part)">{{ part.text }}</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/api'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({
      name: '',
      template: '',
      negative_prompt: '',
      segments: null,
      model_config: null
    })
  },
  sceneSteps: {
    type: Array,
    default: () => []
  },
  sceneId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

const textareaRef = ref(null)
const localTemplate = ref('')
const previewSelections = ref({})
const drawPoolOptions = ref({})

// 判断是否是摇骰子类型
function isDiceType(step) {
  return step.component_type === 'dice' || step.component_type === 'random_dice'
}

// 加载摇骰子步骤的词条池数据
async function loadDrawPoolOptions() {
  if (!props.sceneId) return

  for (const step of props.sceneSteps) {
    if (isDiceType(step) && step.step_key) {
      try {
        const res = await request.get(`/admin/scenes/${props.sceneId}/draw-pool/${step.step_key}`, {
          params: { pageSize: 200 }
        })
        if (res.code === 0) {
          drawPoolOptions.value[step.step_key] = res.data.list || []
        }
      } catch (e) {
        console.error('加载词条池失败:', e)
      }
    }
  }
}

// 监听 sceneSteps 变化，加载词条池
watch(() => props.sceneSteps, () => {
  loadDrawPoolOptions()
}, { immediate: true })

// 只显示有选项的步骤（用于预览选择器）
const stepsWithOptions = computed(() => {
  return props.sceneSteps.filter(step => step.options && step.options.length > 0)
})

// 预览结果（高亮变量和替换部分）
const previewParts = computed(() => {
  if (!localTemplate.value) {
    return [{ text: '(暂无内容，请在左侧输入 Prompt 模板)', type: 'empty' }]
  }

  const parts = []
  const regex = /(\{\{(\w+)\}\})/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(localTemplate.value)) !== null) {
    // 添加前面的普通文本
    if (match.index > lastIndex) {
      parts.push({
        text: localTemplate.value.slice(lastIndex, match.index),
        type: 'text'
      })
    }

    const varKey = match[2]
    const replacement = previewSelections.value[varKey]

    if (replacement) {
      // 已选择，显示替换后的值
      parts.push({
        text: replacement,
        type: 'replaced',
        varKey
      })
    } else {
      // 未选择，显示原变量
      parts.push({
        text: match[1],
        type: 'variable',
        varKey
      })
    }

    lastIndex = regex.lastIndex
  }

  // 添加剩余文本
  if (lastIndex < localTemplate.value.length) {
    parts.push({
      text: localTemplate.value.slice(lastIndex),
      type: 'text'
    })
  }

  return parts.length > 0 ? parts : [{ text: '(暂无内容)', type: 'empty' }]
})

// 获取变量显示文本
function getVarDisplay(key) {
  return '{{' + key + '}}'
}

// 判断是否是上传类型
function isUploadType(step) {
  return step.step_key === 'upload' || step.component_type === 'image_upload'
}

// 获取输入框占位符
function getPlaceholder(step) {
  const placeholders = {
    'gender': '如：男士/女士',
    'phrase': '如：马到成功',
    'horse': '如：金色骏马',
    'upload': '用户照片'
  }
  return placeholders[step.step_key] || '输入测试值'
}

// 获取部分的样式类
function getPartClass(part) {
  return {
    'part-text': part.type === 'text',
    'part-variable': part.type === 'variable',
    'part-replaced': part.type === 'replaced',
    'part-empty': part.type === 'empty'
  }
}

// 插入变量到光标位置
function insertVariable(varKey) {
  const textarea = textareaRef.value?.textarea
  if (textarea) {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = `{{${varKey}}}`
    localTemplate.value = localTemplate.value.slice(0, start) + text + localTemplate.value.slice(end)
    // 移动光标到插入内容之后
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(start + text.length, start + text.length)
    })
  } else {
    // 如果无法获取光标位置，追加到末尾
    localTemplate.value += `{{${varKey}}}`
  }
}

// 复制 Prompt
function copyPrompt() {
  if (localTemplate.value) {
    navigator.clipboard.writeText(localTemplate.value)
    ElMessage.success('已复制到剪贴板')
  } else {
    ElMessage.warning('暂无内容可复制')
  }
}

// 同步数据到父组件
function syncToParent() {
  emit('update:modelValue', {
    name: '',
    template: localTemplate.value,
    negative_prompt: '',
    segments: null,
    model_config: null
  })
}

// 从父组件同步数据
function syncFromParent() {
  if (props.modelValue) {
    // 优先使用 template_content，其次 template
    localTemplate.value = props.modelValue.template_content || props.modelValue.template || ''
  }
}

// 防止循环更新的标志
let isUpdatingFromParent = false

// 监听本地数据变化
watch(localTemplate, () => {
  if (!isUpdatingFromParent) {
    syncToParent()
  }
})

// 监听父组件数据变化
watch(() => props.modelValue, (newVal, oldVal) => {
  const newTemplate = newVal?.template_content || newVal?.template || ''
  const oldTemplate = oldVal?.template_content || oldVal?.template || ''
  if (newTemplate !== oldTemplate) {
    isUpdatingFromParent = true
    syncFromParent()
    setTimeout(() => {
      isUpdatingFromParent = false
    }, 0)
  }
}, { deep: true })

onMounted(() => {
  syncFromParent()
})
</script>

<style scoped>
.prompt-template-editor {
  padding: 5px 0;
}

.editor-layout {
  display: flex;
  gap: 16px;
}

.editor-left {
  flex: 1;
  min-width: 0;
}

.editor-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

/* 变量按钮区域 */
.variable-section {
  margin-top: 10px;
  padding: 8px 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.section-label {
  font-size: 12px;
  color: #606266;
}

.variable-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.var-btn {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #E8B686;
  padding: 4px 10px;
}

.var-btn:hover {
  border-color: #E8B686;
  background: #fff9f0;
}

/* 参数选择器 */
.preview-selectors {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px;
  background: #fafafa;
  border: 1px solid #ebeef5;
  border-radius: 4px 4px 0 0;
  border-bottom: none;
}

.selector-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.selector-label {
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
}

/* 预览结果 */
.preview-result {
  flex: 1;
  padding: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 0 0 4px 4px;
  min-height: 300px;
  max-height: 400px;
  overflow-y: auto;
}

.preview-selectors + .preview-result {
  border-radius: 0 0 4px 4px;
}

.preview-selectors:empty + .preview-result {
  border-radius: 4px;
}

.part-text {
  color: #303133;
}

.part-variable {
  background: #fff3e0;
  color: #E8B686;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 500;
}

.part-replaced {
  background: #e8f5e9;
  color: #4caf50;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 500;
}

.part-empty {
  color: #c0c4cc;
  font-style: italic;
}
</style>
