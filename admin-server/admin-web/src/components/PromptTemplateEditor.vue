<template>
  <div class="prompt-template-editor">
    <!-- 基本信息 -->
    <el-form label-width="100px">
      <el-form-item label="模板名称">
        <el-input v-model="localForm.name" placeholder="如: 新春头像模板" />
      </el-form-item>

      <el-form-item label="预设模板">
        <el-select v-model="presetType" placeholder="选择预设分段" @change="applyPreset" style="width: 200px">
          <el-option label="自定义" value="custom" />
          <el-option label="新春头像" value="spring_avatar" />
          <el-option label="证件照" value="idphoto" />
          <el-option label="艺术照" value="portrait" />
        </el-select>
        <span class="preset-tip">选择预设会重置分段配置</span>
      </el-form-item>
    </el-form>

    <!-- 分段配置 -->
    <div class="segments-section">
      <div class="section-header">
        <span class="section-title">分段配置</span>
        <el-button type="primary" size="small" @click="addSegment">
          <el-icon><Plus /></el-icon>
          添加分段
        </el-button>
      </div>

      <!-- 分段 Tab -->
      <el-tabs v-model="activeSegment" type="card" closable @tab-remove="removeSegment">
        <el-tab-pane
          v-for="(segment, index) in segments"
          :key="segment.key"
          :label="segment.name"
          :name="segment.key"
        >
          <div class="segment-editor">
            <div class="segment-header">
              <el-input
                v-model="segment.name"
                placeholder="分段名称"
                size="small"
                style="width: 150px"
              />
              <el-input
                v-model="segment.key"
                placeholder="分段标识"
                size="small"
                style="width: 120px"
                :disabled="isBuiltinSegment(segment.key)"
              />
            </div>
            <el-input
              v-model="segment.content"
              type="textarea"
              :rows="4"
              placeholder="输入该分段的 Prompt 内容，可使用变量如 {{gender}}"
            />
            <div class="variable-inserter">
              <span class="inserter-label">插入变量:</span>
              <el-tag
                v-for="v in availableVariables"
                :key="v.key"
                size="small"
                class="var-tag"
                @click="insertVariable(segment, v.key)"
              >
                {{ v.label }}
              </el-tag>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <el-empty v-if="segments.length === 0" description="暂无分段，点击上方按钮添加" :image-size="60" />
    </div>

    <!-- 模型参数 -->
    <el-collapse v-model="expandedSections">
      <el-collapse-item title="模型参数" name="model_config">
        <el-form label-width="100px" size="small">
          <el-form-item label="图片尺寸">
            <el-select v-model="modelConfig.aspect_ratio" style="width: 150px">
              <el-option label="1:1 (正方形)" value="1:1" />
              <el-option label="3:4 (竖版)" value="3:4" />
              <el-option label="4:3 (横版)" value="4:3" />
              <el-option label="9:16 (手机竖屏)" value="9:16" />
              <el-option label="16:9 (手机横屏)" value="16:9" />
            </el-select>
          </el-form-item>
          <el-form-item label="风格强度">
            <el-slider v-model="modelConfig.style_strength" :min="0" :max="1" :step="0.1" show-input style="width: 300px" />
          </el-form-item>
          <el-form-item label="参考强度">
            <el-slider v-model="modelConfig.reference_strength" :min="0" :max="1" :step="0.1" show-input style="width: 300px" />
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item title="负面提示词" name="negative">
        <el-input
          v-model="localForm.negative_prompt"
          type="textarea"
          :rows="3"
          placeholder="模糊, 变形, 多人, 低质量..."
        />
      </el-collapse-item>

      <el-collapse-item title="预览" name="preview">
        <div class="preview-section">
          <div class="preview-header">
            <span>合并后的完整 Prompt</span>
            <el-button size="small" @click="copyPreview">复制</el-button>
          </div>
          <div class="preview-content">
            <span
              v-for="(part, index) in previewParts"
              :key="index"
              :class="{ 'var-highlight': part.isVariable }"
            >{{ part.text }}</span>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <!-- 添加分段对话框 -->
    <el-dialog v-model="addSegmentDialogVisible" title="添加分段" width="400px" append-to-body>
      <el-form :model="newSegment" label-width="80px">
        <el-form-item label="分段名称" required>
          <el-input v-model="newSegment.name" placeholder="如: 主体描述" />
        </el-form-item>
        <el-form-item label="分段标识" required>
          <el-input v-model="newSegment.key" placeholder="如: subject" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addSegmentDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmAddSegment">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

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

