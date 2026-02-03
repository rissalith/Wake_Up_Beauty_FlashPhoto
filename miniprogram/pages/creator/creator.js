/**
 * 创作者中心页面
 */
const { api } = require('../../config/api');

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 64,
    creator: {},
    levelInfo: {},
    templateStats: {},
    sceneStats: {},
    templates: [],
    scenes: [],
    loading: true,
    showLoginModal: false,
    statusMap: {
      draft: '草稿',
      pending: '审核中',
      active: '已上架',
      approved: '已上架',
      rejected: '已拒绝',
      offline: '已下架'
    }
  },

  onLoad() {
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight || 20;
    const navBarHeight = statusBarHeight + 44;

    this.setData({
      statusBarHeight,
      navBarHeight
    });
  },

  onShow() {
    // 设置tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }

    const userId = wx.getStorageSync('userId');
    if (!userId) {
      this.setData({ showLoginModal: true });
      return;
    }

    this.loadCreatorData();
  },

  // 加载创作者数据
  async loadCreatorData() {
    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    this.setData({ loading: true });

    try {
      // 并行加载数据
      const [profileRes, levelRes, statsRes, templatesRes, scenesRes] = await Promise.all([
        api.getCreatorProfile(userId),
        api.getCreatorLevel(userId),
        api.getCreatorStats(userId),
        api.getCreatorTemplates(userId, null, 1, 5),
        api.getMyCreatorScenes ? api.getMyCreatorScenes(1, 5) : Promise.resolve({ code: 200, data: { list: [] } })
      ]);

      // 创作者信息
      if (profileRes.code === 200 && profileRes.data) {
        this.setData({ creator: profileRes.data });
      }

      // 等级信息
      if (levelRes.code === 200 && levelRes.data) {
        this.setData({ levelInfo: levelRes.data });
      }

      // 统计数据
      if (statsRes.code === 200 && statsRes.data) {
        this.setData({
          templateStats: statsRes.data.templates || {}
        });
      }

      // 模板列表
      if (templatesRes.code === 200 && templatesRes.data) {
        this.setData({ templates: templatesRes.data.list || [] });
      }

      // 场景列表
      if (scenesRes.code === 0 && scenesRes.data) {
        const sceneList = scenesRes.data.list || [];
        const pendingCount = sceneList.filter(s => s.review_status === 'pending').length;
        this.setData({
          scenes: sceneList,
          sceneStats: { pending: pendingCount }
        });
      }
    } catch (error) {
      console.error('加载创作者数据失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/mine/mine' });
      }
    });
  },

  // 跳转到场景选择页面
  goToSceneSelect() {
    wx.navigateTo({
      url: '/pages/index/index'
    });
  },

  // 编辑资料
  editProfile() {
    wx.navigateTo({
      url: '/pages/creator/edit-profile'
    });
  },

  // 创建模板
  createTemplate() {
    wx.navigateTo({
      url: '/pages/creator/create-template'
    });
  },

  // 创建场景
  createScene() {
    wx.navigateTo({
      url: '/pages/creator/scene-editor/scene-editor'
    });
  },

  // 查看我的场景
  goToMyScenes() {
    wx.navigateTo({
      url: '/pages/creator/my-scenes/my-scenes'
    });
  },

  // 查看我的模板
  goToMyTemplates() {
    wx.navigateTo({
      url: '/pages/creator/my-templates'
    });
  },

  // 查看收益明细
  goToEarnings() {
    wx.navigateTo({
      url: '/pages/creator/earnings'
    });
  },

  // 查看收藏
  goToFavorites() {
    wx.navigateTo({
      url: '/pages/creator/favorites'
    });
  },

  // 查看模板详情
  goToTemplateDetail(e) {
    const templateId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/creator/template-detail?id=${templateId}`
    });
  },

  // 登录弹窗关闭
  onLoginModalClose() {
    this.setData({ showLoginModal: false });
    wx.navigateBack();
  },

  // 登录成功
  onLoginSuccess() {
    this.setData({ showLoginModal: false });
    this.loadCreatorData();
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '我在醒美闪图创作模板，快来看看吧',
      path: '/pages/creator/creator'
    };
  }
});
