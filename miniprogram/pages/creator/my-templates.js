// pages/creator/my-templates.js
// 我的模板页面 - 展示当前用户创建的模板，支持网格布局、筛选和搜索
const { api } = require('../../config/api')
const request = require('../../utils/request')

Page({
  data: {
    // 模板数据
    templates: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    total: 0,

    // 统计数据
    stats: {
      total: 0,
      draft: 0,
      reviewing: 0,
      pending: 0,
      active: 0,
      rejected: 0,
      offline: 0
    },

    // 搜索
    searchKeyword: '',
    searchFocused: false,

    // 状态筛选
    statusOptions: [
      { value: '', label: '全部' },
      { value: 'draft', label: '草稿' },
      { value: 'reviewing', label: '审核中' },
      { value: 'active', label: '已上架' },
      { value: 'rejected', label: '已拒绝' },
      { value: 'offline', label: '已下架' }
    ],
    currentStatus: '',

    // 布局
    statusBarHeight: 20
  },

  onLoad() {
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 20
    })

    this.loadStats()
    this.loadTemplates()
  },

  onShow() {
    // 页面显示时刷新数据
    this.loadStats()
    this.refreshTemplates()
  },

  onPullDownRefresh() {
    this.refreshTemplates().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMoreTemplates()
    }
  },

  // 加载统计数据
  async loadStats() {
    try {
      const userId = wx.getStorageSync('userId')
      if (!userId) return

      const res = await request.get('/api/template/creator/stats', { user_id: userId })
      if (res.code === 200) {
        this.setData({ stats: res.data })
      }
    } catch (error) {
      console.error('加载统计失败:', error)
    }
  },

  // 加载模板列表
  async loadTemplates() {
    if (this.data.loading) return

    const userId = wx.getStorageSync('userId')
    if (!userId) {
      this.setData({ loading: false })
      return
    }

    this.setData({ loading: true })

    try {
      const params = {
        user_id: userId,
        page: this.data.page,
        pageSize: this.data.pageSize
      }

      // 状态筛选
      if (this.data.currentStatus) {
        params.status = this.data.currentStatus
      }

      // 关键词搜索
      if (this.data.searchKeyword) {
        params.keyword = this.data.searchKeyword
      }

      const res = await request.get('/api/template/creator/my-templates', params)
      if (res.code === 200) {
        const templates = res.data.list || []
        this.setData({
          templates: this.data.page === 1 ? templates : [...this.data.templates, ...templates],
          hasMore: templates.length >= this.data.pageSize,
          total: res.data.total || templates.length
        })
      }
    } catch (error) {
      console.error('加载模板失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 刷新模板列表
  async refreshTemplates() {
    this.setData({ page: 1, hasMore: true, templates: [] })
    await this.loadTemplates()
  },

  // 加载更多
  async loadMoreTemplates() {
    this.setData({ page: this.data.page + 1 })
    await this.loadTemplates()
  },

  // 切换状态筛选
  onStatusChange(e) {
    const status = e.currentTarget.dataset.value
    if (status === this.data.currentStatus) return

    this.setData({
      currentStatus: status,
      page: 1,
      hasMore: true,
      templates: []
    })
    this.loadTemplates()
  },

  // 搜索相关
  onSearchFocus() {
    this.setData({ searchFocused: true })
  },

  onSearchBlur() {
    this.setData({ searchFocused: false })
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  onSearch() {
    this.setData({
      page: 1,
      hasMore: true,
      templates: []
    })
    this.loadTemplates()
  },

  onClearSearch() {
    this.setData({
      searchKeyword: '',
      page: 1,
      hasMore: true,
      templates: []
    })
    this.loadTemplates()
  },

  // 点击模板卡片 - 编辑
  onTemplateClick(e) {
    const { id, status } = e.currentTarget.dataset
    // 所有状态都跳转到 create-template 编辑页面
    wx.navigateTo({
      url: `/pages/creator/create-template?id=${id}`
    })
  },

  // 提交审核
  async submitForReview(e) {
    const { id } = e.currentTarget.dataset

    wx.showModal({
      title: '提交审核',
      content: '确定要提交审核吗？审核通过后将自动上架。',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '提交中...' })
            const userId = wx.getStorageSync('userId')
            const result = await request.post(`/api/template/${id}/submit`, { user_id: userId })
            wx.hideLoading()

            if (result.code === 200) {
              wx.showToast({ title: '已提交审核', icon: 'success' })
              this.refreshTemplates()
              this.loadStats()
            } else {
              wx.showToast({ title: result.msg || '提交失败', icon: 'none' })
            }
          } catch (error) {
            wx.hideLoading()
            wx.showToast({ title: '提交失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 删除模板
  async deleteTemplate(e) {
    const { id, status } = e.currentTarget.dataset

    wx.showModal({
      title: '删除模板',
      content: status === 'active' ? '该模板已上架，删除后将无法恢复，确定删除吗？' : '确定要删除该模板吗？',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })
            const userId = wx.getStorageSync('userId')
            const result = await request.delete(`/api/template/creator/${id}`, { user_id: userId })
            wx.hideLoading()

            if (result.code === 200) {
              wx.showToast({ title: '删除成功', icon: 'success' })
              this.refreshTemplates()
              this.loadStats()
            } else {
              wx.showToast({ title: result.msg || '删除失败', icon: 'none' })
            }
          } catch (error) {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 下架模板
  async offlineTemplate(e) {
    const { id } = e.currentTarget.dataset

    wx.showModal({
      title: '下架模板',
      content: '确定要下架该模板吗？下架后用户将无法使用。',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' })
            const userId = wx.getStorageSync('userId')
            const result = await request.post(`/api/template/${id}/offline`, { user_id: userId })
            wx.hideLoading()

            if (result.code === 200) {
              wx.showToast({ title: '已下架', icon: 'success' })
              this.refreshTemplates()
              this.loadStats()
            } else {
              wx.showToast({ title: result.msg || '操作失败', icon: 'none' })
            }
          } catch (error) {
            wx.hideLoading()
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 返回
  goBack() {
    wx.navigateBack()
  },

  // 创建模板
  createTemplate() {
    wx.navigateTo({
      url: '/pages/creator/create-template'
    })
  }
})
