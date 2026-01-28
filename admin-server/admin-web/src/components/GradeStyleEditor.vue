<template>
  <div class="grade-style-editor">
    <div class="editor-layout">
      <!-- 左侧配置区 -->
      <div class="config-panel">
        <el-tabs v-model="activeTab">
          <!-- 背景配置 -->
          <el-tab-pane label="背景" name="background">
            <div class="config-section">
              <div class="config-item">
                <span class="config-label">背景类型</span>
                <el-radio-group v-model="config.card.background.type" size="small">
                  <el-radio-button label="solid">纯色</el-radio-button>
                  <el-radio-button label="gradient">渐变</el-radio-button>
                </el-radio-group>
              </div>

              <template v-if="config.card.background.type === 'solid'">
                <div class="config-item">
                  <span class="config-label">背景颜色</span>
                  <el-color-picker v-model="config.card.background.color" show-alpha />
                </div>
              </template>

              <template v-else>
                <div class="config-item">
                  <span class="config-label">渐变颜色</span>
                  <div class="gradient-colors">
                    <el-color-picker v-model="config.card.background.colors[0]" show-alpha />
                    <span class="arrow">→</span>
                    <el-color-picker v-model="config.card.background.colors[1]" show-alpha />
                  </div>
                </div>
                <div class="config-item">
                  <span class="config-label">渐变方向</span>
                  <el-select v-model="config.card.background.direction" size="small" style="width: 120px">
                    <el-option label="↘ 135°" value="135deg" />
                    <el-option label="→ 90°" value="90deg" />
                    <el-option label="↓ 180°" value="180deg" />
                    <el-option label="↗ 45°" value="45deg" />
                    <el-option label="← 270°" value="270deg" />
                  </el-select>
                </div>
              </template>
            </div>
          </el-tab-pane>

          <!-- 文字配置 -->
          <el-tab-pane label="文字" name="text">
            <div class="config-section">
              <div class="config-item">
                <span class="config-label">文字颜色</span>
                <el-color-picker v-model="config.text.primary.color" />
              </div>
              <div class="config-item">
                <span class="config-label">字号</span>
                <el-slider v-model="fontSizeValue" :min="24" :max="80" :step="2" show-input size="small" />
              </div>
              <div class="config-item">
                <span class="config-label">字重</span>
                <el-select v-model="config.text.primary.fontWeight" size="small" style="width: 120px">
                  <el-option label="正常" value="normal" />
                  <el-option label="中等" value="500" />
                  <el-option label="粗体" value="bold" />
                  <el-option label="特粗" value="800" />
                </el-select>
              </div>
              <div class="config-item">
                <span class="config-label">字间距</span>
                <el-slider v-model="letterSpacingValue" :min="0" :max="20" :step="1" show-input size="small" />
              </div>
            </div>
          </el-tab-pane>

          <!-- 边框配置 -->
          <el-tab-pane label="边框" name="border">
            <div class="config-section">
              <div class="config-item">
                <span class="config-label">边框宽度</span>
                <el-slider v-model="borderWidthValue" :min="0" :max="10" :step="1" show-input size="small" />
              </div>
              <div class="config-item">
                <span class="config-label">边框颜色</span>
                <el-color-picker v-model="config.card.border.color" show-alpha />
              </div>
              <div class="config-item">
                <span class="config-label">边框样式</span>
                <el-select v-model="config.card.border.style" size="small" style="width: 120px">
                  <el-option label="实线" value="solid" />
                  <el-option label="虚线" value="dashed" />
                  <el-option label="点线" value="dotted" />
                  <el-option label="双线" value="double" />
                </el-select>
              </div>
              <div class="config-item">
                <span class="config-label">圆角</span>
                <el-slider v-model="borderRadiusValue" :min="0" :max="30" :step="2" show-input size="small" />
              </div>
            </div>
          </el-tab-pane>

          <!-- 阴影配置 -->
          <el-tab-pane label="阴影" name="shadow">
            <div class="config-section">
              <div class="config-item">
                <span class="config-label">启用阴影</span>
                <el-switch v-model="shadowEnabled" />
              </div>
              <template v-if="shadowEnabled">
                <div class="config-item">
                  <span class="config-label">阴影颜色</span>
                  <el-color-picker v-model="config.card.shadow.color" show-alpha />
                </div>
                <div class="config-item">
                  <span class="config-label">模糊半径</span>
                  <el-slider v-model="shadowBlurValue" :min="0" :max="50" :step="2" show-input size="small" />
                </div>
                <div class="config-item">
                  <span class="config-label">Y偏移</span>
                  <el-slider v-model="shadowYValue" :min="0" :max="20" :step="1" show-input size="small" />
                </div>
              </template>
            </div>
          </el-tab-pane>

          <!-- 动画配置 -->
          <el-tab-pane label="动画" name="animation">
            <div class="config-section">
              <div class="config-item">
                <span class="config-label">动画效果</span>
                <el-select v-model="config.animation.type" size="small" style="width: 150px">
                  <el-option label="无" value="none" />
                  <el-option label="闪烁" value="shimmer" />
                  <el-option label="发光" value="glow" />
                  <el-option label="脉冲" value="pulse" />
                </el-select>
              </div>
              <div class="config-item" v-if="config.animation.type !== 'none'">
                <span class="config-label">动画时长</span>
                <el-select v-model="config.animation.duration" size="small" style="width: 120px">
                  <el-option label="快速 (1s)" value="1s" />
                  <el-option label="正常 (2s)" value="2s" />
                  <el-option label="慢速 (3s)" value="3s" />
                </el-select>
              </div>
            </div>
          </el-tab-pane>

          <!-- 徽章配置 -->
          <el-tab-pane label="徽章" name="badge">
            <div class="config-section">
              <div class="config-item">
                <span class="config-label">徽章背景</span>
                <el-color-picker v-model="badgeBgColor" />
              </div>
              <div class="config-item">
                <span class="config-label">徽章文字</span>
                <el-color-picker v-model="config.badge.textColor" />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>

        <!-- 预设样式 -->
        <div class="presets-section">
          <div class="presets-header">快速预设</div>
          <div class="presets-list">
            <div
              v-for="preset in presets"
              :key="preset.name"
              class="preset-item"
              :style="getPresetStyle(preset)"
              @click="applyPreset(preset)"
            >
              {{ preset.label }}
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧预览区 -->
      <div class="preview-panel">
        <div class="preview-header">实时预览</div>
        <div class="preview-container">
          <div class="preview-card" :style="previewCardStyle" :class="animationClass">
            <div class="preview-badge" :style="previewBadgeStyle">{{ grade.name }}</div>
            <div class="preview-text" :style="previewTextStyle">{{ previewText }}</div>
            <div class="preview-subtext">{{ grade.name_en || 'English Name' }}</div>
          </div>
        </div>
        <div class="preview-tip">
          预览效果仅供参考，实际效果以小程序端为准
        </div>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="editor-footer">
      <el-button @click="$emit('cancel')">取消</el-button>
      <el-button @click="resetConfig">重置</el-button>
      <el-button type="primary" @click="saveConfig">保存样式</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'

