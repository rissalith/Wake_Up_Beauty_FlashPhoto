/**
 * 看视频得醒币页面
 */
const { request } = require('../../config/api');
const { getBeijingDateString } = require('../../utils/timeUtil');

const MAX_DAILY_COUNT = 5; // 每日最多观看次数

Page({
  data: {
    todayCount: 0,           // 今日已领取次数
    remainCount: 5,          // 今日剩余次数
    totalEarned: 0,          // 累计获得醒币
    pointsPerVideo: 10,      // 每次奖励醒币
    currentBalance: 0,       // 当前余额
    isWatching: false,       // 是否正在观看
    watchProgress: 0,        // 观看进度 0-100
    showSuccess: false,      // 是否显示成功动画
    earnedPoints: 0,         // 本次获得的醒币
    videoDuration: 15,       // 视频时长（秒）
    countdown: 15            // 倒计时
  },

  watchTimer: null,

  onLoad() {
    this.loadStatus();
  },

  onShow() {
    // 每次显示页面时刷新状态
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
        this.setData({ remainCount: 0 });
        return;
      }

      // 先从本地获取今日观看次数和累计获得
      const todayKey = `video_reward_${userId}_${this.getTodayStr()}`;
      const totalKey = `video_reward_total_${userId}`;
      const localCount = wx.getStorageSync(todayKey) || 0;
      const localTotal = wx.getStorageSync(totalKey) || 0;

      this.setData({
        todayCount: localCount,
        remainCount: Math.max(0, MAX_DAILY_COUNT - localCount),
        totalEarned: localTotal
      });

      // 尝试从服务器获取
      try {
        const res = await request({
          url: `/video-reward/status/${userId}`,
          method: 'GET'
        });

        if (res.code === 0) {
          const serverCount = res.data.todayCount || 0;
          const serverTotal = res.data.totalPoints || localTotal;
          // 使用服务器和本地的较大值
          const actualCount = Math.max(serverCount, localCount);
          const actualTotal = Math.max(serverTotal, localTotal);
          this.setData({
            todayCount: actualCount,
            remainCount: Math.max(0, MAX_DAILY_COUNT - actualCount),
            totalEarned: actualTotal,
            pointsPerVideo: res.data.pointsPerVideo || 10,
            currentBalance: res.data.currentBalance || 0
          });
        }
      } catch (e) {
        // 服务器请求失败，使用本地数据
        console.log('[VideoReward] Server request failed, using local data');
      }

    } catch (error) {
      console.error('[VideoReward] Load status error:', error);
    }
  },

  // 获取今天的日期字符串 (北京时间: YYYY-MM-DD)
  getTodayStr() {
    return getBeijingDateString();
  },

  // 开始观看视频
  startWatching() {
    if (this.data.isWatching) return;
    if (this.data.remainCount <= 0) {
      wx.showToast({
        title: '今日次数已用完',
        icon: 'none'
      });
      return;
    }

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
    const userId = wx.getStorageSync('userId');
    const pointsPerVideo = this.data.pointsPerVideo;

    try {
      // 先调用服务器API
      const res = await request({
        url: '/video-reward/claim',
        method: 'POST',
        data: {
          userId,
          videoId: 'default',
          watchDuration: this.data.videoDuration
        }
      });

      if (res.code === 0) {
        // 服务器成功后，更新本地存储
        const todayKey = `video_reward_${userId}_${this.getTodayStr()}`;
        const totalKey = `video_reward_total_${userId}`;
        const newCount = this.data.todayCount + 1;
        const newTotal = this.data.totalEarned + res.data.pointsEarned;
        wx.setStorageSync(todayKey, newCount);
        wx.setStorageSync(totalKey, newTotal);
        wx.setStorageSync('userPoints', res.data.newBalance);

        this.setData({
          isWatching: false,
          showSuccess: true,
          earnedPoints: res.data.pointsEarned,
          currentBalance: res.data.newBalance,
          todayCount: newCount,
          totalEarned: newTotal,
          remainCount: Math.max(0, MAX_DAILY_COUNT - newCount)
        });
      } else if (res.code === -3) {
        // 今日次数已达上限
        this.setData({
          isWatching: false,
          remainCount: 0,
          todayCount: res.data?.todayCount || MAX_DAILY_COUNT
        });
        wx.showToast({
          title: res.msg || '今日次数已用完',
          icon: 'none'
        });
      } else {
        // 其他错误
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
        title: '网络错误，请重试',
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
    if (this.data.remainCount <= 0) {
      this.setData({ showSuccess: false });
      wx.showToast({
        title: '今日次数已用完',
        icon: 'none'
      });
      return;
    }
    this.setData({ showSuccess: false });
    this.startWatching();
  }
});
