<template>
  <div class="ai-agent-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-left">
        <h2>AI 智能生成</h2>
        <span class="subtitle">使用 AI Agent 自动生成场景配置</span>
      </div>
    </div>

    <!-- 主要内容区 -->
    <div class="main-content">
      <!-- 左侧：输入区 -->
      <div class="input-section">
        <el-card class="input-card">
          <template #header>
            <div class="card-header">
              <span>场景描述</span>
              <el-tag type="info" size="small">AI 将根据描述自动生成配置</el-tag>
            </div>
          </template>

          <el-form :model="form" label-position="top">
            <el-form-item label="描述你想要的场景">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="6"
                placeholder="例如：春节拜年场景，用户可以选择不同的祝福语和喜庆背景，生成带有新年氛围的照片"
                maxlength="500"
                show-word-limit
              />
            </el-form-item>

            <el-form-item label="生成选项">
              <el-checkbox v-model="form.generateImages">自动生成封面图和参考图</el-checkbox>
            </el-form-item>

            <el-form-item>
              <el-button
                type="primary"
                size="large"
                :loading="generating"
                :disabled="!form.description.trim()"
                @click="startGenerate"
                style="width: 100%"
              >
                <el-icon v-if="!generating"><MagicStick /></el-icon>
                {{ generating ? '生成中...' : '开始生成' }}
              </el-button>
            </el-form-item>
          </el-form>

          <!-- 生成进度 -->
          <div v-if="taskStatus" class="progress-section">
            <el-divider>生成进度</el-divider>
            <el-steps :active="currentStepIndex" finish-status="success" simple>
              <el-step title="知识检索" />
              <el-step title="规划" />
              <el-step title="配置生成" />
              <el-step title="审核" />
              <el-step title="完成" />
            </el-steps>
            <div class="progress-info">
              <el-progress :percentage="taskStatus.progress" :status="progressStatus" />
              <span class="step-text">{{ stepText }}</span>
            </div>
          </div>
        </el-card>

        <!-- 示例描述 -->
        <el-card class="examples-card">
          <template #header>
            <span>示例描述</span>
          </template>
          <div class="example-list">
            <div
              v-for="example in examples"
              :key="example.title"
              class="example-item"
              @click="useExample(example)"
            >
              <div class="example-title">{{ example.title }}</div>
              <div class="example-desc">{{ example.description }}</div>
            </div>
          </div>
        </el-card>
      </div>

      <!-- 右侧：结果预览 -->
      <div class="result-section">
        <el-card class="result-card" v-if="result">
          <template #header>
            <div class="card-header">
              <span>生成结果</span>
              <div class="header-actions">
                <el-tag :type="result.review?.passed ? 'success' : 'warning'" size="small">
                  审核得分: {{ result.review?.score || 0 }}
                </el-tag>
                <el-button type="primary" size="small" @click="applyConfig">
                  应用配置
                </el-button>
              </div>
            </div>
          </template>

          <!-- 场景信息 -->
          <div class="result-info">
            <h3>{{ result.config?.scene?.name || '未命名场景' }}</h3>
            <p>{{ result.config?.scene?.description }}</p>
            <el-tag size="small">{{ result.config?.scene?.points_cost || 50 }} 醒币</el-tag>
          </div>

          <!-- 步骤预览 -->
          <div class="steps-preview">
            <h4>步骤配置 ({{ result.config?.steps?.length || 0 }} 步)</h4>
            <el-timeline>
              <el-timeline-item
                v-for="(step, index) in result.config?.steps"
                :key="index"
                :type="index === 0 ? 'primary' : ''"
              >
                <div class="step-item">
                  <div class="step-title">
                    {{ step.title }}
                    <el-tag size="small" type="info">{{ step.component_type }}</el-tag>
                  </div>
                  <div class="step-options" v-if="step.options?.length">
                    <el-tag
                      v-for="opt in step.options.slice(0, 5)"
                      :key="opt.value"
                      size="small"
                      type="info"
                      effect="plain"
                    >
                      {{ opt.label }}
                    </el-tag>
                    <el-tag v-if="step.options.length > 5" size="small" type="info">
                      +{{ step.options.length - 5 }}
                    </el-tag>
                  </div>
                </div>
              </el-timeline-item>
            </el-timeline>
          </div>

          <!-- Prompt 预览 -->
          <div class="prompt-preview">
            <h4>Prompt 模板</h4>
            <el-input
              type="textarea"
              :rows="4"
              :model-value="result.config?.prompt_template?.template"
              readonly
            />
          </div>

          <!-- 图片预览 -->
          <div class="images-preview" v-if="result.images">
            <h4>生成的图片</h4>
            <div class="image-grid">
              <div class="image-item" v-if="result.images.cover_image">
                <el-image
                  :src="'data:' + result.images.cover_image.mimeType + ';base64,' + result.images.cover_image.imageData"
                  fit="cover"
                />
                <span>封面图</span>
              </div>
              <div class="image-item" v-if="result.images.reference_image">
                <el-image
                  :src="'data:' + result.images.reference_image.mimeType + ';base64,' + result.images.reference_image.imageData"
                  fit="cover"
                />
                <span>参考图</span>
              </div>
            </div>
          </div>

          <!-- 执行信息 -->
          <div class="execution-info">
            <el-descriptions :column="3" size="small" border>
              <el-descriptions-item label="任务ID">{{ result.task_id }}</el-descriptions-item>
              <el-descriptions-item label="迭代次数">{{ result.iterations }}</el-descriptions-item>
              <el-descriptions-item label="耗时">{{ (result.duration / 1000).toFixed(1) }}s</el-descriptions-item>
            </el-descriptions>
          </div>
        </el-card>

        <!-- 空状态 -->
        <el-empty v-else description="输入场景描述，点击生成按钮开始" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick } from '@element-plus/icons-vue'
