import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录' }
  },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '仪表盘' }
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('../views/Users.vue'),
        meta: { title: '用户管理' }
      },
      {
        path: 'orders',
        name: 'Orders',
        component: () => import('../views/Orders.vue'),
        meta: { title: '订单管理' }
      },
      {
        path: 'photos',
        name: 'Photos',
        component: () => import('../views/Photos.vue'),
        meta: { title: '照片管理' }
      },
      {
        path: 'points',
        name: 'Points',
        component: () => import('../views/Points.vue'),
        meta: { title: '醒币管理' }
      },
      {
        path: 'feedbacks',
        name: 'Feedbacks',
        component: () => import('../views/Feedbacks.vue'),
        meta: { title: '意见反馈' }
      },
      {
        path: 'scenes',
        name: 'Scenes',
        component: () => import('../views/Scenes.vue'),
        meta: { title: '场景管理' }
      },
      {
        path: 'grade-schemes',
        name: 'GradeSchemes',
        component: () => import('../views/GradeSchemes.vue'),
        meta: { title: '品级方案' }
      },
      {
        path: 'assets',
        name: 'Assets',
        component: () => import('../views/Assets.vue'),
        meta: { title: '素材管理' }
      },
      {
        path: 'monitor',
        name: 'Monitor',
        component: () => import('../views/Monitor.vue'),
        meta: { title: '服务监控' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('admin_token')

  if (to.path !== '/login' && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/dashboard')
  } else {
    document.title = `${to.meta.title || '后台管理'} - 醒美闪图`
    next()
  }
})

export default router
