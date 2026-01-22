<template>
  <div class="assets-management">
    <!-- 头部 -->
    <div class="page-header">
      <div class="header-left">
        <h2>素材管理</h2>
        <span class="subtitle">管理Banner、特色图、导航标题、TabBar、场景素材等UI素材</span>
      </div>
    </div>

    <!-- 素材分类Tab -->
    <el-tabs v-model="activeCategory" type="card" @tab-change="onCategoryChange">
      <!-- Banner管理 -->
      <el-tab-pane label="Banner轮播" name="banner">
        <div class="asset-section">
          <div class="section-header">
            <span class="section-title">首页轮播图</span>
            <el-radio-group v-model="bannerLang" size="small" @change="loadBanners">
              <el-radio-button label="zh-CN">简体中文</el-radio-button>
              <el-radio-button label="en">English</el-radio-button>
            </el-radio-group>
          </div>
          <div class="banner-list" v-loading="loading">
            <draggable v-model="banners" item-key="key" @end="onBannerReorder" class="banner-grid">
              <template #item="{ element, index }">
                <div class="banner-item">
                  <div class="banner-order">{{ index + 1 }}</div>
                  <el-image :src="element.url" fit="cover" class="banner-img" :preview-src-list="banners.map(b => b.url)" />
                  <div class="banner-actions">
                    <el-button size="small" type="danger" @click="deleteBanner(element, index)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                </div>
              </template>
            </draggable>
            <el-upload
              class="banner-upload"
              :action="uploadUrl"
              :headers="uploadHeaders"
              :data="{ category: 'banner', lang: bannerLang }"
              :show-file-list="false"
              :on-success="handleBannerUpload"
              :before-upload="beforeImageUpload"
              accept="image/*"
            >
              <div class="upload-placeholder">
                <el-icon><Plus /></el-icon>
                <span>上传Banner</span>
                <p>建议尺寸: 750×400px</p>
              </div>
            </el-upload>
          </div>
        </div>
      </el-tab-pane>

      <!-- 特色功能图 -->
      <el-tab-pane label="特色功能图" name="feature">
        <div class="asset-section">
          <div class="section-header">
            <span class="section-title">首页特色功能区图片</span>
          </div>
          <div class="feature-list">
            <div class="feature-item" v-for="lang in languages" :key="lang.value">
              <div class="feature-label">{{ lang.label }}</div>
              <div class="feature-upload-area">
                <el-upload
                  class="feature-uploader"
                  :action="uploadUrl"
                  :headers="uploadHeaders"
                  :data="{ category: 'feature', lang: lang.value }"
                  :show-file-list="false"
                  :on-success="(res) => handleFeatureUpload(res, lang.value)"
                  :before-upload="beforeImageUpload"
                  accept="image/*"
                >
                  <el-image
                    v-if="featureImages[lang.value]"
                    :src="featureImages[lang.value]"
                    fit="contain"
                    class="feature-preview"
                  />
                  <div v-else class="upload-placeholder small">
                    <el-icon><Plus /></el-icon>
                    <span>上传图片</span>
                  </div>
                </el-upload>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 标题图片 -->
      <el-tab-pane label="导航标题" name="title">
        <div class="asset-section">
          <div class="section-header">
            <span class="section-title">导航栏标题图片</span>
          </div>
          <div class="feature-list">
            <div class="feature-item" v-for="lang in languages" :key="lang.value">
              <div class="feature-label">{{ lang.label }}</div>
              <div class="feature-upload-area">
                <el-upload
                  class="title-uploader"
                  :action="uploadUrl"
                  :headers="uploadHeaders"
                  :data="{ category: 'title', lang: lang.value }"
                  :show-file-list="false"
                  :on-success="(res) => handleTitleUpload(res, lang.value)"
                  :before-upload="beforeImageUpload"
                  accept="image/*"
                >
                  <el-image
                    v-if="titleImages[lang.value]"
                    :src="titleImages[lang.value]"
                    fit="contain"
                    class="title-preview"
                  />
                  <div v-else class="upload-placeholder small">
                    <el-icon><Plus /></el-icon>
                    <span>上传图片</span>
                  </div>
                </el-upload>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- TabBar图标 -->
      <el-tab-pane label="TabBar图标" name="tabbar">
        <div class="asset-section">
          <div class="section-header">
            <span class="section-title">底部导航栏图标</span>
          </div>
          <div class="tabbar-list">
            <div class="tabbar-item" v-for="tab in tabbarIcons" :key="tab.name">
              <div class="tabbar-name">{{ tab.label }}</div>
              <div class="tabbar-icons">
                <div class="tabbar-icon-item">
                  <span class="icon-state">默认</span>
                  <el-upload
                    class="tabbar-uploader"
                    :action="uploadUrl"
                    :headers="uploadHeaders"
                    :data="{ category: 'tabbar', name: tab.name, state: 'normal' }"
                    :show-file-list="false"
                    :on-success="(res) => handleTabbarUpload(res, tab.name, 'normal')"
                    :before-upload="beforeImageUpload"
                    accept="image/*"
                  >
                    <el-image v-if="tab.normal" :src="tab.normal" fit="contain" class="tabbar-icon-preview" />
                    <div v-else class="icon-placeholder"><el-icon><Plus /></el-icon></div>
                  </el-upload>
                </div>
                <div class="tabbar-icon-item">
                  <span class="icon-state">选中</span>
                  <el-upload
                    class="tabbar-uploader"
                    :action="uploadUrl"
                    :headers="uploadHeaders"
                    :data="{ category: 'tabbar', name: tab.name, state: 'active' }"
                    :show-file-list="false"
                    :on-success="(res) => handleTabbarUpload(res, tab.name, 'active')"
                    :before-upload="beforeImageUpload"
                    accept="image/*"
                  >
                    <el-image v-if="tab.active" :src="tab.active" fit="contain" class="tabbar-icon-preview" />
                    <div v-else class="icon-placeholder"><el-icon><Plus /></el-icon></div>
                  </el-upload>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 场景素材 -->
      <el-tab-pane label="场景素材" name="scene-assets">
        <div class="asset-section">
          <div class="section-header">
            <span class="section-title">场景配置素材</span>
            <span class="section-tip">用于场景图标、步骤选项示意图等</span>
          </div>
          
          <!-- 上传区域 -->
          <div class="scene-upload-area">
            <el-upload
              class="scene-asset-upload"
              :action="uploadUrl"
              :headers="uploadHeaders"
              :data="{ category: 'scene-icon' }"
              :show-file-list="false"
              :on-success="handleSceneAssetUpload"
              :before-upload="beforeImageUpload"
              accept="image/*"
              multiple
            >
              <div class="upload-placeholder">
                <el-icon><Plus /></el-icon>
                <span>上传场景素材</span>
                <p>支持 PNG/JPG/WebP，建议尺寸 512×512px</p>
              </div>
            </el-upload>
          </div>
          
          <!-- 素材列表 -->
          <div class="scene-assets-grid" v-loading="loadingSceneAssets">
            <div
              class="scene-asset-item"
              v-for="asset in sceneAssets"
              :key="asset.key"
              @click="copyAssetUrl(asset)"
            >
              <div class="scene-asset-preview">
                <el-image :src="asset.url" fit="contain" :preview-src-list="[asset.url]" />
              </div>
              <div class="scene-asset-info">
                <span class="scene-asset-name" :title="asset.fileName">{{ asset.fileName }}</span>
                <div class="scene-asset-actions">
                  <el-button size="small" type="primary" link @click.stop="copyAssetUrl(asset)">
                    复制URL
                  </el-button>
                  <el-button size="small" type="danger" link @click.stop="deleteSceneAsset(asset)">
                    删除
                  </el-button>
                </div>
              </div>
            </div>
            <div v-if="sceneAssets.length === 0 && !loadingSceneAssets" class="empty-tip">
              暂无场景素材，请上传图片
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- UI图标 -->
      <el-tab-pane label="UI图标" name="ui-icons">
        <div class="asset-section">
          <div class="section-header">
            <span class="section-title">通用UI图标 (SVG/PNG)</span>
            <div class="section-actions">
              <el-button type="primary" size="small" @click="initDefaultIcons" :loading="initingIcons">
                初始化图标库
              </el-button>
              <el-input v-model="iconSearch" placeholder="搜索图标..." style="width: 200px; margin-left: 10px" clearable />
            </div>
          </div>
          <div class="ui-icons-grid" v-loading="loading">
            <div class="ui-icon-item" v-for="icon in filteredUiIcons" :key="icon.key" @click="copyIconUrl(icon)">
              <div class="ui-icon-preview">
                <img :src="icon.url" :alt="icon.fileName" />
              </div>
              <div class="ui-icon-name">{{ icon.fileName }}</div>
            </div>
            <el-upload
              class="ui-icon-upload"
              :action="uploadUrl"
              :headers="uploadHeaders"
              :data="{ category: 'ui-icon' }"
              :show-file-list="false"
              :on-success="handleUiIconUpload"
              :before-upload="beforeIconUpload"
              accept="image/svg+xml,image/png"
            >
              <div class="upload-placeholder small">
                <el-icon><Plus /></el-icon>
                <span>上传图标</span>
              </div>
            </el-upload>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import draggable from 'vuedraggable'
