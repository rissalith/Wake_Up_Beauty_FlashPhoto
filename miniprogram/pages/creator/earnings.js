/**
 * 收益明细页面
 */
const { api } = require('../../config/api');

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 64,
    // 收益统计
    totalEarnings: 0,
    monthEarnings: 0,
    withdrawable: 0,
    // 收益记录
    records: [],
    loading: true,
    hasMore: true,
    page: 1,
    pageSize: 20
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight || 20;
    const navBarHeight = statusBarHeight + 44;

    this.setData({
      statusBarHeight,
      navBarHeight
    });

    this.loadEarningsData();
  },

  // 加载收益数据
  async loadEarningsData() {
    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    this.setData({ loading: true });

    try {
      // 获取收益统计
      const statsRes = await api.getCreatorStats(userId);
      if (statsRes.code === 200 && statsRes.data) {
        this.setData({
          totalEarnings: statsRes.data.total_earnings || 0,
          monthEarnings: statsRes.data.month_earnings || 0,
          withdrawable: statsRes.data.withdrawable || 0
        });
      }

      // 获取收益记录
      await this.loadRecords(true);
    } catch (error) {
      console.error('加载收益数据失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 加载收益记录
  async loadRecords(refresh = false) {
    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    if (refresh) {
      this.setData({ page: 1, records: [], hasMore: true });
    }

    if (!this.data.hasMore && !refresh) return;

    try {
      const res = await api.getCreatorEarnings(userId, this.data.page, this.data.pageSize);
      if (res.code === 200 && res.data) {
        const newRecords = res.data.list || [];
        this.setData({
          records: refresh ? newRecords : [...this.data.records, ...newRecords],
          hasMore: newRecords.length >= this.data.pageSize,
          page: this.data.page + 1
        });
      }
    } catch (error) {
      console.error('加载收益记录失败:', error);
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadEarningsData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadRecords();
    }
  }
});
