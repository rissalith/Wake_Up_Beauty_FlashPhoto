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
                <p>750×400px</p>
              </div>
            </el-upload>
            <!-- AI生成Banner -->
            <div class="banner-upload ai-generate-btn" @click="showAiGenerateDialog('banner', 'banner')">
              <div class="upload-placeholder">
                <el-icon><MagicStick /></el-icon>
                <span>AI生成</span>
                <p>生成轮播图</p>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 特色功能图 -->
      <el-tab-pane label="特色功能图" name="feature">
        <div class="asset-section">
          <div class="section-header">
            <span class="section-title">首页特色功能区图片</span>
            <el-button type="warning" size="small" @click="showAiGenerateDialog('feature', 'feature')">
              <el-icon><MagicStick /></el-icon> AI生成
            </el-button>
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
            <el-button type="warning" size="small" @click="showAiGenerateDialog('title', 'title')">
              <el-icon><MagicStick /></el-icon> AI生成
            </el-button>
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
                <span>上传素材</span>
                <p>PNG/JPG/WebP</p>
              </div>
            </el-upload>
            <!-- AI生成场景素材 -->
            <div class="scene-asset-upload ai-generate-btn" @click="showAiGenerateDialog('scene-icon', 'scenes')">
              <div class="upload-placeholder">
                <el-icon><MagicStick /></el-icon>
                <span>AI生成</span>
                <p>生成场景素材</p>
              </div>
            </div>
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

      <!-- Logo/关于 -->
      <el-tab-pane label="Logo/关于" name="logo">
        <div class="asset-section">
          <div class="section-header">
            <span class="section-title">Logo与关于页面图片</span>
            <span class="section-tip">用于"关于我们"页面和其他需要Logo的地方</span>
          </div>

          <!-- Logo图片 -->
          <div class="logo-section">
            <h4>应用Logo</h4>
            <div class="logo-list">
              <div class="logo-item" v-for="item in logoItems" :key="item.key">
                <div class="logo-label">{{ item.label }}</div>
                <div class="logo-upload-area">
                  <el-upload
                    class="logo-uploader"
                    :action="uploadUrl"
                    :headers="uploadHeaders"
                    :data="{ category: 'logo', name: item.key }"
                    :show-file-list="false"
                    :on-success="(res) => handleLogoUpload(res, item.key)"
                    :before-upload="beforeImageUpload"
                    accept="image/*"
                  >
                    <el-image
                      v-if="logoImages[item.key]"
                      :src="logoImages[item.key]"
                      fit="contain"
                      class="logo-preview"
                    />
                    <div v-else class="upload-placeholder small">
                      <el-icon><Plus /></el-icon>
                      <span>上传</span>
                    </div>
                  </el-upload>
                  <el-button v-if="logoImages[item.key]" type="primary" link size="small" @click="copyUrl(logoImages[item.key])">
                    复制URL
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 关于页面图片 -->
          <div class="about-section">
            <h4>关于页面图片</h4>
            <div class="about-images-grid">
              <el-upload
                class="scene-asset-upload"
                :action="uploadUrl"
                :headers="uploadHeaders"
                :data="{ category: 'about' }"
                :show-file-list="false"
                :on-success="handleAboutImageUpload"
                :before-upload="beforeImageUpload"
                accept="image/*"
              >
                <div class="upload-placeholder">
                  <el-icon><Plus /></el-icon>
                  <span>上传图片</span>
                </div>
              </el-upload>
              <!-- AI生成 -->
              <div class="scene-asset-upload ai-generate-btn" @click="showAiGenerateDialog('logo', 'about')">
                <div class="upload-placeholder">
                  <el-icon><MagicStick /></el-icon>
                  <span>AI生成</span>
                </div>
              </div>
              <!-- 图片列表 -->
              <div class="scene-asset-item" v-for="img in aboutImages" :key="img.key">
                <img :src="img.url" :alt="img.fileName" />
                <div class="asset-info">
                  <span class="asset-name">{{ img.fileName }}</span>
                </div>
                <div class="asset-overlay">
                  <el-button type="primary" size="small" @click.stop="copyUrl(img.url)">复制URL</el-button>
                  <el-button type="danger" size="small" @click.stop="deleteAsset(img.key)">删除</el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 一般素材 -->
      <el-tab-pane label="一般素材" name="general">
        <div class="asset-section">
          <div class="section-header">
            <span class="section-title">一般素材</span>
            <span class="section-tip">用于场景步骤调用等通用素材</span>
          </div>
          <div class="scene-assets-grid" v-loading="loading">
            <!-- 上传按钮 -->
            <el-upload
              class="scene-asset-upload"
              :action="uploadUrl"
              :headers="uploadHeaders"
              :data="{ category: 'general' }"
              :show-file-list="false"
              :on-success="handleGeneralAssetUpload"
              :before-upload="beforeUpload"
              accept="image/*"
            >
              <div class="upload-placeholder">
                <el-icon><Plus /></el-icon>
                <span>上传素材</span>
                <span class="upload-tip">PNG/JPG/WebP</span>
              </div>
            </el-upload>
            <!-- AI生成按钮 -->
            <div class="scene-asset-upload ai-generate-btn" @click="showAiGenerateDialog('general', 'ai-generated')">
              <div class="upload-placeholder">
                <el-icon><MagicStick /></el-icon>
                <span>AI生成</span>
                <span class="upload-tip">输入描述生成图片</span>
              </div>
            </div>
            <!-- 正在生成中的占位图 -->
            <div class="scene-asset-item generating-placeholder" v-for="task in generatingTasks" :key="task.id">
              <div class="generating-animation">
                <el-icon class="is-loading"><Loading /></el-icon>
              </div>
              <div class="asset-info">
                <el-tag size="small" type="warning">AI生成中</el-tag>
              </div>
            </div>
            <!-- 素材列表 -->
            <div class="scene-asset-item" v-for="asset in generalAssets" :key="asset.key" @click="showAssetDetail(asset)">
              <img :src="asset.url" :alt="asset.fileName" />
              <div class="asset-info">
                <span class="asset-name">{{ asset.displayName || asset.fileName }}</span>
                <el-tag v-if="asset.source === 'ai-generated'" size="small" type="warning">AI</el-tag>
              </div>
              <div class="asset-overlay">
                <el-button type="primary" size="small" @click.stop="copyUrl(asset.url)">复制URL</el-button>
                <el-button type="info" size="small" @click.stop="showAssetDetail(asset)">详情</el-button>
                <el-button type="danger" size="small" @click.stop="deleteAsset(asset.key)">删除</el-button>
              </div>
            </div>
          </div>
          <div v-if="generalAssets.length === 0 && generatingTasks.length === 0 && !loading" class="empty-tip">
            暂无一般素材，请上传图片或使用AI生成
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- AI生成图片对话框 -->
    <el-dialog v-model="aiDialogVisible" title="AI生成图片" width="600px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="描述">
          <el-input
            v-model="aiPrompt"
            type="textarea"
            :rows="4"
            placeholder="请详细描述你想要生成的图片，例如：一匹威风凛凛的银色骏马，鬃毛闪耀着银光，气质高贵优雅，写实风格，4K画质"
          />
        </el-form-item>
        <el-form-item label="保存名称">
          <el-input v-model="aiImageName" placeholder="可选，用于标识图片" />
        </el-form-item>
        <el-form-item label="保存目录">
          <el-select v-model="aiFolder" style="width: 100%">
            <el-option label="AI生成" value="ai-generated" />
            <el-option label="马匹素材" value="horses" />
            <el-option label="场景素材" value="scenes" />
            <el-option label="其他" value="misc" />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="aiDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="generateInBackground" :loading="aiGenerating">
            {{ aiGenerating ? '生成中...' : '开始生成' }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 素材详情对话框 -->
    <el-dialog v-model="assetDetailVisible" title="素材详情" width="500px">
      <div v-if="currentAsset" class="asset-detail">
        <el-image :src="currentAsset.url" fit="contain" class="detail-image" />
        <el-form label-width="80px" style="margin-top: 15px">
          <el-form-item label="名称">
            <el-input v-model="currentAsset.displayName" placeholder="输入名称" />
          </el-form-item>
          <el-form-item label="文件名">
            <span>{{ currentAsset.fileName }}</span>
          </el-form-item>
          <el-form-item label="来源">
            <el-tag :type="currentAsset.source === 'ai-generated' ? 'warning' : 'info'">
              {{ currentAsset.source === 'ai-generated' ? 'AI生成' : '手动上传' }}
            </el-tag>
          </el-form-item>
          <el-form-item v-if="currentAsset.prompt" label="Prompt">
            <el-input type="textarea" :rows="3" v-model="currentAsset.prompt" readonly />
          </el-form-item>
          <el-form-item v-if="currentAsset.created_at" label="创建时间">
            <span>{{ currentAsset.created_at }}</span>
          </el-form-item>
          <el-form-item label="URL">
            <el-input v-model="currentAsset.url" readonly>
              <template #append>
                <el-button @click="copyUrl(currentAsset.url)">复制</el-button>
              </template>
            </el-input>
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="assetDetailVisible = false">关闭</el-button>
        <el-button type="primary" @click="updateAssetName">保存名称</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, MagicStick, Loading } from '@element-plus/icons-vue'
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
  'en': ''
})

