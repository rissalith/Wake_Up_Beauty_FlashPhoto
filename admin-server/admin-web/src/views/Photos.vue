<template>
  <div class="photos-page">
    <div class="page-card">
      <div class="card-header">
        <span class="card-title">照片管理</span>
        <div class="filter-bar">
          <!-- 数据源切换 -->
          <el-radio-group v-model="dataSource" @change="handleSourceChange">
            <el-radio-button label="cos">COS存储</el-radio-button>
            <el-radio-button label="db">数据库</el-radio-button>
          </el-radio-group>

          <el-divider direction="vertical" />

          <!-- COS模式筛选 -->
          <template v-if="dataSource === 'cos'">
            <el-select
              v-model="selectedUserId"
              placeholder="选择用户"
              clearable
              filterable
              style="width: 220px"
              @change="loadCosPhotos"
            >
              <el-option
                v-for="user in cosUsers"
                :key="user.user_id"
                :label="user.nickname || user.user_id"
                :value="user.user_id"
              >
                <span>{{ user.nickname || '未知昵称' }}</span>
                <span class="user-id-hint">{{ user.user_id.substring(0, 12) }}...</span>
              </el-option>
            </el-select>
            <el-select v-model="photoScene" placeholder="场景类型" clearable style="width: 120px" @change="loadCosPhotos">
              <el-option label="证件照" value="idphoto" />
              <el-option label="职业照" value="professional" />
              <el-option label="头像" value="avatar" />
              <el-option label="反馈图片" value="feedback" />
              <el-option label="默认/旧版" value="default" />
            </el-select>
            <el-select v-model="photoType" placeholder="照片类型" clearable style="width: 120px" @change="loadCosPhotos">
              <el-option label="原图" value="temp" />
              <el-option label="结果图" value="output" />
            </el-select>
          </template>

          <!-- 数据库模式筛选 -->
          <template v-else>
            <el-input
              v-model="userId"
              placeholder="用户ID"
              style="width: 180px"
              clearable
            />
            <el-select v-model="status" placeholder="状态" clearable style="width: 120px">
              <el-option label="已完成" value="done" />
              <el-option label="生成中" value="generating" />
              <el-option label="失败" value="failed" />
            </el-select>
          </template>

          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
        </div>
      </div>

      <!-- COS状态提示 -->
      <el-alert
        v-if="dataSource === 'cos' && !cosConfigured"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        <template #title>
          COS未配置 - 请在服务端 .env 文件中设置 COS_SECRET_ID 和 COS_SECRET_KEY
        </template>
      </el-alert>

      <!-- 统计 -->
      <div class="stats-summary">
        <template v-if="dataSource === 'cos'">
          <div class="stat-item">
            <span class="label">COS用户数</span>
            <span class="value">{{ cosUsers.length }}</span>
          </div>
          <div class="stat-item">
            <span class="label">当前照片</span>
            <span class="value">{{ total }}</span>
          </div>
        </template>
        <template v-else>
          <div class="stat-item">
            <span class="label">照片总数</span>
            <span class="value">{{ stats.total || 0 }}</span>
          </div>
          <div class="stat-item">
            <span class="label">今日生成</span>
            <span class="value">{{ stats.today || 0 }}</span>
          </div>
        </template>
      </div>

      <!-- 照片网格 -->
      <div class="photo-grid" v-loading="loading">
        <div class="photo-item" v-for="photo in photos" :key="photo.id || photo.key">
          <div class="photo-img-wrap">
            <el-image
              :src="getPhotoUrl(photo)"
              :preview-src-list="photos.map(p => getPhotoUrl(p))"
              :initial-index="photos.findIndex(p => (p.id || p.key) === (photo.id || photo.key))"
              fit="cover"
              class="photo-img"
            >
              <template #error>
                <div class="image-error">
                  <el-icon><Picture /></el-icon>
                </div>
              </template>
            </el-image>
            <!-- 类型标签 -->
            <el-tag
              v-if="photo.type"
              class="type-tag"
              :type="photo.type === 'output' ? 'success' : 'info'"
              size="small"
            >
              {{ photo.type === 'output' ? '结果图' : '原图' }}
            </el-tag>
            <!-- 场景标签 -->
            <el-tag
              v-if="photo.scene && photo.scene !== 'default'"
              class="scene-tag"
              :type="getSceneTagType(photo.scene)"
              size="small"
            >
              {{ photo.sceneName || getSceneName(photo.scene) }}
            </el-tag>
            <el-button
              v-if="dataSource === 'db'"
              class="delete-btn"
              type="danger"
              circle
              size="small"
              @click="handleDelete(photo)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div class="photo-info">
            <div class="info-row" v-if="dataSource === 'db'">
              <el-tag size="small">{{ photo.spec || '未知规格' }}</el-tag>
              <el-tag size="small" type="info">{{ photo.bg_color || '未知背景' }}</el-tag>
            </div>
            <div class="info-row" v-else>
              <span class="file-size">{{ formatSize(photo.size) }}</span>
            </div>
            <div class="info-row">
              <span class="user-id">{{ (photo.user_id || photo.userId)?.substring(0, 12) }}...</span>
            </div>
            <div class="info-row">
              <span class="time">{{ formatDate(photo.created_at || photo.lastModified) }}</span>
            </div>
          </div>
        </div>
      </div>

      <el-empty v-if="!loading && photos.length === 0" :description="emptyText" />

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[12, 24, 48]"
          layout="total, sizes, prev, pager, next"
          @change="handlePageChange"
        />
      </div>
    </div>

    <!-- 用户照片详情对话框 -->
    <el-dialog
      v-model="showUserDetail"
      :title="`用户照片详情 - ${selectedUserDetail?.user?.nickname || selectedUserDetail?.user?.user_id || ''}`"
      width="80%"
      v-dialog-drag
    >
      <div v-if="selectedUserDetail" class="user-detail">
        <div class="detail-stats">
          <el-statistic title="照片总数" :value="selectedUserDetail.stats?.total || 0" />
          <el-statistic title="原图数量" :value="selectedUserDetail.stats?.temp || 0" />
          <el-statistic title="证件照数量" :value="selectedUserDetail.stats?.output || 0" />
        </div>
        <div class="records-grid">
          <div class="record-item" v-for="record in selectedUserDetail.records" :key="record.id">
            <div class="record-images">
              <div class="image-box">
                <span class="image-label">原图</span>
                <el-image
                  v-if="record.originalImage"
                  :src="record.originalImage"
                  fit="cover"
                  :preview-src-list="[record.originalImage]"
                />
                <div v-else class="no-image">无</div>
              </div>
              <el-icon class="arrow-icon"><Right /></el-icon>
              <div class="image-box">
                <span class="image-label">证件照</span>
                <el-image
                  v-if="record.resultImage"
                  :src="record.resultImage"
                  fit="cover"
                  :preview-src-list="[record.resultImage]"
                />
                <div v-else class="no-image">无</div>
              </div>
            </div>
            <div class="record-time">{{ formatDate(record.createdAt) }}</div>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { ElMessageBox, ElMessage } from 'element-plus'
