<template>
  <div class="prompt-template-editor">
    <!-- Prompt 模板内容 -->
    <div class="prompt-section">
      <div class="section-header">
        <span class="section-title">Prompt 模板</span>
        <el-button size="small" @click="copyPrompt">复制</el-button>
      </div>
      <el-input
        ref="textareaRef"
        v-model="localTemplate"
        type="textarea"
        :rows="12"
        placeholder="输入 Prompt 模板内容，点击下方变量按钮插入步骤参数..."
      />
      <!-- 可插入的变量 -->
      <div class="variable-inserter" v-if="availableVariables.length > 0">
        <span class="inserter-label">插入变量:</span>
        <el-tag
          v-for="v in availableVariables"
          :key="v.key"
          size="small"
          class="var-tag"
          @click="insertVariable(v.key)"
        >
          {{ v.label }}
        </el-tag>
      </div>
      <div class="variable-tip" v-else>
        <el-icon><InfoFilled /></el-icon>
        <span>请先在「步骤配置」中添加步骤，然后可在此插入对应变量</span>
      </div>
    </div>

    <!-- 预览（高亮显示变量） -->
    <div class="preview-section">
      <div class="preview-header">
        <span>预览</span>
      </div>
      <div class="preview-content">
        <span
          v-for="(part, index) in previewParts"
          :key="index"
          :class="{ 'var-highlight': part.isVariable }"
        >{{ part.text }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'

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
  }
})

const emit = defineEmits(['update:modelValue'])

const textareaRef = ref(null)
const localTemplate = ref('')

// 可用变量列表 - 只显示当前场景实际配置的步骤
const availableVariables = computed(() => {
  const vars = []
  props.sceneSteps.forEach(step => {
    if (step.step_key) {
      vars.push({
        key: step.step_key,
        label: `{{${step.step_key}}}`
      })
    }
  })
  return vars
})

// 预览内容（高亮变量）
const previewParts = computed(() => {
  if (!localTemplate.value) {
    return [{ text: '(暂无内容)', isVariable: false }]
  }

  const parts = []
  const regex = /(\{\{[^}]+\}\})/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(localTemplate.value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: localTemplate.value.slice(lastIndex, match.index), isVariable: false })
    }
    parts.push({ text: match[1], isVariable: true })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < localTemplate.value.length) {
    parts.push({ text: localTemplate.value.slice(lastIndex), isVariable: false })
  }

  return parts.length > 0 ? parts : [{ text: '(暂无内容)', isVariable: false }]
})

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
  padding: 10px 0;
}

.prompt-section {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.variable-inserter {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.inserter-label {
  font-size: 12px;
  color: #909399;
}

.var-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.var-tag:hover {
  background: #E8B686;
  color: #fff;
  border-color: #E8B686;
}

.variable-tip {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}

.preview-section {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 15px;
}

.preview-header {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 500;
  color: #606266;
}

.preview-content {
  font-family: monospace;
  font-size: 13px;
  line-height: 1.8;
  word-break: break-word;
  white-space: pre-wrap;
  color: #303133;
}

.var-highlight {
  background: #fff3e0;
  color: #E8B686;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}
</style>