// 标题图片
const titleImages = reactive({
  'zh-CN': '',
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

// 一般素材
const generalAssets = ref([])

// Logo/关于相关
const logoItems = [
  { key: 'logo-main', label: '主Logo' },
  { key: 'logo-white', label: '白色Logo' },
  { key: 'logo-icon', label: '图标Logo' },
  { key: 'logo-text', label: '文字Logo' }
]
const logoImages = reactive({
  'logo-main': '',
  'logo-white': '',
  'logo-icon': '',
  'logo-text': ''
})
const aboutImages = ref([])

// AI生成相关
const aiDialogVisible = ref(false)
const aiPrompt = ref('')
const aiImageName = ref('')
const aiFolder = ref('ai-generated')
const aiGeneratedImage = ref('')
const aiGenerating = ref(false)
const aiSaving = ref(false)

// 后台生成任务列表
const generatingTasks = ref([])
let taskIdCounter = 0

// 素材详情
const assetDetailVisible = ref(false)
const currentAsset = ref(null)

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

      // 解析一般素材
      generalAssets.value = data.generalAssets || []

      // 解析Logo图片
      if (data.logos) {
        Object.keys(data.logos).forEach(key => {
          logoImages[key] = data.logos[key] ? data.logos[key] + '?t=' + Date.now() : ''
        })
      }

      // 解析关于页面图片
      aboutImages.value = data.aboutImages || []
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

// 一般素材上传
function handleGeneralAssetUpload(response) {
  if ((response.code === 200 || response.code === 0) && response.data?.url) {
    generalAssets.value.push({
      key: response.data.key,
      url: response.data.url,
      fileName: response.data.fileName
    })
    ElMessage.success('上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

// Logo上传
function handleLogoUpload(response, key) {
  if ((response.code === 200 || response.code === 0) && response.data?.url) {
    logoImages[key] = response.data.url + '?t=' + Date.now()
    ElMessage.success('Logo上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

// 关于页面图片上传
function handleAboutImageUpload(response) {
  if ((response.code === 200 || response.code === 0) && response.data?.url) {
    aboutImages.value.push({
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

// ==================== AI生成图片 ====================
// 各栏目默认提示词
const defaultPrompts = {
  banner: '生成一张APP首页轮播图，展示AI照片生成功能，现代简约风格，渐变色背景，包含人物剪影和科技元素，尺寸750×400像素，高清画质',
  feature: '生成一张特色功能展示图，展示AI智能修图功能，扁平化设计风格，明亮的配色，包含相机和魔法棒图标元素，高清画质',
  title: '生成一个APP导航栏标题图片，文字"醒美闪图"，艺术字体设计，渐变金色效果，透明背景，高清PNG格式',
  'scene-icon': '生成一个场景图标，圆角方形设计，扁平化风格，明亮的配色，简洁的图形元素，512×512像素，高清画质',
  logo: '生成一个APP Logo图片，"醒美闪图"品牌标识，现代简约设计，渐变金色或橙色，透明背景，高清PNG格式',
  general: '生成一张高质量素材图片，写实风格，4K画质，背景简洁，主体突出'
}

// 当前AI生成的目标类别
const aiCategory = ref('general')

// 显示AI生成对话框
function showAiGenerateDialog(category = 'general', folder = 'ai-generated') {
  aiCategory.value = category
  aiPrompt.value = defaultPrompts[category] || defaultPrompts.general
  aiImageName.value = ''
  aiFolder.value = folder
  aiGeneratedImage.value = ''
  aiDialogVisible.value = true
}

// 生成图片
async function generateImage() {
  if (!aiPrompt.value.trim()) {
    ElMessage.warning('请输入图片描述')
    return
  }

  aiGenerating.value = true
  aiGeneratedImage.value = ''

  try {
    const res = await request.post('/assets/ai-generate', {
      prompt: aiPrompt.value
    }, { timeout: 150000 })

    if (res.code === 0 && res.data?.imageBase64) {
      aiGeneratedImage.value = res.data.imageBase64
      ElMessage.success('图片生成成功，请确认是否保存')
    } else {
      ElMessage.error(res.message || '生成失败')
    }
  } catch (error) {
    ElMessage.error('生成失败: ' + (error.message || '请求超时'))
  } finally {
    aiGenerating.value = false
  }
}

// 重新生成
function regenerateImage() {
  aiGeneratedImage.value = ''
  generateImage()
}

// 保存AI生成的图片
async function saveAiImage() {
  if (!aiGeneratedImage.value) {
    ElMessage.warning('请先生成图片')
    return
  }

  aiSaving.value = true
  try {
    const res = await request.post('/assets/ai-save', {
      imageBase64: aiGeneratedImage.value,
      prompt: aiPrompt.value,
      name: aiImageName.value,
      folder: aiFolder.value
    })

    if (res.code === 0) {
      ElMessage.success('保存成功')
      aiDialogVisible.value = false

      // 添加到列表
      generalAssets.value.unshift({
        key: res.data.key,
        url: res.data.url,
        fileName: res.data.fileName,
        displayName: aiImageName.value || res.data.fileName,
        source: 'ai-generated',
        prompt: aiPrompt.value
      })
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (error) {
    ElMessage.error('保存失败: ' + error.message)
  } finally {
    aiSaving.value = false
  }
}

// 后台生成图片（关闭弹窗，显示占位图）
async function generateInBackground() {
  if (!aiPrompt.value.trim()) {
    ElMessage.warning('请输入图片描述')
    return
  }

  // 创建任务
  const taskId = ++taskIdCounter
  const task = {
    id: taskId,
    name: aiImageName.value || '生成中...',
    prompt: aiPrompt.value,
    folder: aiFolder.value
  }

  // 添加到任务列表
  generatingTasks.value.unshift(task)

  // 关闭弹窗
  aiDialogVisible.value = false
  ElMessage.info('已开始后台生成，完成后会自动添加到列表')

  // 后台执行生成
  try {
    const res = await request.post('/assets/ai-generate', {
      prompt: task.prompt
    }, { timeout: 150000 })

    if (res.code === 0 && res.data?.imageBase64) {
      // 生成成功，保存到COS
      const saveRes = await request.post('/assets/ai-save', {
        imageBase64: res.data.imageBase64,
        prompt: task.prompt,
        name: task.name,
        folder: task.folder
      })

      if (saveRes.code === 0) {
        // 添加到素材列表
        generalAssets.value.unshift({
          key: saveRes.data.key,
          url: saveRes.data.url,
          fileName: saveRes.data.fileName,
          displayName: task.name || saveRes.data.fileName,
          source: 'ai-generated',
          prompt: task.prompt
        })
        ElMessage.success(`图片"${task.name || '未命名'}"生成完成`)
      }
    } else {
      ElMessage.error(`图片生成失败: ${res.message || '未知错误'}`)
    }
  } catch (error) {
    ElMessage.error(`图片生成失败: ${error.message}`)
  } finally {
    // 从任务列表移除
    const index = generatingTasks.value.findIndex(t => t.id === taskId)
    if (index > -1) {
      generatingTasks.value.splice(index, 1)
    }
  }
}

// ==================== 素材详情 ====================
// 显示素材详情
async function showAssetDetail(asset) {
  currentAsset.value = { ...asset }

  // 尝试获取元数据
  try {
    const res = await request.get(`/assets/metadata/${encodeURIComponent(asset.key)}`)
    if (res.code === 0 && res.data) {
      currentAsset.value = {
        ...currentAsset.value,
        ...res.data,
        displayName: res.data.name || asset.fileName
      }
    }
  } catch (e) {
    // 忽略错误
  }

  assetDetailVisible.value = true
}

// 更新素材名称
async function updateAssetName() {
  if (!currentAsset.value) return

  try {
    await request.put(`/assets/metadata/${encodeURIComponent(currentAsset.value.key)}`, {
      name: currentAsset.value.displayName
    })
    ElMessage.success('名称已更新')

    // 更新列表中的显示名称
    const asset = generalAssets.value.find(a => a.key === currentAsset.value.key)
    if (asset) {
      asset.displayName = currentAsset.value.displayName
    }

    assetDetailVisible.value = false
  } catch (error) {
    ElMessage.error('更新失败')
  }
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
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.scene-asset-upload {
  min-width: 150px;
  height: 150px;
}

.scene-asset-upload :deep(.el-upload) {
  width: 100%;
  height: 100%;
}

.scene-assets-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.scene-asset-item {
  width: 150px;
  height: 150px;
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
  cursor: pointer;
}

.scene-asset-item img {
  width: 100%;
  height: 100px;
  object-fit: cover;
}

.scene-asset-item .asset-info {
  height: 50px;
  padding: 5px 8px;
  box-sizing: border-box;
  overflow: hidden;
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

/* AI生成按钮 */
.ai-generate-btn {
  cursor: pointer;
  border-color: #e6a23c !important;
}

.ai-generate-btn:hover {
  border-color: #f5a623 !important;
  background: #fdf6ec;
}

.ai-generate-btn .upload-placeholder {
  color: #e6a23c;
}

/* 素材项悬停效果 */
.scene-asset-item {
  position: relative;
  cursor: pointer;
}

.asset-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.scene-asset-item:hover .asset-overlay {
  opacity: 1;
}

.asset-info {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px;
}

/* AI预览 */
.ai-preview {
  margin-top: 15px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 15px;
  background: #fafafa;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: 500;
}

.preview-image {
  width: 100%;
  max-height: 400px;
  border-radius: 4px;
}

/* 素材详情 */
.asset-detail .detail-image {
  width: 100%;
  max-height: 300px;
  border-radius: 8px;
  background: #f5f7fa;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 生成中占位图 */
.generating-placeholder {
  border: 2px dashed #e6a23c !important;
  background: linear-gradient(135deg, #fdf6ec 0%, #fef0e6 100%);
}

.generating-animation {
  width: 100%;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(230, 162, 60, 0.1);
}

.generating-animation .el-icon {
  font-size: 40px;
  color: #e6a23c;
}

/* Logo/关于页面样式 */
.logo-section, .about-section {
  margin-bottom: 30px;
}

.logo-section h4, .about-section h4 {
  margin: 0 0 15px 0;
  color: #303133;
  font-size: 14px;
  border-left: 3px solid #e6a23c;
  padding-left: 10px;
}

.logo-list {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.logo-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.logo-label {
  font-size: 12px;
  color: #606266;
}

.logo-upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.logo-uploader {
  width: 120px;
  height: 120px;
}

.logo-uploader :deep(.el-upload) {
  width: 100%;
  height: 100%;
  border: 1px dashed #d9d9d9;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
}

.logo-uploader :deep(.el-upload:hover) {
  border-color: #e6a23c;
}

.logo-preview {
  width: 100%;
  height: 100%;
}

.about-images-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
</style>