import api from '@/api'

// 表单数据
const form = ref({
  description: '',
  generateImages: false
})

// 状态
const generating = ref(false)
const taskStatus = ref(null)
const result = ref(null)
let pollTimer = null

// 示例描述
const examples = [
  {
    title: '春节拜年',
    description: '春节拜年场景，用户可以选择不同的祝福语和喜庆背景，生成带有新年氛围的照片'
  },
  {
    title: '职业证件照',
    description: '职业证件照场景，用户可以选择不同的背景颜色、服装风格，生成专业的证件照'
  },
  {
    title: '情人节',
    description: '情人节主题场景，用户可以选择浪漫的背景和装饰，生成甜蜜的情侣照片'
  },
  {
    title: '毕业照',
    description: '毕业照场景，用户可以选择学士服颜色和校园背景，生成纪念性的毕业照片'
  }
]

// 计算属性
const currentStepIndex = computed(() => {
  if (!taskStatus.value) return 0
  const step = taskStatus.value.current_step
  if (step === 'knowledge_retrieval') return 0
  if (step === 'planning') return 1
  if (step === 'config_generation') return 2
  if (step?.startsWith('review') || step?.startsWith('optimization')) return 3
  if (step === 'done') return 4
  return 0
})

const progressStatus = computed(() => {
  if (!taskStatus.value) return ''
  if (taskStatus.value.status === 'completed') return 'success'
  if (taskStatus.value.status === 'failed') return 'exception'
  return ''
})

const stepText = computed(() => {
  if (!taskStatus.value) return ''
  const stepMap = {
    'init': '初始化...',
    'knowledge_retrieval': '正在检索知识库...',
    'planning': '正在规划场景...',
    'config_generation': '正在生成配置...',
    'review_iteration_1': '正在审核配置...',
    'review_iteration_2': '正在优化配置...',
    'review_iteration_3': '正在最终审核...',
    'optimization_1': '正在优化配置...',
    'optimization_2': '正在再次优化...',
    'image_generation': '正在生成图片...',
    'done': '生成完成!'
  }
  return stepMap[taskStatus.value.current_step] || taskStatus.value.current_step
})

// 方法
const useExample = (example) => {
  form.value.description = example.description
}

