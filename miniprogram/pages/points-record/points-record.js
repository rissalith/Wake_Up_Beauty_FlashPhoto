const lang = require('../../utils/lang.js');
const { api } = require('../../config/api.js');

// 类型图标样式映射 (CSS类名)
const TYPE_ICON_CLASSES = {
  'new_user': 'icon-gift',
  'share_image': 'icon-share',
  'invite_friend': 'icon-users',
  'recharge': 'icon-recharge',
  'consume': 'icon-consume',
  'generate': 'icon-consume',
  'admin_adjust': 'icon-adjust',
  'refund': 'icon-refund'
};

Page({
  data: {
    records: [],
    userPoints: 0,
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    i18n: {}
  },

  onLoad() {
    this.loadLanguage();
    this.loadUserPoints();
    this.loadRecords();
  },

  onShow() {
    this.loadUserPoints();
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({ page: 1, records: [], hasMore: true });
    this.loadRecords().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadRecords();
    }
  },

  // 加载语言
  loadLanguage() {
    const i18n = lang.getLangData();
    this.setData({ i18n });
    wx.setNavigationBarTitle({
      title: i18n.pointsRecord_title || '醒币明细'
    });
  },

  // 获取类型文本映射（国际化）
  getTypeTexts() {
    const { i18n } = this.data;
    return {
      'new_user': i18n.pr_newUser || '新用户奖励',
      'share_image': i18n.pr_shareImage || '分享图片奖励',
      'invite_friend': i18n.pr_inviteFriend || '邀请好友奖励',
      'recharge': i18n.pr_recharge || '充值',
      'test_recharge': i18n.pr_testRecharge || '测试充值',
      'virtual_recharge': i18n.pr_virtualRecharge || '虚拟充值',
      'consume': i18n.pr_consume || '消费',
      'generate': i18n.pr_generate || '生成照片',
      'admin_adjust': i18n.pr_adminAdjust || '系统调整',
      'refund': i18n.pr_refund || '系统退还',
      'system_grant': i18n.pr_systemGrant || '系统发放',
      'activity_reward': i18n.pr_activityReward || '活动奖励'
    };
  },

  // 加载用户醒币（从服务器）
  async loadUserPoints() {
    const app = getApp();
    try {
      const balance = await app.getUserPoints();
      this.setData({ userPoints: balance });
    } catch (error) {
      // 静默处理
      const userPoints = wx.getStorageSync('userPoints') || 0;
      this.setData({ userPoints });
    }
  },

  // 格式化时间
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  // 处理记录数据，添加图标和文本
  processRecords(records) {
    const typeTexts = this.getTypeTexts();
    return records.map(record => ({
      ...record,
      iconClass: TYPE_ICON_CLASSES[record.type] || 'icon-default',
      typeText: typeTexts[record.type] || record.description || record.type,
      formattedTime: this.formatTime(record.created_at || record.time)
    }));
  },

  // 加载记录（从服务器）
  async loadRecords() {
    if (this.data.loading) return;

    const userId = wx.getStorageSync('userId');
    if (!userId) {
      this.setData({ records: [], hasMore: false });
      return;
    }

    this.setData({ loading: true });

    try {
      const { page, pageSize, records, i18n } = this.data;
      const res = await api.getPointsRecords(userId, page, pageSize);

      if (res.code === 0 || res.code === 200) {
        const newRecords = this.processRecords(res.data.list || []);
        const totalCount = res.data.total || 0;

        this.setData({
          records: page === 1 ? newRecords : [...records, ...newRecords],
          hasMore: (page * pageSize) < totalCount,
          page: page + 1,
          loading: false
        });
      } else {
        throw new Error(res.msg || (i18n.pr_loadFailed || '加载失败'));
      }
    } catch (error) {
      // 静默处理
      this.setData({ loading: false, hasMore: false });
      wx.showToast({ title: this.data.i18n.pr_loadFailed || '加载失败', icon: 'none' });
    }
  }
});
