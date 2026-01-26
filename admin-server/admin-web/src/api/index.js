import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

// 不需要token的接口白名单
const whiteList = ['/auth/login']

// 请求拦截器
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('admin_token')
    // 白名单接口不携带token
    const isWhite = whiteList.some(url => config.url.includes(url))
    if (token && !isWhite) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  response => {
    return response.data
  },
  error => {
    const { response } = error
    if (response) {
      if (response.status === 401) {
        localStorage.removeItem('admin_token')
        router.push('/login')
        ElMessage.error('登录已过期，请重新登录')
      } else {
        ElMessage.error(response.data?.msg || response.data?.message || '请求失败')
      }
    } else {
      ElMessage.error('网络错误')
    }
    return Promise.reject(error)
  }
)

// 认证相关
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  logout: () => Promise.resolve({ code: 0 }),
  getInfo: () => Promise.resolve({ code: 0, data: JSON.parse(localStorage.getItem('admin_info') || '{}') }),
  changePassword: (data) => api.post('/admin/change-password', data)
}

// 用户管理
export const usersApi = {
  getList: (params) => api.get('/users', { params }),
  getDetail: (id) => api.get(`/users/${id}`),
  getOrders: (id, params) => api.get(`/users/${id}/orders`, { params }),
  getPhotos: (id, params) => api.get(`/users/${id}/photos`, { params }),
  getStats: (id) => api.get(`/users/${id}/stats`),
  getActivities: (id, params) => api.get(`/users/${id}/activities`, { params }),
  getBehaviors: (id, params) => api.get(`/users/${id}/behaviors`, { params }),
  getBehaviorStats: (id) => api.get(`/users/${id}/behavior-stats`),
  adjustPoints: (userId, data) => api.post(`/users/${userId}/adjust-points`, data),
  toggleStatus: (userId) => api.post(`/users/${userId}/toggle-status`),
  deleteUser: (userId) => api.delete(`/users/${userId}`),
  batchDeleteUsers: (userIds) => api.post('/users/batch-delete', { userIds })
}

// 照片管理
export const photosApi = {
  getList: (params) => api.get('/photos', { params }),
  getCosStatus: () => api.get('/photos/cos/status'),
  getCosPhotos: (params) => api.get('/photos/cos/list', { params }),
  getCosUsers: () => api.get('/photos/cos/users')
}

// 订单管理
export const ordersApi = {
  getList: (params) => api.get('/orders', { params }),
  getDetail: (id) => api.get(`/orders/${id}`),
  getStats: () => api.get('/orders/stats/summary')
}

// 醒币管理
export const pointsApi = {
  getRecords: (params) => api.get('/points/records', { params }),
  getBalance: (userId) => api.get(`/points/balance/${userId}`),
  getUserRecords: (userId, params) => api.get(`/points/records/${userId}`, { params }),
  getStats: () => api.get('/points/stats'),
  getPackages: () => api.get('/points/packages/all'),
  getRewards: () => api.get('/points/rewards/all'),
  createPackage: (data) => api.post('/points/packages', data),
  updatePackage: (id, data) => api.put(`/points/packages/${id}`, data),
  deletePackage: (id) => api.delete(`/points/packages/${id}`),
  updateReward: (type, data) => api.put(`/points/rewards/${type}`, data),
  adjustPoints: (data) => api.post('/points/adjust', data)
}

// 统计接口
export const statsApi = {
  getOverview: () => api.get('/stats/overview'),
  getDaily: (params) => api.get('/stats/daily', { params }),
  getRevenue: (params) => api.get('/stats/revenue', { params })
}

// 优惠券管理（后端暂无此接口）
export const couponsApi = {
  getStats: () => Promise.resolve({ code: 0, data: { totalUsed: 0, totalIssued: 0 } })
}

export default api
