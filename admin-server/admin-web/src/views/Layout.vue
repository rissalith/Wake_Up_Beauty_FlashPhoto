<template>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <div class="logo">
        <h1>醒美闪图</h1>
      </div>
      <el-menu
        :default-active="route.path"
        router
        :collapse="false"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataLine /></el-icon>
          <span>仪表盘</span>
        </el-menu-item>
        <el-menu-item index="/users">
          <el-icon><User /></el-icon>
          <span>用户管理</span>
        </el-menu-item>
        <el-menu-item index="/orders">
          <el-icon><List /></el-icon>
          <span>订单管理</span>
        </el-menu-item>
        <el-menu-item index="/photos">
          <el-icon><Picture /></el-icon>
          <span>照片管理</span>
        </el-menu-item>
        <el-menu-item index="/points">
          <el-icon><Coin /></el-icon>
          <span>醒币管理</span>
        </el-menu-item>
        <el-menu-item index="/feedbacks">
          <el-icon><ChatDotRound /></el-icon>
          <span>意见反馈</span>
        </el-menu-item>

        <el-divider style="margin: 10px 15px; border-color: rgba(255,255,255,0.1);" />
        <div style="padding: 0 20px; color: #999; font-size: 12px; margin-bottom: 5px;">中台管理</div>

        <el-menu-item index="/scenes">
          <el-icon><Grid /></el-icon>
          <span>场景管理</span>
        </el-menu-item>
        <el-menu-item index="/grade-schemes">
          <el-icon><Medal /></el-icon>
          <span>品级方案</span>
        </el-menu-item>
        <el-menu-item index="/assets">
          <el-icon><FolderOpened /></el-icon>
          <span>素材管理</span>
        </el-menu-item>

        <el-divider style="margin: 10px 15px; border-color: rgba(255,255,255,0.1);" />
        <div style="padding: 0 20px; color: #999; font-size: 12px; margin-bottom: 5px;">系统管理</div>

        <el-menu-item index="/monitor">
          <el-icon><Monitor /></el-icon>
          <span>服务监控</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <main class="admin-main">
      <header class="admin-header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <span class="admin-name">{{ userStore.adminInfo?.username || 'admin' }}</span>
          <el-dropdown @command="handleCommand">
            <el-button circle>
              <el-icon><Setting /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <div class="admin-content">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useUserStore } from '../store'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

onMounted(() => {
  userStore.getInfo()
})

const handleCommand = async (command) => {
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        type: 'warning'
      })
      await userStore.logout()
      router.push('/login')
    } catch {
      // 取消
    }
  }
}
</script>

<style lang="scss" scoped>
.admin-name {
  font-size: 14px;
  color: #666;
}

.el-menu-item {
  &.is-active {
    background: linear-gradient(90deg, rgba(232, 182, 134, 0.1) 0%, transparent 100%);
    border-right: 3px solid #E8B686;
  }
}
</style>
