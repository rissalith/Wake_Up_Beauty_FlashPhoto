const { I18nPage } = require('../../utils/i18nPage');
const { t, getLangData } = require('../../utils/lang');
const { api } = require('../../config/api');
const { images } = require('../../config/images');

I18nPage({
  data: {
    inviteCount: 0,
    // 获得的醒币（邀请奖励已自动发放）
    earnedPoints: 0,
    // 每邀请1人奖励醒币数
    pointsPerInvite: 100,
    // 邀请记录
    inviteRecords: [],
    loading: false
  },

  onLoad() {
    this.loadInviteData();
    this.updateNavTitle();
  },

  onShow() {
    this.loadInviteData();
    this.updateNavTitle();
  },

  // 更新导航栏标题
  updateNavTitle() {
    const i18n = getLangData();
    wx.setNavigationBarTitle({
      title: i18n.invite_pageTitle || '邀请好友'
    });
  },

  // 加载邀请数据（从服务器）
  async loadInviteData() {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      this.setData({
        inviteCount: 0,
        earnedPoints: 0,
        inviteRecords: []
      });
      return;
    }

    this.setData({ loading: true });

    try {
      // 获取邀请统计
      const statsRes = await api.getInviteStats(userId);
      if (statsRes.code === 0) {
        this.setData({
          inviteCount: statsRes.data.invitedCount,
          earnedPoints: statsRes.data.earnedPoints,
          pointsPerInvite: statsRes.data.pointsPerInvite || 100
        });
      }

      // 获取邀请记录
      const recordsRes = await api.getInviteRecords(userId);
      if (recordsRes.code === 0) {
        const records = recordsRes.data.map(record => ({
          ...record,
          timeStr: this.formatTime(record.created_at)
        }));
        this.setData({ inviteRecords: records });
      }
    } catch (error) {
      // 静默处理
      // 使用本地缓存
      const inviteCount = wx.getStorageSync('inviteCount') || 0;
      this.setData({
        inviteCount,
        earnedPoints: inviteCount * 100
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 格式化时间
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
  },

  // 分享给好友
  onShareAppMessage() {
    const userId = wx.getStorageSync('userId') || '';
    return {
      title: t('invite_shareTitle') || '我在用醒美闪图，AI出图超好用！',
      path: `/pages/index/index?inviter=${userId}`,
      imageUrl: images.shareCover
    };
  }
});