const startGenerate = async () => {
  if (!form.value.description.trim()) {
    ElMessage.warning('请输入场景描述')
    return
  }

  generating.value = true
  taskStatus.value = null
  result.value = null

  try {
    // 发起异步生成请求
    const res = await api.post('/admin/ai-agent/generate', {
      description: form.value.description,
      options: {
        async: true,
        generateImages: form.value.generateImages
      }
    })

    if (res.code === 200) {
      const taskId = res.data.task_id
      ElMessage.success('任务已创建，正在生成中...')

      // 开始轮询状态
      pollTaskStatus(taskId)
    } else {
      throw new Error(res.message || '创建任务失败')
    }
  } catch (error) {
    ElMessage.error(error.message || '生成失败')
    generating.value = false
  }
}

const pollTaskStatus = (taskId) => {
  if (pollTimer) {
    clearInterval(pollTimer)
  }

  const poll = async () => {
    try {
      const res = await api.get(`/admin/ai-agent/status/${taskId}`)

      if (res.code === 200) {
        taskStatus.value = res.data

        if (res.data.status === 'completed') {
          clearInterval(pollTimer)
          generating.value = false
          result.value = {
            task_id: res.data.id,
            config: res.data.config_result,
            images: res.data.images_result,
            review: { score: res.data.review_score, passed: res.data.review_score >= 70 },
            iterations: res.data.iterations,
            duration: new Date(res.data.completed_at) - new Date(res.data.created_at)
          }
          ElMessage.success('生成完成!')
        } else if (res.data.status === 'failed') {
          clearInterval(pollTimer)
          generating.value = false
          ElMessage.error(res.data.error_message || '生成失败')
        }
      }
    } catch (error) {
      console.error('轮询状态失败:', error)
    }
  }

  // 立即执行一次
  poll()

  // 每 2 秒轮询一次
  pollTimer = setInterval(poll, 2000)
}

const applyConfig = async () => {
  if (!result.value?.config) {
    ElMessage.warning('没有可应用的配置')
    return
  }

  try {
    await ElMessageBox.confirm(
      '确定要将此配置应用到场景管理吗？这将创建一个新的场景。',
      '应用配置',
      { type: 'info' }
    )

    // TODO: 调用创建场景的 API
    ElMessage.info('功能开发中，请手动复制配置到场景管理')

    // 复制配置到剪贴板
    const configText = JSON.stringify(result.value.config, null, 2)
    await navigator.clipboard.writeText(configText)
    ElMessage.success('配置已复制到剪贴板')

  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '操作失败')
    }
  }
}

// 清理
import { onUnmounted } from 'vue'
onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
  }
})
</script>

<style scoped>
.ai-agent-page {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
}

.page-header .subtitle {
  color: #909399;
  font-size: 14px;
}

.main-content {
  display: flex;
  gap: 20px;
}

.input-section {
  width: 400px;
  flex-shrink: 0;
}

.result-section {
  flex: 1;
  min-width: 0;
}

.input-card,
.examples-card,
.result-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

/* 进度区域 */
.progress-section {
  margin-top: 20px;
}

.progress-info {
  margin-top: 15px;
  text-align: center;
}

.step-text {
  display: block;
  margin-top: 10px;
  color: #909399;
  font-size: 13px;
}

/* 示例列表 */
.example-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.example-item {
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.example-item:hover {
  border-color: #409eff;
  background: #f5f7fa;
}

.example-title {
  font-weight: 500;
  margin-bottom: 5px;
}

.example-desc {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

/* 结果区域 */
.result-info {
  margin-bottom: 20px;
}

.result-info h3 {
  margin: 0 0 10px 0;
}

.result-info p {
  color: #606266;
  margin: 0 0 10px 0;
}

.steps-preview {
  margin-bottom: 20px;
}

.steps-preview h4,
.prompt-preview h4,
.images-preview h4 {
  margin: 0 0 15px 0;
  font-size: 14px;
  color: #303133;
}

.step-item {
  padding: 5px 0;
}

.step-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.step-options {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.prompt-preview {
  margin-bottom: 20px;
}

.images-preview {
  margin-bottom: 20px;
}

.image-grid {
  display: flex;
  gap: 15px;
}

.image-item {
  text-align: center;
}

.image-item .el-image {
  width: 150px;
  height: 200px;
  border-radius: 8px;
  overflow: hidden;
}

.image-item span {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.execution-info {
  margin-top: 20px;
}

/* 响应式 */
@media (max-width: 1200px) {
  .main-content {
    flex-direction: column;
  }

  .input-section {
    width: 100%;
  }
}
</style>
