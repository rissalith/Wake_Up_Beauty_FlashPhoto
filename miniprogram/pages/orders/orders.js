const { I18nPage } = require('../../utils/i18nPage');
const { t, getLangData } = require('../../utils/lang');
const api = require('../../config/api');

I18nPage({
  data: {
    orders: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true
  },

  onLoad() {
    this.migrateLocalOrders(); // 首次加载时迁移本地数据
    this.loadOrders();
    this.updateNavTitle();
  },

  onShow() {
    // 刷新数据
    this.setData({ page: 1, orders: [], hasMore: true });
    this.loadOrders();
    this.updateNavTitle();
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({ page: 1, orders: [], hasMore: true });
    this.loadOrders().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadOrders();
    }
  },

  // 更新导航栏标题
  updateNavTitle() {
    const i18n = getLangData();
    wx.setNavigationBarTitle({
      title: i18n.order_pageTitle || '消费记录'
    });
  },

  // 从服务器加载消费记录
  async loadOrders() {
    if (this.data.loading) return;

    const userId = wx.getStorageSync('userId');
    if (!userId) {
      this.setData({ orders: [], loading: false });
      return;
    }

    this.setData({ loading: true });

    try {
      const res = await api.getPointsRecords(userId, this.data.page, this.data.pageSize);

      if (res.code === 200 && res.data) {
        const records = res.data.records || res.data.list || [];

        // 只显示消费记录（type 包含 consume 或 generate 等）
        const consumeRecords = records.filter(r =>
          r.type === 'consume' ||
          r.type === 'generate' ||
          r.type === 'photo_generate' ||
          r.amount < 0 ||
          (r.description && r.description.includes('生成'))
        );

        // 格式化记录
        const i18n = getLangData();
        const formattedOrders = consumeRecords.map(record => ({
          id: record.id,
          sceneName: this.extractSceneName(record.description, i18n),
          count: this.extractCount(record.description),
          points: Math.abs(record.amount),
          status: 'completed',
          statusText: i18n.order_statusCompleted || '已完成',
          createTimeStr: this.formatTime(record.created_at)
        }));

        const newOrders = this.data.page === 1
          ? formattedOrders
          : [...this.data.orders, ...formattedOrders];

        this.setData({
          orders: newOrders,
          page: this.data.page + 1,
          hasMore: records.length >= this.data.pageSize
        });
      }
    } catch (error) {
      // 静默处理
    } finally {
      this.setData({ loading: false });
    }
  },

  // 从描述中提取场景名称
  extractSceneName(description, i18n) {
    const defaultName = (i18n && i18n.order_photoGeneration) || '照片生成';
    if (!description) return defaultName;
    // 尝试匹配 "生成X张XXX" 格式
    const match = description.match(/生成\d+张(.+)/);
    if (match) return match[1];
    // 尝试匹配其他格式
    if (description.includes('生成')) return description;
    return defaultName;
  },

  // 从描述中提取数量
  extractCount(description) {
    if (!description) return 1;
    const match = description.match(/生成(\d+)张/);
    return match ? parseInt(match[1]) : 1;
  },

  // 格式化时间
  formatTime(timeStr) {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  // 跳转到首页
  goToHome() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 迁移本地存储的消费记录到数据库
  async migrateLocalOrders() {
    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    // 检查是否已迁移过
    const migrated = wx.getStorageSync('ordersMigrated');
    if (migrated) return;

    // 获取本地存储的订单历史
    const localOrders = wx.getStorageSync('orderHistory') || [];
    if (localOrders.length === 0) {
      wx.setStorageSync('ordersMigrated', true);
      return;
    }

    try {
      const res = await api.migrateLocalOrders(userId, localOrders);
      if (res.code === 200) {
        // 标记已迁移，清空本地存储
        wx.setStorageSync('ordersMigrated', true);
        wx.removeStorageSync('orderHistory');
      }
    } catch (error) {
      // 静默处理
    }
  }
});
