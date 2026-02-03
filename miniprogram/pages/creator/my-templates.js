// pages/creator/my-templates.js
const app = getApp()
const request = require('../../utils/request')

Page({
  data: {
    templates: [],
    stats: {
      draft: 0,
      reviewing: 0,
      pending: 0,
      active: 0,
      rejected: 0,
      offline: 0,
      total: 0
    },
    currentTab: '', // 空字符串表示全部
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    // 拖拽排序相关
    isDragging: false,
    dragIndex: -1,
    dragStartY: 0,
    dragOffsetY: 0,
    itemHeight: 120 // 每个模板卡片的高度
  },

  onLoad() {
    this.loadStats()
    this.loadTemplates()
  },

  onShow() {
    // 每次显示页面时刷新数据
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
      const userId = app.globalData.userInfo?.id
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

    this.setData({ loading: true })

    try {
      const userId = app.globalData.userInfo?.id
      if (!userId) {
        this.setData({ loading: false })
        return
      }

      const params = {
        user_id: userId,
        page: this.data.page,
        pageSize: this.data.pageSize
      }

      if (this.data.currentTab) {
        params.status = this.data.currentTab
      }

      const res = await request.get('/api/template/creator/my-templates', params)
      if (res.code === 200) {
        const templates = res.data.list || []
        this.setData({
          templates: this.data.page === 1 ? templates : [...this.data.templates, ...templates],
          hasMore: templates.length >= this.data.pageSize
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
    this.setData({ page: 1, hasMore: true })
    await this.loadTemplates()
  },

  // 加载更多
  async loadMoreTemplates() {
    this.setData({ page: this.data.page + 1 })
    await this.loadTemplates()
  },

  // 切换 Tab
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({
      currentTab: tab,
      page: 1,
      hasMore: true,
      templates: []
    })
    this.loadTemplates()
  },

  // 创建新模板
  createTemplate() {
    wx.navigateTo({
      url: '/pages/creator/create-template'
    })
  },

  // 编辑模板
  editTemplate(e) {
    const { id, status } = e.currentTarget.dataset
    // 只有草稿、已拒绝、已上架状态可以编辑
    if (!['draft', 'rejected', 'active'].includes(status)) {
      wx.showToast({ title: '当前状态不可编辑', icon: 'none' })
      return
    }
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
            const userId = app.globalData.userInfo?.id
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
            const userId = app.globalData.userInfo?.id
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
            const userId = app.globalData.userInfo?.id
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

  // ==================== 拖拽排序相关 ====================

  // 开始拖拽
  onDragStart(e) {
    const index = e.currentTarget.dataset.index
    const touch = e.touches[0]

    this.setData({
      isDragging: true,
      dragIndex: index,
      dragStartY: touch.clientY,
      dragOffsetY: 0
    })

    wx.vibrateShort({ type: 'light' })
  },

  // 拖拽移动
  onDragMove(e) {
    if (!this.data.isDragging) return

    const touch = e.touches[0]
    const offsetY = touch.clientY - this.data.dragStartY

    this.setData({ dragOffsetY: offsetY })

    // 计算目标位置
    const targetIndex = this.calculateTargetIndex(offsetY)
    if (targetIndex !== this.data.dragIndex && targetIndex >= 0 && targetIndex < this.data.templates.length) {
      // 交换位置
      const templates = [...this.data.templates]
      const dragItem = templates[this.data.dragIndex]
      templates.splice(this.data.dragIndex, 1)
      templates.splice(targetIndex, 0, dragItem)

      this.setData({
        templates,
        dragIndex: targetIndex,
        dragStartY: touch.clientY,
        dragOffsetY: 0
      })
    }
  },

  // 结束拖拽
  async onDragEnd() {
    if (!this.data.isDragging) return

    this.setData({
      isDragging: false,
      dragIndex: -1,
      dragOffsetY: 0
    })

    // 保存新的排序
    await this.saveTemplateOrder()
  },

  // 计算目标位置
  calculateTargetIndex(offsetY) {
    const { dragIndex, itemHeight } = this.data
    const moveCount = Math.round(offsetY / itemHeight)
    return dragIndex + moveCount
  },

  // 保存模板排序
  async saveTemplateOrder() {
    try {
      const userId = app.globalData.userInfo?.id
      if (!userId) return

      const templateOrders = this.data.templates.map((t, index) => ({
        template_id: t.id,
        sort_order: this.data.templates.length - index // 倒序，最前面的排序值最大
      }))

      await request.post('/api/template/creator/reorder', {
        user_id: userId,
        template_orders: templateOrders
      })

      wx.showToast({ title: '排序已保存', icon: 'success' })
    } catch (error) {
      console.error('保存排序失败:', error)
    }
  },

  // 获取状态文本
  getStatusText(status) {
    const map = {
      draft: '草稿',
      reviewing: '审核中',
      pending: '待审核',
      active: '已上架',
      rejected: '已拒绝',
      offline: '已下架'
    }
    return map[status] || status
  },

  // 获取状态样式类
  getStatusClass(status) {
    const map = {
      draft: 'status-draft',
      reviewing: 'status-reviewing',
      pending: 'status-pending',
      active: 'status-active',
      rejected: 'status-rejected',
      offline: 'status-offline'
    }
    return map[status] || ''
  }
})
