/**
 * 创作者中心页面
 */
const { api } = require('../../config/api');

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 64,
    creator: {},
    templates: [],
    loading: true,
    showLoginModal: false,
    backgroundTasks: [],  // 后台任务列表
    pollTimer: null,
    statusMap: {
      draft: '草稿',
      pending: '审核中',
      reviewing: '审核中',
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
    this.loadBackgroundTasks();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  // 加载创作者数据
  async loadCreatorData() {
    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    this.setData({ loading: true });

    try {
      // 并行加载数据
      const [profileRes, templatesRes] = await Promise.all([
        api.getCreatorProfile(userId),
        api.getCreatorTemplates(userId, null, 1, 5)
      ]);

      // 创作者信息
      if (profileRes.code === 200 && profileRes.data) {
        this.setData({ creator: profileRes.data });
      }

      // 模板列表
      if (templatesRes.code === 200 && templatesRes.data) {
        this.setData({ templates: templatesRes.data.list || [] });
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

  // 加载后台任务
  loadBackgroundTasks() {
    const storedTasks = wx.getStorageSync('backgroundAiTasks') || [];
    // 过滤掉已应用的任务
    const activeTasks = storedTasks.filter(t => !t.applied);

    if (activeTasks.length === 0) {
      this.setData({ backgroundTasks: [] });
      this.stopPolling();
      return;
    }

    // 初始化任务状态
    const tasks = activeTasks.map(task => ({
      ...task,
      status: 'loading',
      progress: 0
    }));

    this.setData({ backgroundTasks: tasks });

    // 查询状态并开始轮询
    this.queryAllTaskStatus();
    this.startPolling();
  },

  // 开始轮询
  startPolling() {
    if (this.data.pollTimer) return;

    const timer = setInterval(() => {
      this.queryAllTaskStatus();
    }, 3000);

    this.setData({ pollTimer: timer });
  },

  // 停止轮询
  stopPolling() {
    if (this.data.pollTimer) {
      clearInterval(this.data.pollTimer);
      this.setData({ pollTimer: null });
    }
  },

  // 查询所有任务状态
  async queryAllTaskStatus() {
    const { backgroundTasks } = this.data;
    if (!backgroundTasks || backgroundTasks.length === 0) {
      this.stopPolling();
      return;
    }

    // 只查询未完成的任务
    const pendingTasks = backgroundTasks.filter(t =>
      t.status === 'loading' || t.status === 'processing'
    );

    if (pendingTasks.length === 0) {
      this.stopPolling();
      return;
    }

    for (const task of pendingTasks) {
      await this.queryTaskStatus(task.taskId);
    }
  },

  // 查询单个任务状态
  async queryTaskStatus(taskId) {
    try {
      const res = await api.aiAgentStatus(taskId);

      if (res.code === 200 && res.data) {
        const taskData = res.data;
        const { backgroundTasks } = this.data;

        const updatedTasks = backgroundTasks.map(t => {
          if (t.taskId !== taskId) return t;

          return {
            ...t,
            status: taskData.status,
            progress: taskData.progress || 0,
            result: taskData.status === 'completed' ? {
              config: taskData.config_result,
              images: taskData.images_result,
              score: taskData.review_score
            } : null
          };
        });

        this.setData({ backgroundTasks: updatedTasks });
      }
    } catch (error) {
      console.error('[Creator] 查询任务状态失败:', error);
    }
  },

  // 点击任务卡片
  onTaskCardTap(e) {
    const task = e.currentTarget.dataset.task;

    if (task.status === 'completed') {
      // 已完成，跳转到编辑页面应用结果
      const app = getApp();
      app.globalData = app.globalData || {};
      app.globalData.pendingAiResult = {
        taskId: task.taskId,
        templateId: task.templateId,
        result: task.result,
        description: task.description
      };

      wx.navigateTo({
        url: '/pages/creator/create-template?applyResult=true'
      });
    } else if (task.status === 'failed') {
      // 失败，提示重试
      wx.showModal({
        title: '生成失败',
        content: '是否删除此任务？',
        confirmText: '删除',
        success: (res) => {
          if (res.confirm) {
            this.deleteTask(task.taskId);
          }
        }
      });
    } else {
      // 进行中，提示等待
      wx.showToast({
        title: 'AI正在生成中...',
        icon: 'none'
      });
    }
  },

  // 删除任务
  deleteTask(taskId) {
    const storedTasks = wx.getStorageSync('backgroundAiTasks') || [];
    const filteredTasks = storedTasks.filter(t => t.taskId !== taskId);
    wx.setStorageSync('backgroundAiTasks', filteredTasks);

    const { backgroundTasks } = this.data;
    this.setData({
      backgroundTasks: backgroundTasks.filter(t => t.taskId !== taskId)
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

  // 查看/编辑模板
  goToTemplateDetail(e) {
    const templateId = e.currentTarget.dataset.id;
    // 所有模板都跳转到 create-template 编辑页面
    wx.navigateTo({
      url: `/pages/creator/create-template?id=${templateId}`
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