import { photosApi } from '../api'

// 配置dayjs支持时区
dayjs.extend(utc)
dayjs.extend(timezone)

const loading = ref(false)
const photos = ref([])
const page = ref(1)
const pageSize = ref(48)
const total = ref(0)
const userId = ref('')
const status = ref('')
const stats = ref({})

// COS相关
const dataSource = ref('cos') // 'cos' 或 'db'
const cosConfigured = ref(false)
const cosUsers = ref([])
const selectedUserId = ref('')
const photoType = ref('')
const photoScene = ref('')  // 新增：场景筛选
const showUserDetail = ref(false)
const selectedUserDetail = ref(null)

const emptyText = computed(() => {
  if (dataSource.value === 'cos') {
    if (!cosConfigured.value) return 'COS未配置，请先配置COS密钥'
    return '暂无照片'
  }
  return '暂无照片'
})

const formatDate = (date) => {
  if (!date) return '-'
  // 数据库存储的是UTC时间，需要转换为北京时间
  return dayjs.utc(date).tz('Asia/Shanghai').format('MM-DD HH:mm')
}

const formatSize = (bytes) => {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

const getPhotoUrl = (photo) => {
  if (dataSource.value === 'cos') {
    return photo.url
  }
  return photo.result_image
}

// 获取场景名称
const getSceneName = (scene) => {
  const sceneNames = {
    idphoto: '证件照',
    professional: '职业照',
    avatar: '头像',
    feedback: '反馈',
    default: '默认'
  }
  return sceneNames[scene] || scene
}

// 获取场景标签颜色
const getSceneTagType = (scene) => {
  const types = {
    idphoto: 'primary',
    professional: 'warning',
    avatar: '',
    feedback: 'danger',
    default: 'info'
  }
  return types[scene] || 'info'
}

// 检查COS状态
const checkCosStatus = async () => {
  try {
    const res = await photosApi.getCosStatus()
    if (res.code === 200 || res.code === 0) {
      cosConfigured.value = res.data.configured
    }
  } catch (error) {
    cosConfigured.value = false
  }
}

// 加载COS用户列表
const loadCosUsers = async () => {
  if (!cosConfigured.value) return

  try {
    const res = await photosApi.getCosUsers()
    if (res.code === 200 || res.code === 0) {
      cosUsers.value = res.data
    }
  } catch (error) {
    console.error('加载COS用户失败:', error)
  }
}

// 加载COS照片
const loadCosPhotos = async () => {
  if (!cosConfigured.value) {
    photos.value = []
    total.value = 0
    return
  }

  loading.value = true
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value,
      userId: selectedUserId.value,
      type: photoType.value,
      scene: photoScene.value  // 新增场景筛选参数
    }
    const res = await photosApi.getCosPhotos(params)
    if (res.code === 200 || res.code === 0) {
      photos.value = res.data.list
      total.value = res.data.total
    }
  } catch (error) {
    ElMessage.error('加载COS照片失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

// 加载数据库照片
const loadDbPhotos = async () => {
  loading.value = true
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value,
      userId: userId.value,
      status: status.value
    }
    const res = await photosApi.getList(params)
    if (res.code === 200 || res.code === 0) {
      photos.value = res.data.list
      total.value = res.data.total
    }
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  try {
    const res = await photosApi.getStats()
    if (res.code === 200 || res.code === 0) {
      stats.value = res.data
    }
  } catch (error) {
    console.error(error)
  }
}

const handleSourceChange = async () => {
  page.value = 1
  photos.value = []
  total.value = 0

  if (dataSource.value === 'cos') {
    await loadCosUsers()
    await loadCosPhotos()
  } else {
    await loadDbPhotos()
    await loadStats()
  }
}

const handleSearch = () => {
  page.value = 1
  if (dataSource.value === 'cos') {
    loadCosPhotos()
  } else {
    loadDbPhotos()
  }
}

const handlePageChange = () => {
  if (dataSource.value === 'cos') {
    loadCosPhotos()
  } else {
    loadDbPhotos()
  }
}

const handleDelete = async (photo) => {
  try {
    await ElMessageBox.confirm('确定要删除这张照片吗？此操作不可恢复', '警告', {
      type: 'warning'
    })
    const res = await photosApi.delete(photo.photo_id || photo.id)
    if (res.code === 200 || res.code === 0) {
      ElMessage.success('删除成功')
      loadDbPhotos()
      loadStats()
    }
  } catch {
    // 取消
  }
}

// 查看用户照片详情
const viewUserDetail = async (userId) => {
  try {
    const res = await photosApi.getCosUserPhotos(userId)
    if (res.code === 200 || res.code === 0) {
      selectedUserDetail.value = res.data
      showUserDetail.value = true
    }
  } catch (error) {
    ElMessage.error('获取用户照片失败')
  }
}

onMounted(async () => {
  await checkCosStatus()
  if (dataSource.value === 'cos') {
    await loadCosUsers()
    await loadCosPhotos()
  } else {
    await loadDbPhotos()
    await loadStats()
  }
})
</script>

<style lang="scss" scoped>
.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.user-id-hint {
  font-size: 11px;
  color: #999;
  margin-left: 8px;
}

.stats-summary {
  display: flex;
  gap: 40px;
  padding: 16px 0;
  margin-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .label {
      font-size: 12px;
      color: #999;
    }

    .value {
      font-size: 20px;
      font-weight: 600;
      color: #333;
    }
  }
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 12px;

  @media (max-width: 1600px) {
    grid-template-columns: repeat(6, 1fr);
  }

  @media (max-width: 1200px) {
    grid-template-columns: repeat(4, 1fr);
  }
}

