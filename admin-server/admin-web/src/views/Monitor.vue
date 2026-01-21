<template>
  <div class="monitor-dashboard">
    <!-- 总体状态 -->
    <div class="overall-status" :class="overallStatus">
      <div class="status-indicator">
        <el-icon v-if="overallStatus === 'healthy'" class="status-icon"><CircleCheck /></el-icon>
        <el-icon v-else-if="overallStatus === 'warning'" class="status-icon"><Warning /></el-icon>
        <el-icon v-else class="status-icon"><CircleClose /></el-icon>
      </div>
      <div class="status-text">
        <span v-if="overallStatus === 'healthy'">所有服务运行正常</span>
        <span v-else-if="overallStatus === 'warning'">部分服务存在告警</span>
        <span v-else-if="overallStatus === 'critical'">有服务离线</span>
        <span v-else>正在检测...</span>
      </div>
      <div class="status-time">
        最后更新: {{ lastUpdate }}
        <el-button link type="primary" @click="loadStatus" :loading="loading">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
      <div class="quick-links">
        <el-button type="primary" @click="openPortainer">
          <el-icon><DataBoard /></el-icon> Portainer 容器管理
        </el-button>
      </div>
    </div>

    <!-- 服务状态卡片 -->
    <el-row :gutter="20" class="services-row">
      <el-col :xs="24" :sm="12" :md="8" v-for="service in services" :key="service.name">
        <div class="service-card" :class="service.status">
          <div class="service-header">
            <div class="service-icon">
              <el-icon v-if="service.name === 'miniprogram-api'"><Connection /></el-icon>
              <el-icon v-else-if="service.name === 'flashphoto-api'"><Monitor /></el-icon>
              <el-icon v-else><Setting /></el-icon>
            </div>
            <div class="service-status-badge" :class="service.status">
              {{ service.status === 'online' ? '在线' : service.status === 'offline' ? '离线' : '超时' }}
            </div>
          </div>
          <div class="service-name">{{ service.displayName }}</div>
          <div class="service-port">端口 :{{ service.port }}</div>
          
          <div class="service-metrics">
            <div class="metric">
              <span class="metric-label">运行时间</span>
              <span class="metric-value">{{ service.uptimeFormatted || '-' }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">内存使用</span>
              <span class="metric-value">{{ service.memory?.heapUsed || 0 }} MB</span>
            </div>
            <div class="metric">
              <span class="metric-label">响应时间</span>
              <span class="metric-value">{{ service.responseTime || '-' }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">重启次数</span>
              <span class="metric-value">{{ service.restarts ?? '-' }}</span>
            </div>
          </div>

          <div class="service-actions">
            <el-button size="small" type="warning" @click="restartService(service.name)" :loading="restartingService === service.name">
              <el-icon><Refresh /></el-icon> 重启
            </el-button>
          </div>
        </div>
      </el-col>

      <!-- Nginx 状态卡片 -->
      <el-col :xs="24" :sm="12" :md="8">
        <div class="service-card nginx-card" :class="nginx.status === 'running' ? 'online' : 'offline'">
          <div class="service-header">
            <div class="service-icon nginx">
              <el-icon><Operation /></el-icon>
            </div>
            <div class="service-status-badge" :class="nginx.status === 'running' ? 'online' : 'offline'">
              {{ nginx.status === 'running' ? '运行中' : '异常' }}
            </div>
          </div>
          <div class="service-name">Nginx 反向代理</div>
          <div class="service-port">端口 :80/443</div>
          
          <div class="service-metrics">
            <div class="metric">
              <span class="metric-label">版本</span>
              <span class="metric-value">{{ nginx.version || '-' }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">配置状态</span>
              <span class="metric-value">{{ nginx.configValid ? '✓ 有效' : '✗ 无效' }}</span>
            </div>
          </div>
        </div>
      </el-col>

      <!-- Portainer 容器管理卡片 -->
      <el-col :xs="24" :sm="12" :md="8">
        <div class="service-card portainer-card online" @click="openPortainer">
          <div class="service-header">
            <div class="service-icon portainer">
              <el-icon><DataBoard /></el-icon>
            </div>
            <div class="service-status-badge external">
              外部链接
            </div>
          </div>
          <div class="service-name">Portainer 容器管理</div>
          <div class="service-port">Docker 可视化管理面板</div>
          
          <div class="service-metrics">
            <div class="metric full-width">
              <span class="metric-label">功能说明</span>
              <span class="metric-value">实时监控 Docker 容器状态、日志、资源使用</span>
            </div>
          </div>
          
          <div class="service-actions">
            <el-button type="primary" @click.stop="openPortainer">
              <el-icon><Link /></el-icon> 打开 Portainer
            </el-button>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 系统资源和数据库 -->
    <el-row :gutter="20" class="system-row">
      <!-- 系统资源 -->
      <el-col :xs="24" :md="12">
        <div class="page-card">
          <div class="card-header">
            <span class="card-title">系统资源</span>
          </div>
          <div class="card-body">
            <div class="resource-item">
              <div class="resource-label">
                <el-icon><Cpu /></el-icon> CPU 使用率
              </div>
              <el-progress :percentage="system.cpu?.usage || 0" :color="getProgressColor(system.cpu?.usage)" />
              <span class="resource-detail">{{ system.cpu?.cores || 0 }} 核心 / {{ system.cpu?.model || '-' }}</span>
            </div>
            <div class="resource-item">
              <div class="resource-label">
                <el-icon><Coin /></el-icon> 内存使用
              </div>
              <el-progress :percentage="system.memory?.usagePercent || 0" :color="getProgressColor(system.memory?.usagePercent)" />
              <span class="resource-detail">{{ system.memory?.used || 0 }} MB / {{ system.memory?.total || 0 }} MB</span>
            </div>
            <div class="resource-item">
              <div class="resource-label">
                <el-icon><Clock /></el-icon> 系统运行时间
              </div>
              <span class="resource-value">{{ system.uptimeFormatted || '-' }}</span>
            </div>
            <div class="resource-item">
              <div class="resource-label">
                <el-icon><Platform /></el-icon> 服务器信息
              </div>
              <span class="resource-value">{{ system.hostname }} / {{ system.platform }} {{ system.arch }}</span>
            </div>
          </div>
        </div>
      </el-col>

      <!-- 数据库状态 -->
      <el-col :xs="24" :md="12">
        <div class="page-card">
          <div class="card-header">
            <span class="card-title">数据库状态</span>
            <el-tag :type="database.status === 'connected' ? 'success' : 'danger'" size="small">
              {{ database.status === 'connected' ? '已连接' : '断开' }}
            </el-tag>
          </div>
          <div class="card-body">
            <div class="db-info">
              <div class="db-item">
                <span class="db-label">数据库大小</span>
                <span class="db-value">{{ database.size || '-' }}</span>
              </div>
              <div class="db-item">
                <span class="db-label">用户数量</span>
                <span class="db-value">{{ database.stats?.users || 0 }}</span>
              </div>
              <div class="db-item">
                <span class="db-label">照片数量</span>
                <span class="db-value">{{ database.stats?.photos || 0 }}</span>
              </div>
              <div class="db-item">
                <span class="db-label">订单数量</span>
                <span class="db-value">{{ database.stats?.orders || 0 }}</span>
              </div>
            </div>
            <div class="db-path">
              <el-icon><Folder /></el-icon>
              <span>{{ database.path || '-' }}</span>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 最近日志 -->
    <div class="page-card logs-card">
      <div class="card-header">
        <span class="card-title">最近日志</span>
        <el-button size="small" @click="loadLogs" :loading="loadingLogs">
          <el-icon><Refresh /></el-icon> 刷新
        </el-button>
      </div>
      <div class="card-body">
        <div class="logs-container">
          <div v-for="(log, index) in logs" :key="index" class="log-line" :class="getLogLevel(log)">
            {{ log }}
          </div>
          <div v-if="logs.length === 0" class="no-logs">暂无日志</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck, Warning, CircleClose, Refresh, Connection, Monitor,
  Setting, Operation, Cpu, Coin, Clock, Platform, Folder, DataBoard, Link
} from '@element-plus/icons-vue'
import api from '../api'

// 状态数据
const loading = ref(false)
const loadingLogs = ref(false)
const overallStatus = ref('unknown')
const lastUpdate = ref('-')
const services = ref([])
const nginx = ref({})
const system = ref({})
const database = ref({})
const logs = ref([])
const restartingService = ref(null)

// Portainer 配置 - 可以根据实际部署情况修改
const portainerUrl = ref('https://pop-pub.com:9443') // 默认 Portainer HTTPS 端口

// 自动刷新定时器
let refreshTimer = null

// 加载监控状态
const loadStatus = async () => {
  loading.value = true
  try {
    const res = await api.get('/monitor/status')
    if (res.code === 0) {
      overallStatus.value = res.overallStatus
      services.value = res.services || []
      nginx.value = res.nginx || {}
      system.value = res.system || {}
      database.value = res.database || {}
      lastUpdate.value = new Date().toLocaleTimeString()
    }
  } catch (error) {
    console.error('加载监控状态失败:', error)
    overallStatus.value = 'critical'
  } finally {
    loading.value = false
  }
}

// 加载日志
const loadLogs = async () => {
  loadingLogs.value = true
  try {
    const res = await api.get('/monitor/logs', { params: { lines: 30 } })
    if (res.code === 0) {
      logs.value = res.logs || []
    }
  } catch (error) {
    console.error('加载日志失败:', error)
  } finally {
    loadingLogs.value = false
  }
}

// 重启服务
const restartService = async (serviceName) => {
  try {
    await ElMessageBox.confirm(
      `确定要重启服务 ${serviceName} 吗？这可能会导致短暂的服务中断。`,
      '重启确认',
      { type: 'warning' }
    )
    
    restartingService.value = serviceName
    const res = await api.post(`/monitor/restart/${serviceName}`)
    if (res.code === 0) {
      ElMessage.success(`服务 ${serviceName} 重启成功`)
      // 等待服务重启后刷新状态
      setTimeout(loadStatus, 3000)
    } else {
      ElMessage.error(res.error || '重启失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('重启服务失败')
    }
  } finally {
    restartingService.value = null
  }
}

// 获取进度条颜色
const getProgressColor = (percent) => {
  if (percent >= 90) return '#f56c6c'
  if (percent >= 70) return '#e6a23c'
  return '#67c23a'
}

// 获取日志级别
const getLogLevel = (log) => {
  if (log.includes('error') || log.includes('Error') || log.includes('ERROR')) return 'error'
  if (log.includes('warn') || log.includes('Warning') || log.includes('WARN')) return 'warn'
  return 'info'
}

// 打开 Portainer
const openPortainer = () => {
  window.open(portainerUrl.value, '_blank')
}

onMounted(() => {
  loadStatus()
  loadLogs()
  // 每10秒自动刷新
  refreshTimer = setInterval(loadStatus, 10000)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})
</script>

<style scoped>
.monitor-dashboard {
  padding: 20px;
}

/* 总体状态 */
.overall-status {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-radius: 12px;
  margin-bottom: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.overall-status.healthy {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
}

.overall-status.warning {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.overall-status.critical {
  background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
}

.status-indicator {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-icon {
  font-size: 28px;
}

.status-text {
  flex: 1;
  font-size: 20px;
  font-weight: 600;
}

.status-time {
  font-size: 14px;
  opacity: 0.9;
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-time .el-button {
  color: white;
}

/* 服务卡片 */
.services-row {
  margin-bottom: 24px;
  display: flex;
  flex-wrap: wrap;
}

.services-row > .el-col {
  display: flex;
}

.service-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  border-left: 4px solid #909399;
  transition: all 0.3s;
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 260px;
}

.service-card.online {
  border-left-color: #67c23a;
}

.service-card.offline {
  border-left-color: #f56c6c;
}

.service-card.timeout {
  border-left-color: #e6a23c;
}

.service-card.nginx-card .service-metrics {
  flex: 1;
}

.service-card .service-actions {
  margin-top: auto;
  padding-top: 16px;
}

.service-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.service-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
}

.service-icon.nginx {
  background: linear-gradient(135deg, #009688 0%, #4caf50 100%);
}

.service-icon.portainer {
  background: linear-gradient(135deg, #13BEF9 0%, #0075FF 100%);
}

.portainer-card {
  cursor: pointer;
  border-left-color: #13BEF9 !important;
  transition: transform 0.2s, box-shadow 0.2s;
}

.portainer-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(19, 190, 249, 0.25);
}

.service-status-badge.external {
  background: linear-gradient(135deg, #13BEF9 0%, #0075FF 100%);
  color: white;
}

.metric.full-width {
  grid-column: span 2;
}

.quick-links {
  margin-left: 16px;
}

.service-status-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.service-status-badge.online {
  background: #e8f5e9;
  color: #2e7d32;
}

.service-status-badge.offline {
  background: #ffebee;
  color: #c62828;
}

.service-status-badge.timeout {
  background: #fff3e0;
  color: #e65100;
}

.service-name {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.service-port {
  font-size: 13px;
  color: #909399;
  margin-bottom: 16px;
}

.service-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  flex: 1;
}

.metric {
  display: flex;
  flex-direction: column;
}

.metric-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 2px;
}

.metric-value {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

/* 系统资源卡片 */
.page-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.card-body {
  padding: 20px;
}

.resource-item {
  margin-bottom: 20px;
}

.resource-item:last-child {
  margin-bottom: 0;
}

.resource-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
  margin-bottom: 8px;
}

.resource-detail {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.resource-value {
  font-size: 14px;
  color: #303133;
}

/* 数据库信息 */
.db-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.db-item {
  display: flex;
  flex-direction: column;
}

.db-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.db-value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.db-path {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
  font-size: 12px;
  color: #606266;
  word-break: break-all;
}

/* 日志 */
.logs-card .card-body {
  padding: 0;
}

.logs-container {
  max-height: 300px;
  overflow-y: auto;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  background: #1e1e1e;
  padding: 16px;
  border-radius: 0 0 12px 12px;
}

.log-line {
  padding: 4px 0;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-line.error {
  color: #f56c6c;
}

.log-line.warn {
  color: #e6a23c;
}

.no-logs {
  text-align: center;
  color: #909399;
  padding: 40px 0;
}
</style>
