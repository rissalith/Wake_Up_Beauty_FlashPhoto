import { defineStore } from 'pinia'
import { authApi } from '../api'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('admin_token') || '',
    adminInfo: JSON.parse(localStorage.getItem('admin_info') || 'null')
  }),

  getters: {
    isLoggedIn: (state) => !!state.token
  },

  actions: {
    async login(credentials) {
      const res = await authApi.login(credentials)
      if (res.code === 0 || res.code === 200) {
        this.token = res.data.token
        this.adminInfo = {
          id: res.data.adminId,
          username: res.data.username,
          role: res.data.role
        }
        localStorage.setItem('admin_token', res.data.token)
        localStorage.setItem('admin_info', JSON.stringify(this.adminInfo))
      }
      return res
    },

    async getInfo() {
      const res = await authApi.getInfo()
      if (res.code === 0 || res.code === 200) {
        this.adminInfo = res.data
      }
      return res
    },

    async logout() {
      try {
        await authApi.logout()
      } finally {
        this.token = ''
        this.adminInfo = null
        localStorage.removeItem('admin_token')
        localStorage.removeItem('admin_info')
      }
    }
  }
})