.photo-item {
  background: #fff;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  .photo-img-wrap {
    position: relative;
    padding-bottom: 100%; // 1:1 正方形
    overflow: hidden;

    .photo-img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: block;
    }

    .type-tag {
      position: absolute;
      top: 8px;
      left: 8px;
    }

    .scene-tag {
      position: absolute;
      top: 8px;
      left: 60px;
    }

    .delete-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    &:hover .delete-btn {
      opacity: 1;
    }
  }

  .image-error {
    width: 100%;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f5f5;
    color: #ccc;
    font-size: 24px;
  }

  .photo-info {
    padding: 8px;

    .info-row {
      display: flex;
      gap: 4px;
      margin-bottom: 4px;
      line-height: 1.2;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .file-size, .user-id, .time {
      font-size: 11px;
      color: #999;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

.user-detail {
  .detail-stats {
    display: flex;
    gap: 40px;
    margin-bottom: 24px;
  }

  .records-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    max-height: 500px;
    overflow-y: auto;

    @media (max-width: 1200px) {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .record-item {
    background: #f9f9f9;
    border-radius: 8px;
    padding: 12px;

    .record-images {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;

      .image-box {
        flex: 1;
        position: relative;

        .image-label {
          position: absolute;
          top: 4px;
          left: 4px;
          background: rgba(0, 0, 0, 0.5);
          color: white;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          z-index: 1;
        }

        .el-image {
          width: 100%;
          height: 100px;
          border-radius: 4px;
        }

        .no-image {
          width: 100%;
          height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #eee;
          color: #999;
          border-radius: 4px;
        }
      }

      .arrow-icon {
        color: #999;
        font-size: 20px;
      }
    }

    .record-time {
      font-size: 12px;
      color: #999;
      text-align: center;
    }
  }
}
</style>