import request from '@/api'

const loading = ref(false)
const activeCategory = ref('banner')

// 上传配置
const uploadUrl = '/api/assets/upload'
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token')}`
}))

// 语言选项
const languages = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en' }
]

// Banner相关
const bannerLang = ref('zh-CN')
const banners = ref([])

// 特色功能图
const featureImages = reactive({
  'zh-CN': '',
  'zh-TW': '',
  'en': ''
})

// 标题图片
const titleImages = reactive({
  'zh-CN': '',
  'zh-TW': '',
  'en': ''
})

// TabBar图标
const tabbarIcons = ref([
  { name: 'home', label: '首页', normal: '', active: '' },
  { name: 'history', label: '历史', normal: '', active: '' },
  { name: 'mine', label: '我的', normal: '', active: '' }
])


// UI图标
const uiIcons = ref([])
const iconSearch = ref('')
const initingIcons = ref(false)

// 场景素材
const sceneAssets = ref([])
const loadingSceneAssets = ref(false)
const filteredUiIcons = computed(() => {
  if (!iconSearch.value) return uiIcons.value
  const keyword = iconSearch.value.toLowerCase()
  return uiIcons.value.filter(icon => icon.fileName.toLowerCase().includes(keyword))
})

// 加载素材列表
async function loadAssets() {
  loading.value = true
  try {
    const res = await request.get('/assets/list')
    if (res.code === 200 || res.code === 0) {
      const data = res.data || {}

      // 解析Banner
      banners.value = data.banners?.[bannerLang.value] || []

      // 解析特色功能图
      if (data.features) {
        Object.keys(data.features).forEach(lang => {
          featureImages[lang] = data.features[lang] ? data.features[lang] + '?t=' + Date.now() : ''
        })
      }

      // 解析标题图片
      if (data.titles) {
        Object.keys(data.titles).forEach(lang => {
          titleImages[lang] = data.titles[lang] ? data.titles[lang] + '?t=' + Date.now() : ''
        })
      }

      // 解析TabBar图标
      if (data.tabbar) {
        tabbarIcons.value.forEach(tab => {
          tab.normal = data.tabbar[tab.name]?.normal ? data.tabbar[tab.name].normal + '?t=' + Date.now() : ''
          tab.active = data.tabbar[tab.name]?.active ? data.tabbar[tab.name].active + '?t=' + Date.now() : ''
        })
      }

      // 解析UI图标
      uiIcons.value = data.uiIcons || []
      
      // 解析场景素材（sceneIcons）
      sceneAssets.value = data.sceneIcons || []
    }
  } catch (error) {
    console.error('加载素材失败:', error)
    ElMessage.error('加载素材列表失败')
  } finally {
    loading.value = false
  }
}

