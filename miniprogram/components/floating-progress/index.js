/**
 * 悬浮进度条组件
 * 显示图片生成任务的状态，支持安心提示和完成引导
 */

const lang = require('../../utils/lang');
const HISTORY_KEY = 'photoHistory';

Component({
  properties: {
    // 顶部偏移量（适配不同页面导航栏）
    topOffset: {
      type: Number,
      value: 0
    },
    // 是否显示安心提示
    showReassurance: {
      type: Boolean,
      value: true
    }
  },

  data: {
    generatingCount: 0,
    showCompleted: false,
    lastGeneratingCount: 0,
    visible: false,
    i18n: {}
  },

  lifetimes: {
    attached() {
      this.loadLanguage();
      this.loadGeneratingCount();
      this.setupEventListeners();
    },
    detached() {
      this.removeEventListeners();
    }
  },

  pageLifetimes: {
    show() {
      this.loadGeneratingCount();
      this.loadLanguage();
    }
  },

  methods: {
    /**
     * 加载语言包
     */
    loadLanguage() {
      const i18n = lang.getLangData();
      this.setData({ i18n });
    },

    /**
     * 设置事件监听
     */
    setupEventListeners() {
      const app = getApp();
      if (app && app.on) {
        this._historyHandler = () => this.loadGeneratingCount();
        app.on('historyUpdated', this._historyHandler);
      }
    },

    /**
     * 移除事件监听
     */
    removeEventListeners() {
      const app = getApp();
      if (app && app.off && this._historyHandler) {
        app.off('historyUpdated', this._historyHandler);
        this._historyHandler = null;
      }
    },

    /**
     * 加载生成中的任务数量
     */
    loadGeneratingCount() {
      try {
        const history = wx.getStorageSync(HISTORY_KEY) || [];
        const generatingCount = history.filter(item => item.status === 'generating').length;
        const { lastGeneratingCount, showCompleted } = this.data;

        // 检测任务完成：之前有生成任务，现在变成0
        if (lastGeneratingCount > 0 && generatingCount === 0) {
          this.showCompletedStatus(lastGeneratingCount);
        }

        this.setData({
          generatingCount,
          lastGeneratingCount: generatingCount,
          visible: generatingCount > 0 || showCompleted
        });
      } catch (e) {
        // 静默处理
        console.error('[floating-progress] loadGeneratingCount error:', e);
      }
    },

    /**
     * 显示完成状态
     * @param {number} completedCount 完成的任务数量
     */
    showCompletedStatus(completedCount) {
      this.setData({
        showCompleted: true,
        visible: true
      });

      // 显示 Toast 通知
      const { i18n } = this.data;
      wx.showToast({
        title: `${completedCount}${i18n.fp_photosCompleted || '张照片已生成完成'}`,
        icon: 'none',
        duration: 2000
      });

      // 5秒后自动隐藏
      if (this._hideTimer) {
        clearTimeout(this._hideTimer);
      }
      this._hideTimer = setTimeout(() => {
        this.setData({
          showCompleted: false,
          visible: this.data.generatingCount > 0
        });
        this._hideTimer = null;
      }, 5000);
    },

    /**
     * 点击跳转到历史页面
     */
    onTap() {
      wx.switchTab({
        url: '/pages/history/history'
      });
    }
  }
});