// 本地表单数据
const localForm = reactive({
  name: '',
  template: '',
  negative_prompt: ''
})

// 分段数据
const segments = ref([])
const activeSegment = ref('')

// 模型配置
const modelConfig = reactive({
  aspect_ratio: '3:4',
  style_strength: 0.8,
  reference_strength: 0.7
})

// 预设类型
const presetType = ref('custom')

// 展开的折叠面板
const expandedSections = ref(['preview'])

// 添加分段对话框
const addSegmentDialogVisible = ref(false)
const newSegment = reactive({
  name: '',
  key: ''
})

// 预设分段配置
const presets = {
  spring_avatar: [
    { key: 'subject', name: '主体描述', content: '' },
    { key: 'gender', name: '性别', content: '{{gender}}' },
    { key: 'phrase', name: '题词', content: '{{phrase}}' },
    { key: 'grade', name: '品级提示词', content: '{{grade_prompt}}' },
    { key: 'horse', name: '马的提示词', content: '{{horse}}' },
    { key: 'background', name: '背景颜色', content: '{{background}}' }
  ],
  idphoto: [
    { key: 'subject', name: '主体描述', content: '' },
    { key: 'background', name: '背景', content: '{{background}}' },
    { key: 'spec', name: '规格', content: '{{spec}}' },
    { key: 'clothing', name: '服装', content: '{{clothing}}' }
  ],
  portrait: [
    { key: 'subject', name: '主体描述', content: '' },
    { key: 'style', name: '风格', content: '{{style}}' },
    { key: 'background', name: '背景', content: '{{background}}' }
  ]
}

// 可用变量列表
const availableVariables = computed(() => {
  const vars = [
    { key: 'gender', label: '{{gender}} 性别' },
    { key: 'background', label: '{{background}} 背景' },
    { key: 'spec', label: '{{spec}} 规格' },
    { key: 'phrase', label: '{{phrase}} 题词' },
    { key: 'grade_prompt', label: '{{grade_prompt}} 品级' },
    { key: 'horse', label: '{{horse}} 马' },
    { key: 'style', label: '{{style}} 风格' },
    { key: 'clothing', label: '{{clothing}} 服装' }
  ]
  // 添加场景步骤中的变量
  props.sceneSteps.forEach(step => {
    if (step.step_key && !vars.find(v => v.key === step.step_key)) {
      vars.push({ key: step.step_key, label: `{{${step.step_key}}} ${step.title || step.step_key}` })
    }
  })
  return vars
})

// 内置分段标识
const builtinSegments = ['subject', 'gender', 'phrase', 'grade', 'horse', 'background', 'spec', 'style', 'clothing']

function isBuiltinSegment(key) {
  return builtinSegments.includes(key)
}

// 预览内容
const previewParts = computed(() => {
  const fullPrompt = segments.value.map(s => s.content).filter(c => c).join(', ')
  const parts = []
  const regex = /(\{\{[^}]+\}\})/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(fullPrompt)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: fullPrompt.slice(lastIndex, match.index), isVariable: false })
    }
    parts.push({ text: match[1], isVariable: true })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < fullPrompt.length) {
    parts.push({ text: fullPrompt.slice(lastIndex), isVariable: false })
  }

  return parts.length > 0 ? parts : [{ text: '(暂无内容)', isVariable: false }]
})