// 加载Banner
async function loadBanners() {
  loading.value = true
  try {
    const res = await request.get('/assets/banners', { params: { lang: bannerLang.value } })
    if (res.code === 200 || res.code === 0) {
      banners.value = res.data || []
    }
  } catch (error) {
    console.error('加载Banner失败:', error)
  } finally {
    loading.value = false
  }
}

// 上传前校验
function beforeImageUpload(file) {
  const isImage = file.type.startsWith('image/')
  const isLt2M = file.size / 1024 / 1024 < 2

  if (!isImage) {
    ElMessage.error('只能上传图片文件!')
    return false
  }
  if (!isLt2M) {
    ElMessage.error('图片大小不能超过 2MB!')
    return false
  }
  return true
}

function beforeIconUpload(file) {
  const isValid = file.type === 'image/svg+xml' || file.type === 'image/png'
  const isLt500K = file.size / 1024 < 500

  if (!isValid) {
    ElMessage.error('只能上传 SVG 或 PNG 文件!')
    return false
  }
  if (!isLt500K) {
    ElMessage.error('图标大小不能超过 500KB!')
    return false
  }
  return true
}

// Banner上传成功
function handleBannerUpload(response) {
  if ((response.code === 200 || response.code === 0) && response.data?.url) {
    banners.value.push({
      key: response.data.key,
      url: response.data.url,
      fileName: response.data.fileName
    })
    ElMessage.success('Banner上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

// Banner排序
async function onBannerReorder() {
  try {
    const keys = banners.value.map(b => b.key)
    await request.post('/assets/banners/sort', {
      lang: bannerLang.value,
      keys
    })
    ElMessage.success('排序已更新')
  } catch (error) {
    ElMessage.error('排序更新失败')
  }
}

// 删除Banner
async function deleteBanner(banner, index) {
  try {
    await ElMessageBox.confirm('确定删除这张Banner吗？', '删除确认', { type: 'warning' })
    await request.delete('/assets/delete', { data: { key: banner.key } })
    banners.value.splice(index, 1)
    ElMessage.success('删除成功')
  } catch {}
}

// 特色功能图上传
function handleFeatureUpload(response, lang) {
  if ((response.code === 200 || response.code === 0) && response.data?.url) {
    featureImages[lang] = response.data.url + '?t=' + Date.now()
    ElMessage.success('上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

// 标题图片上传
function handleTitleUpload(response, lang) {
  if ((response.code === 200 || response.code === 0) && response.data?.url) {
    titleImages[lang] = response.data.url + '?t=' + Date.now()
    ElMessage.success('上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

// TabBar图标上传
function handleTabbarUpload(response, name, state) {
  if ((response.code === 200 || response.code === 0) && response.data?.url) {
    const tab = tabbarIcons.value.find(t => t.name === name)
    if (tab) {
      tab[state] = response.data.url + '?t=' + Date.now()
    }
    ElMessage.success('上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

// UI图标上传
function handleUiIconUpload(response) {
  if ((response.code === 200 || response.code === 0) && response.data?.url) {
    uiIcons.value.push({
      key: response.data.key,
      url: response.data.url,
      fileName: response.data.fileName
    })
    ElMessage.success('上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

// 复制图标URL
function copyIconUrl(icon) {
  navigator.clipboard.writeText(icon.url)
  ElMessage.success('已复制图标URL')
}

// 初始化默认图标库
async function initDefaultIcons() {
  try {
    await ElMessageBox.confirm('这将上传100+个常用SVG图标到图标库，是否继续？', '初始化图标库', { type: 'info' })
    initingIcons.value = true
    const res = await request.post('/assets/init-icons')
    if (res.code === 200 || res.code === 0) {
      ElMessage.success(res.message)
      // 重新加载素材列表
      await loadAssets()
    } else {
      ElMessage.error(res.message || '初始化失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('初始化失败: ' + (e.message || e))
    }
  } finally {
    initingIcons.value = false
  }
}

// Tab切换
function onCategoryChange(name) {
  if (name === 'banner') {
    loadBanners()
  } else if (name === 'scene-assets') {
    loadSceneAssets()
  }
}

// 加载场景素材
async function loadSceneAssets() {
  loadingSceneAssets.value = true
  try {
    const res = await request.get('/assets/list')
    if (res.code === 200 || res.code === 0) {
      sceneAssets.value = res.data?.sceneIcons || []
    }
  } catch (error) {
    console.error('加载场景素材失败:', error)
  } finally {
    loadingSceneAssets.value = false
  }
}

// 场景素材上传成功
function handleSceneAssetUpload(response) {
  if ((response.code === 200 || response.code === 0) && response.data?.url) {
    sceneAssets.value.push({
      key: response.data.key,
      url: response.data.url,
      fileName: response.data.fileName
    })
    ElMessage.success('场景素材上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

// 复制素材URL
function copyAssetUrl(asset) {
  navigator.clipboard.writeText(asset.url)
  ElMessage.success('已复制素材URL: ' + asset.fileName)
}

// 删除场景素材
async function deleteSceneAsset(asset) {
  try {
    await ElMessageBox.confirm(`确定删除素材 "${asset.fileName}" 吗？`, '删除确认', { type: 'warning' })
    await request.delete('/assets/delete', { data: { key: asset.key } })
    const index = sceneAssets.value.findIndex(a => a.key === asset.key)
    if (index > -1) {
      sceneAssets.value.splice(index, 1)
    }
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败: ' + (e.message || e))
    }
  }
}

onMounted(() => {
  loadAssets()
})
</script>

<style scoped>
.assets-management {
  padding: 20px;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  color: #303133;
}

.subtitle {
  color: #909399;
  font-size: 14px;
  margin-left: 10px;
}

.asset-section {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  min-width: 0;
  overflow-x: auto;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
  flex-wrap: wrap;
  gap: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  white-space: nowrap;
}

.section-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.section-tip {
  font-size: 12px;
  color: #909399;
}

.section-filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* Banner列表 */
.banner-grid {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.banner-list {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.banner-item {
  position: relative;
  width: 280px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.banner-order {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 24px;
  height: 24px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  z-index: 1;
}

.banner-img {
  width: 100%;
  height: 150px;
  display: block;
}

.banner-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.banner-item:hover .banner-actions {
  opacity: 1;
}

.banner-upload {
  width: 280px;
  height: 150px;
}

.banner-upload :deep(.el-upload) {
  width: 100%;
  height: 100%;
}

.upload-placeholder {
  width: 100%;
  height: 100%;
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-placeholder:hover {
  border-color: #409EFF;
  color: #409EFF;
}

.upload-placeholder.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.upload-placeholder .el-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.upload-placeholder span {
  font-size: 14px;
}

.upload-placeholder p {
  font-size: 12px;
  margin-top: 4px;
  color: #c0c4cc;
}

.upload-placeholder.small {
  height: 120px;
}

.upload-placeholder.small .el-icon {
  font-size: 24px;
}

/* 特色功能图 */
.feature-list {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.feature-item {
  flex: 1;
  min-width: 200px;
  max-width: 400px;
}

.feature-label {
  font-size: 14px;
  color: #606266;
  margin-bottom: 10px;
  text-align: center;
}

.feature-uploader :deep(.el-upload) {
  width: 100%;
}

.feature-preview {
  width: 100%;
  height: 200px;
  border-radius: 8px;
  border: 1px solid #eee;
}

.feature-upload-area {
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  transition: border-color 0.2s;
}

.feature-upload-area:hover {
  border-color: #409EFF;
}

/* 标题图片 */
.title-uploader :deep(.el-upload) {
  width: 100%;
}

.title-preview {
  width: 100%;
  height: 60px;
  border-radius: 8px;
  border: 1px solid #eee;
}

/* TabBar图标 */
.tabbar-list {
  display: flex;
  gap: 40px;
  flex-wrap: wrap;
}

.tabbar-item {
  text-align: center;
}

.tabbar-name {
  font-size: 14px;
  color: #606266;
  margin-bottom: 12px;
}

.tabbar-icons {
  display: flex;
  gap: 20px;
}

.tabbar-icon-item {
  text-align: center;
}

.icon-state {
  font-size: 12px;
  color: #909399;
  display: block;
  margin-bottom: 8px;
}

.tabbar-uploader :deep(.el-upload) {
  width: 60px;
  height: 60px;
}

.tabbar-icon-preview {
  width: 56px;
  height: 56px;
  border: 1px solid #eee;
  border-radius: 8px;
}

.icon-placeholder {
  width: 56px;
  height: 56px;
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #dcdfe6;
  cursor: pointer;
}

.icon-placeholder:hover {
  border-color: #409EFF;
  color: #409EFF;
}

/* UI图标 */
.ui-icons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 12px;
}

.ui-icon-item {
  text-align: center;
  padding: 12px 8px;
  border: 1px solid #eee;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.ui-icon-item:hover {
  border-color: #409EFF;
  background: #ecf5ff;
}

.ui-icon-preview {
  width: 32px;
  height: 32px;
  margin: 0 auto;
}

.ui-icon-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.ui-icon-name {
  font-size: 10px;
  color: #909399;
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-icon-upload {
  display: flex;
}

.ui-icon-upload :deep(.el-upload) {
  width: 100%;
  height: 100%;
}

.ui-icon-upload .upload-placeholder.small {
  width: 100%;
  height: 100%;
  min-height: 70px;
  padding: 12px 8px;
  box-sizing: border-box;
}

.ui-icon-upload .upload-placeholder.small .el-icon {
  font-size: 20px;
  margin-bottom: 4px;
}

.ui-icon-upload .upload-placeholder.small span {
  font-size: 10px;
}

/* 场景素材 */
.scene-upload-area {
  margin-bottom: 24px;
}

.scene-asset-upload {
  width: 200px;
  height: 150px;
}

.scene-asset-upload :deep(.el-upload) {
  width: 100%;
  height: 100%;
}

.scene-assets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
}

.scene-asset-item {
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
  cursor: pointer;
}

.scene-asset-item:hover {
  border-color: #409EFF;
  box-shadow: 0 2px 12px rgba(64, 158, 255, 0.2);
}

.scene-asset-preview {
  width: 100%;
  height: 120px;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scene-asset-preview :deep(.el-image) {
  width: 100%;
  height: 100%;
}

.scene-asset-preview :deep(.el-image img) {
  object-fit: contain;
}

.scene-asset-info {
  padding: 8px;
  background: #fff;
}

.scene-asset-name {
  font-size: 12px;
  color: #606266;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.scene-asset-actions {
  display: flex;
  gap: 8px;
}

.scene-asset-actions .el-button {
  padding: 0;
  font-size: 12px;
}

.empty-tip {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px;
  color: #909399;
  font-size: 14px;
}
</style>
