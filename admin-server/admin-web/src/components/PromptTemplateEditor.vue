<template>
  <div class="prompt-template-editor">
    <!-- 编辑区 -->
    <div class="editor-section">
      <div class="section-header">
        <span class="section-title">Prompt 模板</span>
        <el-button size="small" @click="copyPrompt">复制</el-button>
      </div>
      <el-input
        ref="textareaRef"
        v-model="localTemplate"
        type="textarea"
        :rows="12"
        placeholder="输入 Prompt 模板，点击下方变量按钮插入步骤参数...&#10;&#10;示例：Generate a portrait of a {{gender}} person wearing {{clothing}}, background is {{background}}"
      />
    </div>

    <!-- 变量按钮（带 Tooltip 显示选项的 prompt_text） -->
    <div class="variable-section">
      <span class="section-label">插入变量:</span>
      <div class="variable-buttons" v-if="sceneSteps.length > 0">
        <el-tooltip
          v-for="step in sceneSteps"
          :key="step.step_key"
          placement="top"
          :show-after="200"
          :disabled="!step.options || step.options.length === 0"
        >
          <template #content>
            <div class="options-tooltip" v-if="step.options && step.options.length > 0">
              <div class="tooltip-title">{{ step.title }} 的选项:</div>
              <div v-for="opt in step.options.slice(0, 6)" :key="opt.id || opt.option_key" class="tooltip-item">
                <span class="opt-label">{{ opt.label }}:</span>
                <span class="opt-prompt">{{ opt.prompt_text || '(未设置)' }}</span>
              </div>
              <div v-if="step.options.length > 6" class="tooltip-more">
                ...还有 {{ step.options.length - 6 }} 个选项
              </div>
            </div>
          </template>
          <el-button size="small" class="var-btn" @click="insertVariable(step.step_key)">
            <span class="var-name">{{ '{{' + step.step_key + '}}' }}</span>
            <span class="step-name">{{ step.title || step.step_key }}</span>
          </el-button>
        </el-tooltip>
      </div>
      <div v-else class="no-steps-tip">
        <el-icon><InfoFilled /></el-icon>
        <span>请先在「步骤配置」中添加步骤，然后可在此插入对应变量</span>
      </div>
    </div>

    <!-- 实时预览 -->
    <div class="preview-section">
      <div class="section-header">
        <span class="section-title">实时预览</span>
        <span class="preview-tip">选择选项查看替换效果</span>
      </div>

      <!-- 选项选择器 -->
      <div class="preview-selectors" v-if="stepsWithOptions.length > 0">
        <div v-for="step in stepsWithOptions" :key="step.step_key" class="selector-item">
          <span class="selector-label">{{ step.title }}:</span>
          <el-select
            v-model="previewSelections[step.step_key]"
            size="small"
            placeholder="选择"
            clearable
            style="width: 140px"
          >
            <el-option
              v-for="opt in step.options"
              :key="opt.id || opt.option_key"
              :label="opt.label"
              :value="opt.prompt_text || opt.label"
            />
          </el-select>
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
const previewSelections = ref({})

// 只显示有选项的步骤（用于预览选择器）
const stepsWithOptions = computed(() => {
  return props.sceneSteps.filter(step => step.options && step.options.length > 0)
})

// 预览结果（高亮变量和替换部分）
const previewParts = computed(() => {
  if (!localTemplate.value) {
    return [{ text: '(暂无内容，请在上方输入 Prompt 模板)', type: 'empty' }]
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
  padding: 10px 0;
}

.editor-section {
  margin-bottom: 16px;
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

.preview-tip {
  font-size: 12px;
  color: #909399;
}

/* 变量按钮区域 */
.variable-section {
  margin-bottom: 20px;
  padding: 12px;
  background: #fafafa;
  border-radius: 6px;
}

.section-label {
  font-size: 13px;
  color: #606266;
  margin-right: 12px;
}

.variable-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.var-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 14px;
  height: auto;
  border: 1px solid #dcdfe6;
  transition: all 0.2s;
}

.var-btn:hover {
  border-color: #E8B686;
  background: #fff9f0;
}

.var-name {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  color: #E8B686;
  font-weight: 500;
}

.step-name {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
}

.no-steps-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #909399;
  margin-top: 8px;
}

/* Tooltip 样式 */
.options-tooltip {
  max-width: 350px;
}

.tooltip-title {
  font-weight: 600;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.2);
  color: #fff;
}

.tooltip-item {
  margin: 6px 0;
  font-size: 12px;
  line-height: 1.5;
}

.opt-label {
  color: rgba(255,255,255,0.9);
  font-weight: 500;
}

.opt-prompt {
  color: #ffd591;
  margin-left: 6px;
  word-break: break-word;
}

.tooltip-more {
  margin-top: 8px;
  font-size: 11px;
  color: rgba(255,255,255,0.6);
}

/* 预览区域 */
.preview-section {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
}

.preview-section .section-header {
  padding: 10px 14px;
  background: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 0;
}

.preview-selectors {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 14px;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
}

.selector-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selector-label {
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
}

.preview-result {
  padding: 14px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 100px;
  background: #fff;
}

.part-text {
  color: #303133;
}

.part-variable {
  background: #fff3e0;
  color: #E8B686;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.part-replaced {
  background: #e8f5e9;
  color: #4caf50;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.part-empty {
  color: #c0c4cc;
  font-style: italic;
}
</style>
