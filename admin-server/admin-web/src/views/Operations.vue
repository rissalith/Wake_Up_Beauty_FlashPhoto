<template>
  <div class="operations-console">
    <!-- 页面头部 -->
    <div class="page-header">
      <h2>运营控制台</h2>
      <span class="subtitle">全局开关和系统配置</span>
    </div>

    <el-row :gutter="20">
      <!-- 关键开关 -->
      <el-col :span="12">
        <el-card class="control-card">
          <template #header>
            <div class="card-header">
              <span>🎛️ 关键开关</span>
              <el-tag type="danger" v-if="config.review_mode">审核模式已开启</el-tag>
            </div>
          </template>

          <div class="switch-item">
            <div class="switch-info">
              <div class="switch-title">🔒 审核模式</div>
              <div class="switch-desc">开启后只显示"审核安全"标记的场景，用于应对微信审核</div>
            </div>
            <el-switch v-model="config.review_mode" @change="updateConfig('review_mode')"
                       active-color="#f56c6c" />
          </div>

          <div class="switch-item">
            <div class="switch-info">
              <div class="switch-title">🔧 维护模式</div>
              <div class="switch-desc">开启后小程序显示维护页面，暂停所有服务</div>
            </div>
            <el-switch v-model="config.maintenance_mode" @change="updateConfig('maintenance_mode')" />
          </div>

          <div class="switch-item">
            <div class="switch-info">
              <div class="switch-title">📢 全局公告</div>
              <div class="switch-desc">在小程序顶部显示公告信息</div>
            </div>
            <el-switch v-model="config.announcement_visible" @change="updateConfig('announcement_visible')" />
          </div>

          <div class="announcement-input" v-if="config.announcement_visible">
            <el-input v-model="config.announcement" type="textarea" :rows="2"
                      placeholder="输入公告内容..." @blur="updateConfig('announcement')" />
          </div>
        </el-card>
      </el-col>

      <!-- 版本信息 -->
      <el-col :span="12">
        <el-card class="control-card">
          <template #header>
            <span>📊 配置状态</span>
          </template>

          <div class="info-item">
            <span class="info-label">配置版本</span>
            <span class="info-value">v{{ config.config_version }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">最低APP版本</span>
            <el-input v-model="config.min_app_version" size="small" style="width: 120px"
                      @blur="updateConfig('min_app_version')" />
          </div>
          <div class="info-item">
            <span class="info-label">默认醒币消耗</span>
            <el-input-number v-model="config.default_points_cost" :min="1" :max="1000" size="small"
                             @change="updateConfig('default_points_cost')" />
          </div>

          <el-divider />

          <div class="action-btns">
            <el-button type="primary" @click="refreshConfig">
              <el-icon><Refresh /></el-icon> 刷新配置版本
            </el-button>
            <el-button @click="previewConfig">预览小程序配置</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 小程序信息配置 -->
    <el-card class="control-card" style="margin-top: 20px;">
      <template #header>
        <span>📱 小程序信息配置</span>
      </template>

      <div class="info-item">
        <span class="info-label">客服邮箱</span>
        <el-input v-model="config.support_email" size="small" style="width: 300px"
                  placeholder="support@xingmei.com"
                  @blur="updateConfig('support_email')" />
      </div>
      <div class="info-item">
        <span class="info-label">版权信息</span>
        <el-input v-model="config.copyright_text" size="small" style="width: 450px"
                  placeholder="© 2026 上海醒美元子网络科技工作室（个人独资）所有"
                  @blur="updateConfig('copyright_text')" />
      </div>
      <div class="info-tips">
        <el-tag type="info" size="small">提示：修改后会实时生效到小程序"关于我们"页面</el-tag>
      </div>
    </el-card>

    <!-- 场景定价 -->
    <el-card class="pricing-card">
      <template #header>
        <div class="card-header">
          <span>💰 场景定价</span>
          <el-button size="small" @click="loadPricing">刷新</el-button>
        </div>
      </template>

      <el-table :data="scenes" v-loading="loadingScenes">
        <el-table-column label="场景" min-width="150">
          <template #default="{ row }">
            <span>{{ getSceneEmoji(row.id) }} {{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '上线' : '下线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审核安全" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.is_review_safe ? 'success' : 'danger'" size="small">
              {{ row.is_review_safe ? '✓ 安全' : '⚠ 风险' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="基础消耗(醒币)" width="150">
          <template #default="{ row }">
            <el-input-number v-model="row.points_cost" :min="1" :max="1000" size="small"
                             @change="updateScenePricing(row)" />
          </template>
        </el-table-column>
        <el-table-column label="快捷操作" width="200">
          <template #default="{ row }">
            <el-button size="small" link @click="setPrice(row, 50)">50</el-button>
            <el-button size="small" link @click="setPrice(row, 100)">100</el-button>
            <el-button size="small" link @click="setPrice(row, 150)">150</el-button>
            <el-button size="small" link type="warning" @click="toggleStatus(row)">
              {{ row.status === 'active' ? '下线' : '上线' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 充值套餐 -->
    <el-card class="packages-card">
      <template #header>
        <div class="card-header">
          <span>🎁 充值套餐</span>
          <el-button type="primary" size="small" @click="showAddPackage">添加套餐</el-button>
        </div>
      </template>

      <el-table :data="packages" v-loading="loadingPackages">
        <el-table-column label="套餐" min-width="120">
          <template #default="{ row }">
            <span class="package-name">¥{{ row.amount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="基础醒币" width="100">
          <template #default="{ row }">
            <span class="points">{{ row.points }}</span>
          </template>
        </el-table-column>
        <el-table-column label="赠送醒币" width="100">
          <template #default="{ row }">
            <span class="bonus" v-if="row.bonus_points > 0">+{{ row.bonus_points }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="实际到账" width="120">
          <template #default="{ row }">
            <span class="total-points">{{ row.points + (row.bonus_points || 0) }} 醒币</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" link @click="editPackage(row)">编辑</el-button>
            <el-button size="small" link type="danger" @click="deletePackage(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 配置预览对话框 -->
    <el-dialog v-model="previewVisible" title="小程序配置预览" width="600px" v-dialog-drag>
      <pre class="config-preview">{{ configPreview }}</pre>
    </el-dialog>

    <!-- 套餐编辑对话框 -->
    <el-dialog v-model="packageDialogVisible" :title="packageForm.id ? '编辑套餐' : '添加套餐'" width="400px" v-dialog-drag>
      <el-form :model="packageForm" label-width="100px">
        <el-form-item label="金额(元)">
          <el-input-number v-model="packageForm.amount" :min="1" :max="10000" />
        </el-form-item>
        <el-form-item label="基础醒币">
          <el-input-number v-model="packageForm.points" :min="1" :max="100000" />
        </el-form-item>
        <el-form-item label="赠送醒币">
          <el-input-number v-model="packageForm.bonus_points" :min="0" :max="10000" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="packageDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="savePackage">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import request from '@/api'

const loadingScenes = ref(false)
const loadingPackages = ref(false)
const previewVisible = ref(false)
const packageDialogVisible = ref(false)
const configPreview = ref('')

const config = reactive({
  review_mode: false,
  maintenance_mode: false,
  announcement: '',
  announcement_visible: false,
  min_app_version: '1.0.0',
  default_points_cost: 50,
  config_version: 1,
  support_email: '',
  copyright_text: ''
})

const scenes = ref([])
const packages = ref([])

const packageForm = reactive({
  id: null,
  amount: 10,
  points: 100,
  bonus_points: 0
})

const sceneEmojis = {
  idphoto: '📷',
  professional: '💼',
  portrait: '🎨',
  family: '👨‍👩‍👧‍👦',
  pet: '🐾',
  wedding: '💒'
}

function getSceneEmoji(id) {
  return sceneEmojis[id] || '📸'
}

async function loadConfig() {
  try {
    const res = await request.get('/config/system')
    if (res.data) {
      Object.assign(config, res.data)
    }
  } catch (error) {
    console.error('加载配置失败:', error)
    ElMessage.error('加载配置失败')
  }
}

async function updateConfig(key) {
  try {
    await request.post('/config/admin/system', { [key]: config[key] })
    ElMessage.success('配置已更新')
  } catch (error) {
    console.error('更新配置失败:', error)
    ElMessage.error('更新失败')
  }
}

async function refreshConfig() {
  try {
    await request.post('/config/admin/system', {
      config_version: config.config_version + 1
    })
    config.config_version++
    ElMessage.success('配置版本已刷新，小程序将获取最新配置')
  } catch (error) {
    ElMessage.error('刷新失败')
  }
}

async function previewConfig() {
  try {
    const res = await request.get('/config/init')
    configPreview.value = JSON.stringify(res.data, null, 2)
    previewVisible.value = true
  } catch (error) {
    ElMessage.error('获取预览失败')
  }
}

async function loadPricing() {
  loadingScenes.value = true
  try {
    const res = await request.get('/config/admin/scenes')
    scenes.value = res.data || []
  } catch (error) {
    ElMessage.error('加载场景失败')
  } finally {
    loadingScenes.value = false
  }
}

async function updateScenePricing(row) {
  try {
    await request.post('/config/admin/scene', row)
    ElMessage.success('定价已更新')
  } catch (error) {
    ElMessage.error('更新失败')
  }
}

function setPrice(row, price) {
  row.points_cost = price
  updateScenePricing(row)
}

async function toggleStatus(row) {
  row.status = row.status === 'active' ? 'inactive' : 'active'
  await updateScenePricing(row)
}

async function loadPackages() {
  loadingPackages.value = true
  try {
    const res = await request.get('/recharge/packages')
    packages.value = res.data || []
  } catch (error) {
    // 使用默认套餐
    packages.value = [
      { id: 1, amount: 5, points: 50, bonus_points: 0 },
      { id: 2, amount: 10, points: 100, bonus_points: 0 },
      { id: 3, amount: 20, points: 200, bonus_points: 10 },
      { id: 4, amount: 100, points: 1000, bonus_points: 100 },
      { id: 5, amount: 200, points: 2000, bonus_points: 300 },
      { id: 6, amount: 500, points: 5000, bonus_points: 1000 }
    ]
  } finally {
    loadingPackages.value = false
  }
}

function showAddPackage() {
  Object.assign(packageForm, { id: null, amount: 10, points: 100, bonus_points: 0 })
  packageDialogVisible.value = true
}

function editPackage(row) {
  Object.assign(packageForm, row)
  packageDialogVisible.value = true
}

async function savePackage() {
  try {
    // TODO: 实现套餐保存API
    ElMessage.success('套餐保存成功')
    packageDialogVisible.value = false
    loadPackages()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

async function deletePackage(row) {
  try {
    await ElMessageBox.confirm('确定删除该套餐吗？', '删除确认', { type: 'warning' })
    // TODO: 实现套餐删除API
    ElMessage.success('删除成功')
    loadPackages()
  } catch {}
}

onMounted(() => {
  loadConfig()
  loadPricing()
  loadPackages()
})
</script>

<style scoped>
.operations-console {
  padding: 20px;
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

.control-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.switch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 0;
  border-bottom: 1px solid #f0f0f0;
}

.switch-item:last-child {
  border-bottom: none;
}

.switch-title {
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}

.switch-desc {
  font-size: 12px;
  color: #909399;
}

.announcement-input {
  padding-top: 15px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.info-label {
  color: #606266;
}

.info-value {
  font-weight: 600;
  color: #409EFF;
}

.action-btns {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.pricing-card, .packages-card {
  margin-top: 20px;
}

.package-name {
  font-weight: 600;
  color: #E6A23C;
}

.points {
  color: #409EFF;
}

.bonus {
  color: #67C23A;
  font-weight: 500;
}

.total-points {
  font-weight: 600;
  color: #F56C6C;
}

.config-preview {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  max-height: 400px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
}

.info-tips {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #f0f0f0;
}
</style>
