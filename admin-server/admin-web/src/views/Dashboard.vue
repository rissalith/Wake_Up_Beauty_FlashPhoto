<template>
  <div class="dashboard">
    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stat-row">
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon users">
            <el-icon><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-title">用户总数</div>
            <div class="stat-value">{{ overview.users?.total || 0 }}</div>
            <div class="stat-sub">今日新增 {{ overview.users?.today || 0 }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon orders">
            <el-icon><List /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-title">醒币充值</div>
            <div class="stat-value">{{ overview.points?.total || 0 }}</div>
            <div class="stat-sub">今日充值 {{ overview.points?.todayRecharge || 0 }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon revenue">
            <el-icon><Money /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-title">邀请人数</div>
            <div class="stat-value">{{ overview.invites?.total || 0 }}</div>
            <div class="stat-sub">今日邀请 {{ overview.invites?.today || 0 }}</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon photos">
            <el-icon><Picture /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-title">照片生成数</div>
            <div class="stat-value">{{ overview.photos?.total || 0 }}</div>
            <div class="stat-sub">今日生成 {{ overview.photos?.today || 0 }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-row :gutter="20" class="chart-row">
      <el-col :span="16">
        <div class="page-card">
          <div class="card-header">
            <span class="card-title">收入趋势</span>
            <el-radio-group v-model="chartPeriod" size="small" @change="loadRevenue">
              <el-radio-button label="day">近7天</el-radio-button>
              <el-radio-button label="month">近12月</el-radio-button>
            </el-radio-group>
          </div>
          <div class="chart-container">
            <v-chart :option="revenueChartOption" autoresize />
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="page-card">
          <div class="card-header">
            <span class="card-title">醒币获取来源</span>
          </div>
          <div class="chart-container">
            <v-chart :option="pointsSourceChartOption" autoresize />
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { statsApi } from '../api'

use([CanvasRenderer, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent])

const overview = ref({})
const revenueData = ref([])
const pointsSources = ref([])
const chartPeriod = ref('day')

// 类型名称映射
const typeNameMap = {
  new_user: '新用户注册',
  share_image: '分享图片',
  invite_friend: '邀请好友',
  invite_reward: '邀请奖励',
  recharge: '充值',
  virtual_recharge: '虚拟充值',
  admin_adjust: '系统调整',
  admin_add: '管理员调整',
  reward: '打赏',
  feedback_reward: '打赏',
  consume: '消费',
  '打赏': '打赏'
}

const getTypeName = (type) => typeNameMap[type] || type

// 饼图颜色
const pieColors = ['#E8B686', '#667eea', '#f5576c', '#4facfe', '#84fab0', '#a18cd1']

const formatMoney = (val) => {
  return (val || 0).toFixed(2)
}

const revenueChartOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: {
    type: 'category',
    data: revenueData.value.map(item => item.date || item.month || item.week),
    axisLine: { lineStyle: { color: '#ddd' } },
    axisLabel: { color: '#666' }
  },
  yAxis: {
    type: 'value',
    axisLine: { show: false },
    splitLine: { lineStyle: { color: '#f0f0f0' } }
  },
  series: [{
    name: '收入',
    type: 'line',
    smooth: true,
    data: revenueData.value.map(item => item.revenue || 0),
    areaStyle: {
      color: {
        type: 'linear',
        x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(232, 182, 134, 0.3)' },
          { offset: 1, color: 'rgba(232, 182, 134, 0.05)' }
        ]
      }
    },
    lineStyle: { color: '#E8B686', width: 2 },
    itemStyle: { color: '#E8B686' }
  }]
}))

const pointsSourceChartOption = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: (params) => `${params.name}: ${params.value} 醒币 (${params.percent}%)`
  },
  legend: { bottom: '5%', left: 'center' },
  series: [{
    type: 'pie',
    radius: ['40%', '70%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
    label: { show: false },
    emphasis: {
      label: { show: true, fontSize: 14 }
    },
    data: pointsSources.value.map((item, index) => ({
      value: item.total || 0,
      name: getTypeName(item.type),
      itemStyle: { color: pieColors[index % pieColors.length] }
    }))
  }]
}))

const loadOverview = async () => {
  try {
    const res = await statsApi.getOverview()
    if (res.code === 0 || res.code === 200) {
      overview.value = res.data
      // 加载醒币获取来源
      pointsSources.value = res.data.pointsSources || []
    }
  } catch (error) {
    console.error(error)
  }
}

const loadRevenue = async () => {
  try {
    const res = await statsApi.getRevenue({ period: chartPeriod.value })
    if (res.code === 0 || res.code === 200) {
      revenueData.value = res.data || []
    }
  } catch (error) {
    console.error('加载收入趋势失败:', error)
    revenueData.value = []
  }
}

onMounted(() => {
  loadOverview()
  loadRevenue()
})
</script>

<style lang="scss" scoped>
.dashboard {
  .stat-row {
    margin-bottom: 20px;
  }

  .stat-card {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);

    .stat-icon {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;

      .el-icon {
        font-size: 28px;
        color: #fff;
      }

      &.users { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
      &.orders { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
      &.revenue { background: linear-gradient(135deg, #F5D0A9 0%, #E8B686 100%); }
      &.photos { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
    }

    .stat-info {
      flex: 1;

      .stat-title {
        font-size: 14px;
        color: #999;
        margin-bottom: 8px;
      }

      .stat-value {
        font-size: 24px;
        font-weight: 600;
        color: #333;
      }

      .stat-sub {
        font-size: 12px;
        color: #999;
        margin-top: 4px;
      }
    }
  }

  .chart-row {
    .page-card {
      height: 400px;
    }
  }

  .chart-container {
    height: 320px;
  }
}
</style>
