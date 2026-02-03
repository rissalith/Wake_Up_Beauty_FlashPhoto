const { images } = require('../config/images');
const HISTORY_KEY = 'photoHistory';

Component({
  data: {
    selected: 0,
    generatingCount: 0,
    disabled: false,
    disabledReason: '',
    // TabBar 图标
    tabHome: images.tabHome,
    tabHomeActive: images.tabHomeActive,
    tabCreator: images.tabCreator,
    tabCreatorActive: images.tabCreatorActive,
    tabHistory: images.tabHistory,
    tabHistoryActive: images.tabHistoryActive,
    tabMine: images.tabMine,
    tabMineActive: images.tabMineActive
  },
  lifetimes: {
    attached() {
      this.updateGeneratingCount();

      // 监听全局历史更新事件，实时刷新进度
      const app = getApp();
      if (app && app.on) {
        this._historyUpdateHandler = () => {
          this.updateGeneratingCount();
        };
        app.on('historyUpdated', this._historyUpdateHandler);

        // 监听TabBar禁用状态变化（登录弹窗或隐私弹窗显示时禁用）
        this._tabBarDisabledHandler = (data) => {
          // 支持传入对象 {disabled: true, reason: '请先登录'} 或布尔值
          if (typeof data === 'object') {
            this.setData({
              disabled: !!data.disabled,
              disabledReason: data.reason || '请先完成操作'
            });
          } else {
            this.setData({
              disabled: !!data,
              disabledReason: data ? '请先完成操作' : ''
            });
          }
        };
        app.on('tabBarDisabledChange', this._tabBarDisabledHandler);
      }
    },
    detached() {
      // 移除事件监听
      const app = getApp();
      if (app && app.off) {
        if (this._historyUpdateHandler) {
          app.off('historyUpdated', this._historyUpdateHandler);
        }
        if (this._tabBarDisabledHandler) {
          app.off('tabBarDisabledChange', this._tabBarDisabledHandler);
        }
      }
    }
  },
  pageLifetimes: {
    show() {
      this.updateGeneratingCount();
    }
  },
  methods: {
    switchTab(e) {
      // 禁用状态下不允许切换
      if (this.data.disabled) {
        wx.showToast({
          title: this.data.disabledReason || '请先完成操作',
          icon: 'none'
        });
        return;
      }
      const data = e.currentTarget.dataset;
      const url = data.path;
      wx.switchTab({ url });
    },
    // 更新生成中的任务数量
    updateGeneratingCount() {
      try {
        const history = wx.getStorageSync(HISTORY_KEY) || [];
        const generatingCount = history.filter(item => item.status === 'generating').length;
        this.setData({ generatingCount });
      } catch (e) {
        // 静默处理
        this.setData({ generatingCount: 0 });
      }
    },
    // 保持兼容性的空方法
    loadLanguage() {
      // 简约版 TabBar 不需要多语言切换
    }
  }
});
