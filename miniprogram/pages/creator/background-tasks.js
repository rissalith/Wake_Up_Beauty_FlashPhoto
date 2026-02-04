/**
 * 后台任务管理页面
 * 显示 AI 生成任务的进度和状态
 */
const { api } = require('../../config/api');

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 64,
    tasks: [],
    loading: true,
    pollTimer: null
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
    this.loadTasks();
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 加载任务列表
  loadTasks() {
    const backgroundTasks = wx.getStorageSync('backgroundAiTasks') || [];

    // 按创建时间倒序排列，过滤掉已应用的任务
    const sortedTasks = backgroundTasks
      .filter(t => !t.applied)  // 过滤掉已应用的任务
      .sort((a, b) => b.createdAt - a.createdAt);

    // 初始化任务状态
    const tasks = sortedTasks.map(task => ({
      ...task,
      status: 'loading',
      progress: 0,
      currentStep: '',
      errorMessage: '',
      result: null
    }));

    this.setData({ tasks, loading: false });

    // 立即查询一次状态
    this.queryAllTaskStatus();
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
    const { tasks } = this.data;
    if (!tasks || tasks.length === 0) return;

    // 只查询未完成的任务
    const pendingTasks = tasks.filter(t =>
      t.status === 'loading' || t.status === 'processing'
    );

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
        const { tasks } = this.data;

        const updatedTasks = tasks.map(t => {
          if (t.taskId !== taskId) return t;

          return {
            ...t,
            status: taskData.status,
            progress: taskData.progress || 0,
            currentStep: this.getStepText(taskData.current_step),
            errorMessage: taskData.error_message || '',
            result: taskData.status === 'completed' ? {
              config: taskData.config_result,
              images: taskData.images_result,
              score: taskData.review_score
            } : null
          };
        });

        this.setData({ tasks: updatedTasks });
      } else if (res.code === 404) {
        // 任务不存在，标记为过期
        this.updateTaskStatus(taskId, 'expired', '任务已过期');
      }
    } catch (error) {
      console.error('[BackgroundTasks] 查询任务状态失败:', error);
    }
  },

  // 更新任务状态
  updateTaskStatus(taskId, status, errorMessage = '') {
    const { tasks } = this.data;
    const updatedTasks = tasks.map(t => {
      if (t.taskId !== taskId) return t;
      return { ...t, status, errorMessage };
    });
    this.setData({ tasks: updatedTasks });
  },

  // 获取步骤文本
  getStepText(step) {
    const stepMap = {
      'init': '准备中...',
      'knowledge_retrieval': '检索知识库...',
      'planning': '规划场景...',
      'config_generation': '生成配置...',
      'review': '审核配置...',
      'review_iteration_1': '优化配置...',
      'review_iteration_2': '优化配置...',
      'review_iteration_3': '优化配置...',
      'image_generation': '生成图片...',
      'done': '完成'
    };
    return stepMap[step] || step || '处理中...';
  },

  // 获取状态文本
  getStatusText(status) {
    const statusMap = {
      'loading': '加载中',
      'processing': '生成中',
      'completed': '已完成',
      'failed': '失败',
      'expired': '已过期'
    };
    return statusMap[status] || status;
  },

  // 获取相对时间
  getRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${Math.floor(diff / 86400000)}天前`;
  },

  // 继续编辑
  continueEdit(e) {
    const { taskid, templateid } = e.currentTarget.dataset;
    const task = this.data.tasks.find(t => t.taskId === taskid);

    if (!task || !task.result) {
      wx.showToast({ title: '任务结果不存在', icon: 'none' });
      return;
    }

    // 使用全局变量传递数据，避免 localStorage 大小限制
    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.pendingAiResult = {
      taskId: taskid,
      templateId: templateid,
      result: task.result,
      description: task.description
    };

    // 跳转到创建/编辑页面
    if (templateid) {
      wx.navigateTo({
        url: `/pages/creator/create-template?id=${templateid}&applyResult=true`
      });
    } else {
      wx.navigateTo({
        url: '/pages/creator/create-template?applyResult=true'
      });
    }
  },

  // 查看结果详情
  viewResult(e) {
    const { taskid } = e.currentTarget.dataset;
    const task = this.data.tasks.find(t => t.taskId === taskid);

    if (!task || !task.result) {
      wx.showToast({ title: '任务结果不存在', icon: 'none' });
      return;
    }

    // 显示结果摘要
    const config = task.result.config;
    const sceneName = config?.scene?.name || '未命名';
    const stepsCount = config?.steps?.length || 0;
    const score = task.result.score || 0;

    wx.showModal({
      title: '生成结果',
      content: `场景名称：${sceneName}\n步骤数量：${stepsCount}个\n评分：${score}分`,
      confirmText: '继续编辑',
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm) {
          this.continueEdit(e);
        }
      }
    });
  },

  // 删除任务
  deleteTask(e) {
    const { taskid } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个任务吗？',
      success: (res) => {
        if (res.confirm) {
          // 从列表中移除
          const { tasks } = this.data;
          const updatedTasks = tasks.filter(t => t.taskId !== taskid);
          this.setData({ tasks: updatedTasks });

          // 更新 localStorage
          const backgroundTasks = wx.getStorageSync('backgroundAiTasks') || [];
          const filteredTasks = backgroundTasks.filter(t => t.taskId !== taskid);
          wx.setStorageSync('backgroundAiTasks', filteredTasks);

          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  // 重试任务
  async retryTask(e) {
    const { taskid, description } = e.currentTarget.dataset;

    wx.showLoading({ title: '重新生成中...' });

    try {
      // 调用 AI Agent API 重新生成
      const res = await api.aiAgentGenerate({
        description: description,
        options: {
          async: true,
          generateImages: true,
          generateCover: true,
          generateReference: true
        }
      });

      if (res.code === 200 && res.data && res.data.task_id) {
        // 更新任务 ID
        const { tasks } = this.data;
        const updatedTasks = tasks.map(t => {
          if (t.taskId !== taskid) return t;
          return {
            ...t,
            taskId: res.data.task_id,
            status: 'processing',
            progress: 0,
            errorMessage: '',
            createdAt: Date.now()
          };
        });
        this.setData({ tasks: updatedTasks });

        // 更新 localStorage
        const backgroundTasks = wx.getStorageSync('backgroundAiTasks') || [];
        const updatedBackgroundTasks = backgroundTasks.map(t => {
          if (t.taskId !== taskid) return t;
          return {
            ...t,
            taskId: res.data.task_id,
            createdAt: Date.now()
          };
        });
        wx.setStorageSync('backgroundAiTasks', updatedBackgroundTasks);

        wx.hideLoading();
        wx.showToast({ title: '已重新开始', icon: 'success' });
      } else {
        throw new Error(res.message || '重试失败');
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '重试失败', icon: 'none' });
    }
  },

  // 清理过期任务
  cleanExpiredTasks() {
    const { tasks } = this.data;
    const now = Date.now();
    const expireTime = 24 * 60 * 60 * 1000; // 24小时

    // 过滤掉过期的任务
    const validTasks = tasks.filter(t => {
      // 保留未过期的任务
      if (now - t.createdAt < expireTime) return true;
      // 保留已完成但未处理的任务
      if (t.status === 'completed') return true;
      return false;
    });

    if (validTasks.length !== tasks.length) {
      this.setData({ tasks: validTasks });

      // 更新 localStorage
      const backgroundTasks = wx.getStorageSync('backgroundAiTasks') || [];
      const filteredTasks = backgroundTasks.filter(t => {
        if (now - t.createdAt < expireTime) return true;
        const task = tasks.find(tt => tt.taskId === t.taskId);
        if (task && task.status === 'completed') return true;
        return false;
      });
      wx.setStorageSync('backgroundAiTasks', filteredTasks);
    }
  }
});
