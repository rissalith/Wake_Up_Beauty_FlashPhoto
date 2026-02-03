/**
 * 我的场景列表页面
 */
const { api } = require('../../../config/api');

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 64,
    scenes: [],
    loading: true,
    refreshing: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    currentTab: 'all',
    tabs: [
      { key: 'all', name: '全部' },
      { key: 'draft', name: '草稿' },
      { key: 'pending', name: '审核中' },
      { key: 'approved', name: '已上架' },
      { key: 'rejected', name: '已拒绝' }
    ],
    statusMap: {
      draft: '草稿',
      pending: '审核中',
      approved: '已上架',
      rejected: '已拒绝',
      offline: '已下架'
    }
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight || 20;
    const navBarHeight = statusBarHeight + 44;

    this.setData({
      statusBarHeight,
      navBarHeight
    });

    this.loadScenes();
  },

  onShow() {
    // 每次显示时刷新列表
    this.refreshList();
  },

  // 加载场景列表
  async loadScenes(append = false) {
    if (!append) {
      this.setData({ loading: true });
    }

    try {
      const { currentTab, page, pageSize } = this.data;
      const status = currentTab === 'all' ? '' : currentTab;

      const res = await api.getMyCreatorScenes(page, pageSize, status);

      if (res.code === 0 && res.data) {
        const newScenes = res.data.list || [];
        const scenes = append ? [...this.data.scenes, ...newScenes] : newScenes;

        this.setData({
          scenes,
          hasMore: newScenes.length >= pageSize
        });
      }
    } catch (error) {
      console.error('加载场景列表失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false, refreshing: false });
    }
  },

  // 刷新列表
  refreshList() {
    this.setData({ page: 1, hasMore: true });
    this.loadScenes();
  },

  // 下拉刷新
  onRefresh() {
    this.setData({ refreshing: true });
    this.refreshList();
  },

  // 加载更多
  loadMore() {
    if (!this.data.hasMore || this.data.loading) return;

    this.setData({ page: this.data.page + 1 });
    this.loadScenes(true);
  },

  // 切换标签
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;

    this.setData({
      currentTab: tab,
      page: 1,
      scenes: [],
      hasMore: true
    });
    this.loadScenes();
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 创建新场景
  createScene() {
    wx.navigateTo({
      url: '/pages/creator/scene-editor/scene-editor'
    });
  },

  // 编辑场景
  editScene(e) {
    const sceneId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/creator/scene-editor/scene-editor?id=${sceneId}`
    });
  },

  // 查看场景详情
  viewScene(e) {
    const sceneId = e.currentTarget.dataset.id;
    const scene = this.data.scenes.find(s => s.id === sceneId);

    if (scene && scene.review_status === 'approved') {
      // 已上架的场景可以预览
      wx.navigateTo({
        url: `/pages/scene/scene?sceneId=${sceneId}`
      });
    } else {
      // 其他状态进入编辑
      this.editScene(e);
    }
  },

  // 删除场景
  deleteScene(e) {
    const sceneId = e.currentTarget.dataset.id;
    const scene = this.data.scenes.find(s => s.id === sceneId);

    if (!scene) return;

    if (!['draft', 'rejected'].includes(scene.review_status)) {
      wx.showToast({
        title: '只能删除草稿或被拒绝的场景',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: `确定要删除场景"${scene.name}"吗？此操作不可恢复。`,
      confirmColor: '#FF6B6B',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' });
            const result = await api.deleteCreatorScene(sceneId);

            if (result.code === 0) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              this.refreshList();
            } else {
              wx.showToast({ title: result.message || '删除失败', icon: 'none' });
            }
          } catch (error) {
            console.error('删除场景失败:', error);
            wx.showToast({ title: '删除失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 提交审核
  submitReview(e) {
    const sceneId = e.currentTarget.dataset.id;
    const scene = this.data.scenes.find(s => s.id === sceneId);

    if (!scene) return;

    wx.showModal({
      title: '提交审核',
      content: '确定要提交场景审核吗？审核期间无法编辑。',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '提交中...' });
            const result = await api.submitCreatorSceneReview(sceneId);

            if (result.code === 0) {
              wx.showToast({ title: '提交成功', icon: 'success' });
              this.refreshList();
            } else {
              wx.showToast({ title: result.message || '提交失败', icon: 'none' });
            }
          } catch (error) {
            console.error('提交审核失败:', error);
            wx.showToast({ title: '提交失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  }
});