const props = defineProps({
  grade: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['save', 'cancel'])

const activeTab = ref('background')
const previewText = ref('马到成功')

// 配置对象
const config = reactive({
  card: {
    background: {
      type: 'gradient',
      color: '#409eff',
      colors: ['#FFD700', '#FFA500'],
      direction: '135deg'
    },
    border: {
      width: '2rpx',
      style: 'solid',
      color: '#B8860B',
      radius: '16rpx'
    },
    shadow: {
      x: '0',
      y: '8rpx',
      blur: '30rpx',
      color: 'rgba(255, 215, 0, 0.3)'
    }
  },
  text: {
    primary: {
      color: '#C41E3A',
      fontSize: '56rpx',
      fontWeight: 'bold',
      letterSpacing: '8rpx'
    }
  },
  badge: {
    background: { type: 'solid', color: '#C41E3A' },
    textColor: '#FFD700'
  },
  animation: {
    type: 'none',
    duration: '2s'
  }
})

// 数值转换
const fontSizeValue = computed({
  get: () => parseInt(config.text.primary.fontSize) || 56,
  set: (val) => { config.text.primary.fontSize = val + 'rpx' }
})

const letterSpacingValue = computed({
  get: () => parseInt(config.text.primary.letterSpacing) || 8,
  set: (val) => { config.text.primary.letterSpacing = val + 'rpx' }
})

const borderWidthValue = computed({
  get: () => parseInt(config.card.border.width) || 2,
  set: (val) => { config.card.border.width = val + 'rpx' }
})

const borderRadiusValue = computed({
  get: () => parseInt(config.card.border.radius) || 16,
  set: (val) => { config.card.border.radius = val + 'rpx' }
})

const shadowBlurValue = computed({
  get: () => parseInt(config.card.shadow.blur) || 30,
  set: (val) => { config.card.shadow.blur = val + 'rpx' }
})

const shadowYValue = computed({
  get: () => parseInt(config.card.shadow.y) || 8,
  set: (val) => { config.card.shadow.y = val + 'rpx' }
})

const shadowEnabled = computed({
  get: () => config.card.shadow.blur !== '0rpx',
  set: (val) => {
    if (!val) {
      config.card.shadow.blur = '0rpx'
      config.card.shadow.y = '0rpx'
    } else {
      config.card.shadow.blur = '30rpx'
      config.card.shadow.y = '8rpx'
    }
  }
})

const badgeBgColor = computed({
  get: () => config.badge.background.color || '#C41E3A',
  set: (val) => { config.badge.background.color = val }
})

// 预览样式
const previewCardStyle = computed(() => {
  const style = {}

  // 背景
  if (config.card.background.type === 'gradient') {
    style.background = `linear-gradient(${config.card.background.direction}, ${config.card.background.colors.join(', ')})`
  } else {
    style.background = config.card.background.color
  }

  // 边框
  const bw = parseInt(config.card.border.width) || 0
  style.border = `${bw}px ${config.card.border.style} ${config.card.border.color}`
  style.borderRadius = (parseInt(config.card.border.radius) || 0) + 'px'

  // 阴影
  if (shadowEnabled.value) {
    const sy = parseInt(config.card.shadow.y) || 0
    const sb = parseInt(config.card.shadow.blur) || 0
    style.boxShadow = `0 ${sy}px ${sb}px ${config.card.shadow.color}`
  }

  return style
})

const previewTextStyle = computed(() => ({
  color: config.text.primary.color,
  fontSize: (parseInt(config.text.primary.fontSize) || 56) / 2 + 'px',
  fontWeight: config.text.primary.fontWeight,
  letterSpacing: (parseInt(config.text.primary.letterSpacing) || 0) / 2 + 'px'
}))

const previewBadgeStyle = computed(() => ({
  background: config.badge.background.color,
  color: config.badge.textColor
}))

const animationClass = computed(() => {
  if (config.animation.type === 'none') return ''
  return `animation-${config.animation.type}`
})

// 预设样式
const presets = [
  {
    name: 'gold-red',
    label: '金底红字',
    config: {
      card: {
        background: { type: 'gradient', colors: ['#FFD700', '#FFA500'], direction: '135deg' },
        border: { width: '4rpx', style: 'solid', color: '#B8860B', radius: '16rpx' },
        shadow: { x: '0', y: '8rpx', blur: '40rpx', color: 'rgba(255, 215, 0, 0.5)' }
      },
      text: { primary: { color: '#C41E3A', fontSize: '64rpx', fontWeight: 'bold', letterSpacing: '12rpx' } },
      badge: { background: { type: 'solid', color: '#C41E3A' }, textColor: '#FFD700' },
      animation: { type: 'shimmer', duration: '3s' }
    }
  },
  {
    name: 'red-gold',
    label: '红底金字',
    config: {
      card: {
        background: { type: 'gradient', colors: ['#DC143C', '#8B0000'], direction: '135deg' },
        border: { width: '3rpx', style: 'solid', color: '#FFD700', radius: '16rpx' },
        shadow: { x: '0', y: '6rpx', blur: '30rpx', color: 'rgba(220, 20, 60, 0.4)' }
      },
      text: { primary: { color: '#FFD700', fontSize: '56rpx', fontWeight: 'bold', letterSpacing: '10rpx' } },
      badge: { background: { type: 'solid', color: '#FFD700' }, textColor: '#8B0000' },
      animation: { type: 'pulse', duration: '2s' }
    }
  },
  {
    name: 'light-red',
    label: '浅红白字',
    config: {
      card: {
        background: { type: 'gradient', colors: ['#FF6B6B', '#EE5A5A'], direction: '135deg' },
        border: { width: '2rpx', style: 'solid', color: '#FFFFFF', radius: '16rpx' },
        shadow: { x: '0', y: '4rpx', blur: '20rpx', color: 'rgba(255, 107, 107, 0.3)' }
      },
      text: { primary: { color: '#FFFFFF', fontSize: '52rpx', fontWeight: 'bold', letterSpacing: '8rpx' } },
      badge: { background: { type: 'solid', color: '#FFFFFF' }, textColor: '#FF6B6B' },
      animation: { type: 'none', duration: '2s' }
    }
  },
  {
    name: 'pink',
    label: '粉色调',
    config: {
      card: {
        background: { type: 'gradient', colors: ['#FFB6C1', '#FF69B4'], direction: '135deg' },
        border: { width: '2rpx', style: 'solid', color: '#FFFFFF', radius: '16rpx' },
        shadow: { x: '0', y: '4rpx', blur: '15rpx', color: 'rgba(255, 182, 193, 0.3)' }
      },
      text: { primary: { color: '#8B0000', fontSize: '48rpx', fontWeight: 'bold', letterSpacing: '6rpx' } },
      badge: { background: { type: 'solid', color: '#8B0000' }, textColor: '#FFB6C1' },
      animation: { type: 'none', duration: '2s' }
    }
  },
  {
    name: 'dark',
    label: '灰黑色',
    config: {
      card: {
        background: { type: 'gradient', colors: ['#4A4A4A', '#2C2C2C'], direction: '135deg' },
        border: { width: '2rpx', style: 'solid', color: '#666666', radius: '16rpx' },
        shadow: { x: '0', y: '4rpx', blur: '15rpx', color: 'rgba(0, 0, 0, 0.3)' }
      },
      text: { primary: { color: '#AAAAAA', fontSize: '48rpx', fontWeight: 'normal', letterSpacing: '6rpx' } },
      badge: { background: { type: 'solid', color: '#666666' }, textColor: '#CCCCCC' },
      animation: { type: 'none', duration: '2s' }
    }
  }
]

// 获取预设样式
const getPresetStyle = (preset) => {
  const bg = preset.config.card.background
  if (bg.type === 'gradient') {
    return { background: `linear-gradient(${bg.direction}, ${bg.colors.join(', ')})` }
  }
  return { background: bg.color }
}

// 应用预设
const applyPreset = (preset) => {
  Object.assign(config.card, JSON.parse(JSON.stringify(preset.config.card)))
  Object.assign(config.text, JSON.parse(JSON.stringify(preset.config.text)))
  Object.assign(config.badge, JSON.parse(JSON.stringify(preset.config.badge)))
  Object.assign(config.animation, JSON.parse(JSON.stringify(preset.config.animation)))
}

// 重置配置
const resetConfig = () => {
  initFromGrade()
}

// 保存配置
const saveConfig = () => {
  emit('save', JSON.parse(JSON.stringify(config)))
}

// 从 grade 初始化配置
const initFromGrade = () => {
  const styleConfig = props.grade.styleConfig || props.grade.style_config
  if (styleConfig) {
    const parsed = typeof styleConfig === 'string' ? JSON.parse(styleConfig) : styleConfig
    if (parsed.card) Object.assign(config.card, parsed.card)
    if (parsed.text) Object.assign(config.text, parsed.text)
    if (parsed.badge) Object.assign(config.badge, parsed.badge)
    if (parsed.animation) Object.assign(config.animation, parsed.animation)
  } else {
    // 使用默认颜色
    config.card.background.colors[0] = props.grade.color || '#409eff'
    config.card.background.colors[1] = props.grade.color || '#409eff'
  }
}

onMounted(() => {
  initFromGrade()
})

watch(() => props.grade, () => {
  initFromGrade()
}, { deep: true })
</script>

<style scoped>
.grade-style-editor {
  display: flex;
  flex-direction: column;
  height: 500px;
}

.editor-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.config-panel {
  width: 400px;
  padding: 15px;
  border-right: 1px solid #ebeef5;
  overflow-y: auto;
}

.preview-panel {
  flex: 1;
  padding: 20px;
  background: #f5f7fa;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.preview-header {
  font-weight: 500;
  color: #606266;
  margin-bottom: 20px;
}

.preview-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-card {
  width: 200px;
  padding: 30px 20px;
  text-align: center;
  position: relative;
}

.preview-badge {
  position: absolute;
  top: -10px;
  right: -10px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.preview-text {
  margin-bottom: 8px;
}

.preview-subtext {
  font-size: 12px;
  opacity: 0.7;
}

.preview-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 15px;
}

.config-section {
  padding: 10px 0;
}

.config-item {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.config-label {
  width: 80px;
  font-size: 13px;
  color: #606266;
  flex-shrink: 0;
}

.gradient-colors {
  display: flex;
  align-items: center;
  gap: 10px;
}

.arrow {
  color: #909399;
}

.presets-section {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #ebeef5;
}

.presets-header {
  font-size: 13px;
  color: #606266;
  margin-bottom: 10px;
}

.presets-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-item {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 12px;
  color: #fff;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.preset-item:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.editor-footer {
  padding: 15px 20px;
  border-top: 1px solid #ebeef5;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 动画效果 */
.animation-shimmer {
  animation: shimmer 3s ease-in-out infinite;
}

.animation-glow {
  animation: glow 2s ease-in-out infinite;
}

.animation-pulse {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes shimmer {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.2); }
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.4); }
  50% { box-shadow: 0 0 40px rgba(255, 215, 0, 0.8); }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}
</style>