// 应用预设
function applyPreset(type) {
  if (type === 'custom') return
  if (presets[type]) {
    segments.value = JSON.parse(JSON.stringify(presets[type]))
    if (segments.value.length > 0) {
      activeSegment.value = segments.value[0].key
    }
    ElMessage.success('已应用预设分段')
  }
}

// 添加分段
function addSegment() {
  newSegment.name = ''
  newSegment.key = ''
  addSegmentDialogVisible.value = true
}

function confirmAddSegment() {
  if (!newSegment.name || !newSegment.key) {
    ElMessage.warning('请填写分段名称和标识')
    return
  }
  if (segments.value.find(s => s.key === newSegment.key)) {
    ElMessage.warning('分段标识已存在')
    return
  }
  segments.value.push({
    key: newSegment.key,
    name: newSegment.name,
    content: '',
    order: segments.value.length + 1
  })
  activeSegment.value = newSegment.key
  addSegmentDialogVisible.value = false
}

// 删除分段
function removeSegment(key) {
  const index = segments.value.findIndex(s => s.key === key)
  if (index > -1) {
    segments.value.splice(index, 1)
    if (activeSegment.value === key && segments.value.length > 0) {
      activeSegment.value = segments.value[0].key
    }
  }
}

// 插入变量
function insertVariable(segment, varKey) {
  segment.content += `{{${varKey}}}`
}

// 复制预览
function copyPreview() {
  const fullPrompt = segments.value.map(s => s.content).filter(c => c).join(', ')
  navigator.clipboard.writeText(fullPrompt)
  ElMessage.success('已复制到剪贴板')
}

// 同步数据到父组件
function syncToParent() {
  const fullTemplate = segments.value.map(s => s.content).filter(c => c).join(', ')
  emit('update:modelValue', {
    name: localForm.name,
    template: fullTemplate,
    negative_prompt: localForm.negative_prompt,
    segments: JSON.stringify(segments.value),
    model_config: JSON.stringify(modelConfig)
  })
}

// 从父组件同步数据
function syncFromParent() {
  if (props.modelValue) {
    localForm.name = props.modelValue.name || ''
    localForm.template = props.modelValue.template || ''
    localForm.negative_prompt = props.modelValue.negative_prompt || ''

    // 解析分段数据
    if (props.modelValue.segments) {
      try {
        segments.value = JSON.parse(props.modelValue.segments)
        if (segments.value.length > 0) {
          activeSegment.value = segments.value[0].key
        }
      } catch (e) {
        segments.value = []
      }
    } else if (props.modelValue.template) {
      // 如果没有分段数据但有模板内容，创建一个默认分段
      segments.value = [{ key: 'main', name: '主模板', content: props.modelValue.template, order: 1 }]
      activeSegment.value = 'main'
    }

    // 解析模型配置
    if (props.modelValue.model_config) {
      try {
        const config = JSON.parse(props.modelValue.model_config)
        Object.assign(modelConfig, config)
      } catch (e) {
        // 使用默认值
      }
    }
  }
}

// 监听本地数据变化
watch([localForm, segments, modelConfig], () => {
  syncToParent()
}, { deep: true })

// 监听父组件数据变化
watch(() => props.modelValue, () => {
  syncFromParent()
}, { deep: true })

onMounted(() => {
  syncFromParent()
})
</script>

<style scoped>
.prompt-template-editor {
  padding: 10px 0;
}

.segments-section {
  margin: 20px 0;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 15px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.segment-editor {
  padding: 10px 0;
}

.segment-header {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.variable-inserter {
  margin-top: 10px;
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
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}

.preset-tip {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}

.preview-section {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 15px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
  color: #606266;
}

.preview-content {
  font-family: monospace;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
  white-space: pre-wrap;
}

.var-highlight {
  background: #e6f7ff;
  color: #1890ff;
  padding: 1px 4px;
  border-radius: 3px;
}

:deep(.el-collapse-item__header) {
  font-weight: 500;
}

:deep(.el-tabs__item.is-closable) {
  padding-right: 20px;
}
</style>
