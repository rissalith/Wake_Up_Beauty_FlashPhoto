/**
 * 看视频得醒币页面
 */
const { api } = require('../../config/api');
const { t } = require('../../utils/lang');

Page({
  data: {
    todayCount: 0,           // 今日已领取次数
    pointsPerVideo: 30,      // 每次奖励醒币
    currentBalance: 0,       // 当前余额
    isWatching: false,       // 是否正在观看
    watchProgress: 0,        // 观看进度 0-100
    canClaim: true,          // 是否可以领取
    showSuccess: false,      // 是否显示成功动画
    earnedPoints: 0,         // 本次获得的醒币
    videoUrl: '',            // 视频URL（预留）
    videoDuration: 15,       // 视频时长（秒）
    countdown: 15,           // 倒计时
    i18n: {}
  },

  watchTimer: null,

  onLoad() {
    this.setData({
      i18n: {
        title: t('videoReward_title') || '看视频得醒币',
        watchVideo: t('videoReward_watch') || '观看视频',
        watching: t('videoReward_watching') || '观看中...',
        todayEarned: t('videoReward_todayEarned') || '今日已获得',
        perVideo: t('videoReward_perVideo') || '每次观看可得',
        tips: t('videoReward_tips') || '观看完整视频即可获得醒币奖励',
        success: t('videoReward_success') || '恭喜获得',
        points: t('points') || '醒币',
        continue: t('videoReward_continue') || '继续观看',
        back: t('back') || '返回'
      }
    });
    this.loadStatus();
  },

  onUnload() {
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
    }
  },

  // 加载状态
  async loadStatus() {
    try {
      const userId = wx.getStorageSync('userId');
      if (!userId) {
        this.setData({ canClaim: false });
        return;
      }

      const res = await api.request({
        url: `/api/video-reward/status/${userId}`,
        method: 'GET'
      });

      if (res.code === 0) {
        this.setData({
          todayCount: res.data.todayCount || 0,
          pointsPerVideo: res.data.pointsPerVideo || 30,
          currentBalance: res.data.currentBalance || 0,
          canClaim: res.data.canClaim !== false
        });
      }
    } catch (error) {
      console.error('[VideoReward] Load status error:', error);
    }
  },

  // 开始观看视频
  startWatching() {
    if (this.data.isWatching) return;

    const userId = wx.getStorageSync('userId');
    if (!userId) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    this.setData({
      isWatching: true,
      watchProgress: 0,
      countdown: this.data.videoDuration
    });

    // 模拟视频播放进度
    const duration = this.data.videoDuration;
    let elapsed = 0;

    this.watchTimer = setInterval(() => {
      elapsed++;
      const progress = Math.min((elapsed / duration) * 100, 100);
      const countdown = Math.max(duration - elapsed, 0);

      this.setData({
        watchProgress: progress,
        countdown
      });

      if (elapsed >= duration) {
        clearInterval(this.watchTimer);
        this.watchTimer = null;
        this.claimReward();
      }
    }, 1000);
  },

  // 领取奖励
  async claimReward() {
    try {
      const userId = wx.getStorageSync('userId');

      const res = await api.request({
        url: '/api/video-reward/claim',
        method: 'POST',
        data: {
          userId,
          videoId: 'default',
          watchDuration: this.data.videoDuration
        }
      });

      if (res.code === 0) {
        const earnedPoints = res.data.pointsEarned;
        const newBalance = res.data.newBalance;

        // 更新本地存储
        wx.setStorageSync('userPoints', newBalance);

        this.setData({
          isWatching: false,
          showSuccess: true,
          earnedPoints,
          currentBalance: newBalance,
          todayCount: this.data.todayCount + 1
        });

        // 播放成功音效（如果有）
        // wx.vibrateShort({ type: 'medium' });

      } else {
        this.setData({ isWatching: false });
        wx.showToast({
          title: res.msg || '领取失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('[VideoReward] Claim error:', error);
      this.setData({ isWatching: false });
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      });
    }
  },

  // 关闭成功弹窗
  closeSuccess() {
    this.setData({ showSuccess: false });
  },

  // 继续观看
  continueWatch() {
    this.setData({ showSuccess: false });
    this.startWatching();
  },

  // 返回
  goBack() {
    wx.navigateBack();
  }
});
