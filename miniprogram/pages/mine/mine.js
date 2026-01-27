const HISTORY_KEY = 'photoHistory';
const lang = require('../../utils/lang.js');
const { api } = require('../../config/api.js');
const { uploadWxTempFile, COS_CONFIG, getUserId } = require('../../utils/cos.js');
const { canShowRecharge, getPlatformTips, isIOS } = require('../../utils/platform.js');
const configManager = require('../../utils/configManager.js');
const tracker = require('../../utils/tracker.js');

Page({
  data: {
    userInfo: {},
    userId: '',
    isLoggedIn: false, // 是否已登录
    userPoints: 0, // 醒币余额
    // 平台相关
    showRecharge: true, // 是否显示充值入口
    platformTips: {}, // 平台提示信息
    stats: {
      totalPhotos: 0,
      totalSpent: '¥0'
    },
    // 邀请统计
    inviteCount: 0,
    inviteEarnedPoints: 0,
    privacyConfirmed: false,
    privacyConfirmTimeStr: '',
    // 生成中任务
    generatingCount: 0,
    // 醒币明细展开
    showPointsDetail: false,
    recentPointsRecords: [],
    // 昵称弹窗
    showNicknameModal: false,
    tempNickname: '',
    // 语言设置 - 三档切换
    currentLanguage: 'zh-CN',
    languageOptions: ['zh-CN', 'en'],
    // 多语言文本
    i18n: {},
    // 登录弹窗
    showLoginModal: false,
    // 隐私政策弹窗
    showPrivacyModal: false,
    // 个人资料弹窗
    showProfileModal: false,
    tempAvatarUrl: '',
    tempNickname: ''
  },

  onLoad() {
    // 初始化平台相关设置
    this.initPlatformSettings();

    this.loadUserInfo();
    this.loadStats();
    this.loadLanguage();
    this.loadUserPoints();

    // 监听全局历史更新事件，实时刷新进度条
    const app = getApp();
    if (app && app.on) {
      this._historyUpdateHandler = () => {
        this.loadGeneratingCount();
      };
      app.on('historyUpdated', this._historyUpdateHandler);
    }
  },

  onUnload() {
    // 移除事件监听
    const app = getApp();
    if (app && app.off && this._historyUpdateHandler) {
      app.off('historyUpdated', this._historyUpdateHandler);
    }
  },

  onShow() {
    this.loadUserInfo(); // 刷新用户登录状态
    this.loadStats();
    this.loadInviteStats();
    this.loadPrivacyStatus();
    this.loadGeneratingCount();
    this.loadLanguage(); // 每次显示时刷新语言
    this.loadUserPoints(); // 刷新醒币余额
    this.loadRecentPointsRecords(); // 加载最近醒币明细
    // 设置tabBar选中状态并刷新语言和生成计数
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
      this.getTabBar().loadLanguage();
      this.getTabBar().updateGeneratingCount();
    }
  },

  // 初始化平台相关设置
  initPlatformSettings() {
    const showRecharge = canShowRecharge();
    const platformTips = getPlatformTips();
    this.setData({
      showRecharge,
      platformTips
    });
  },

  // 加载用户醒币余额（从服务器）
  async loadUserPoints() {
    // 未登录时显示0
    if (!this.data.isLoggedIn) {
      this.setData({ userPoints: 0 });
      return;
    }

    const app = getApp();
    try {
      const balance = await app.getUserPoints();
      this.setData({ userPoints: balance });
    } catch (error) {
      // 静默处理
      // 失败时使用本地缓存
      const userPoints = wx.getStorageSync('userPoints') || 0;
      this.setData({ userPoints });
    }
  },

  // 切换醒币明细展开/收起
  togglePointsDetail() {
    this.setData({ showPointsDetail: !this.data.showPointsDetail });
  },

  // 加载最近醒币记录（从服务器）
  async loadRecentPointsRecords() {
    if (!this.data.isLoggedIn) {
      this.setData({ recentPointsRecords: [] });
      return;
    }

    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    try {
      const res = await api.getPointsRecords(userId, 1, 3);
      if (res.code === 0 || res.code === 200) {
        const recentRecords = res.data.list.map(record => {
          // 格式化时间，兼容 iOS (将 yyyy-mm-dd 转换为 yyyy/mm/dd)
          const dateStr = record.created_at ? record.created_at.replace(/-/g, '/') : '';
          const date = dateStr ? new Date(dateStr) : new Date();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hour = String(date.getHours()).padStart(2, '0');
          const minute = String(date.getMinutes()).padStart(2, '0');
          return {
            ...record,
            timeStr: `${month}-${day} ${hour}:${minute}`
          };
        });
        this.setData({ recentPointsRecords: recentRecords });
      }
    } catch (error) {
      // 静默处理
    }
  },

  // 跳转到充值页面
  goToRecharge() {
    // 埋点：点击充值
    tracker.trackClick('recharge_entry', 'button', '充值');

    if (!this.data.isLoggedIn) {
      this.showLoginPrompt();
      return;
    }
    // iOS 平台暂时不支持充值
    if (!this.data.showRecharge) {
      wx.showModal({
        title: this.data.i18n.tipTitle || '提示',
        content: this.data.platformTips.rechargeTip || 'iOS 支付功能即将开放，敬请期待',
        showCancel: false,
        confirmText: this.data.i18n.confirm || '知道了'
      });
      return;
    }
    wx.navigateTo({
      url: '/pages/recharge/recharge'
    });
  },

  // 跳转到醒币明细页面
  goToPointsRecord() {
    // 埋点：点击醒币明细
    tracker.trackClick('points_record_entry', 'button', '醒币明细');

    if (!this.data.isLoggedIn) {
      this.showLoginPrompt();
      return;
    }
    wx.navigateTo({
      url: '/pages/points-record/points-record'
    });
  },

  // 加载生成中的任务数量
  loadGeneratingCount() {
    try {
      const history = wx.getStorageSync(HISTORY_KEY) || [];
      const generatingCount = history.filter(item => item.status === 'generating').length;
      this.setData({ generatingCount });
    } catch (e) {
      // 静默处理
    }
  },

  // 跳转到历史页面
  goToHistory() {
    wx.switchTab({
      url: '/pages/history/history'
    });
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    let userId = wx.getStorageSync('userId') || '';
    
    // 兼容：如果没有独立的userId，尝试从userInfo或openid恢复
    if (!userId && userInfo.userId) {
      userId = userInfo.userId;
      wx.setStorageSync('userId', userId);
    }
    if (!userId) {
      const openid = wx.getStorageSync('openid');
      if (openid) {
        userId = openid;
        wx.setStorageSync('userId', userId);
      }
    }
    
    // 有userId就算已登录
    const isLoggedIn = !!userId;
    this.setData({ userInfo, userId, isLoggedIn });
  },

  // 点击登录 - 显示登录弹窗
  wxLogin() {
    this.setData({ showLoginModal: true });
  },

  // 登录弹窗关闭
  onLoginModalClose() {
    this.setData({ showLoginModal: false });
  },

  // 登录成功
  onLoginSuccess(e) {
    const userData = e.detail || {};

    // 从本地存储读取最新的用户信息（app.js已同步）
    const userInfo = wx.getStorageSync('userInfo') || {};

    this.setData({
      showLoginModal: false,
      userInfo: userInfo,
      userId: userData.userId,
      isLoggedIn: true,
      userPoints: userData.points || 0
    });

    // 优先使用服务器返回的协议状态，其次使用本地存储
    const privacyAgreed = userData.privacyAgreed === true;
    const termsAgreed = userData.termsAgreed === true;
    const privacyConfirmed = (privacyAgreed && termsAgreed) || wx.getStorageSync('privacyPolicyConfirmed');

    if (!privacyConfirmed) {
      // 显示隐私政策弹窗（用户不同意会退出小程序）
      this.setData({ showPrivacyModal: true });
    }

    // 刷新其他数据
    this.loadInviteStats();
    this.loadRecentPointsRecords();
    this.loadPrivacyStatus(); // 刷新隐私协议签订状态
  },

  // 隐私政策弹窗关闭
  onPrivacyModalClose() {
    this.setData({ showPrivacyModal: false });
  },

  // 同意隐私政策（由 privacy-modal 组件的 agree 事件触发）
  // 注意：协议签署逻辑已在 privacy-modal 组件中完成，这里只更新页面状态
  onPrivacyAgree() {
    this.setData({
      showPrivacyModal: false,
      privacyConfirmed: true
    });
    // 刷新隐私协议签订状态
    this.loadPrivacyStatus();
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: lang.t('logoutTitle'),
      content: lang.t('logoutConfirm'),
      cancelText: lang.t('cancel'),
      confirmText: lang.t('confirm'),
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          // 调用app的logout方法
          const app = getApp();
          app.logout();

          this.setData({
            userInfo: {},
            userId: '',
            isLoggedIn: false,
            userPoints: 0,
            privacyConfirmed: false,
            privacyConfirmTimeStr: '',
            generatingCount: 0,
            inviteCount: 0,
            inviteEarnedPoints: 0,
            recentPointsRecords: [],
            stats: { totalPhotos: 0, totalSpent: '¥0' }
          });

          wx.showToast({ title: lang.t('logoutSuccess'), icon: 'success' });
        }
      }
    });
  },

  // 加载统计数据（优先从服务器获取）
  async loadStats() {
    if (!this.data.isLoggedIn) {
      this.setData({ stats: { totalPhotos: 0, totalSpent: '0醒币' } });
      return;
    }

    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    try {
      // 从服务器获取用户统计
      const res = await api.getUserStats(userId);
      if (res.code === 0 || res.code === 200) {
        this.setData({
          stats: {
            totalPhotos: res.data.totalPhotos || 0,
            totalSpent: (res.data.totalSpent || 0) + '醒币'
          }
        });
        return;
      }
    } catch (error) {
      // 静默处理
    }

    // 服务器获取失败，回退到本地缓存
    const history = wx.getStorageSync('photoHistory') || [];
    const totalPhotos = history.filter(item => item.status === 'done' || item.status === 'success').length;
    const totalSpent = totalPhotos * 30;
    this.setData({
      stats: {
        totalPhotos,
        totalSpent: totalSpent + '醒币'
      }
    });
  },

  // 加载邀请统计（从服务器）
  async loadInviteStats() {
    if (!this.data.isLoggedIn) {
      this.setData({ inviteCount: 0, inviteEarnedPoints: 0 });
      return;
    }

    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    try {
      const res = await api.getInviteStats(userId);
      if (res.code === 0 || res.code === 200 || (res && !res.code)) {
        const data = res.data || res;
        this.setData({
          inviteCount: data.invitedCount || 0,
          inviteEarnedPoints: data.earnedPoints || 0
        });
      }
    } catch (error) {
      // 静默处理
      // 使用本地缓存或默认值
      const inviteCount = wx.getStorageSync('inviteCount') || 0;
      this.setData({ inviteCount, inviteEarnedPoints: 0 });
    }
  },

  // 加载隐私政策确认状态
  loadPrivacyStatus() {
    const privacyConfirmed = wx.getStorageSync('privacyPolicyConfirmed') || false;
    const privacyConfirmTime = wx.getStorageSync('privacyConfirmTime') || 0;
    let privacyConfirmTimeStr = '';

    if (privacyConfirmed && privacyConfirmTime) {
      // privacyConfirmTime 是时间戳，不需要特殊处理日期格式
      const date = new Date(privacyConfirmTime);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hour = String(date.getHours()).padStart(2, '0');
      const minute = String(date.getMinutes()).padStart(2, '0');
      const second = String(date.getSeconds()).padStart(2, '0');
      privacyConfirmTimeStr = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    }

    this.setData({ privacyConfirmed, privacyConfirmTimeStr });
  },

  // 选择头像 - 旧方法保留兼容
  onChooseAvatar() {
    this.showProfileModal();
  },

  // 显示头像操作菜单
  showAvatarActionSheet() {
    if (!this.data.isLoggedIn) {
      this.showLoginPrompt();
      return;
    }
    const { i18n } = this.data;
    wx.showActionSheet({
      itemList: [
        i18n.mine_changeAvatar || '更换头像',
        i18n.mine_viewLargeImage || '查看大图'
      ],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 更换头像
          this.showProfileModal();
        } else if (res.tapIndex === 1) {
          // 查看大图
          const avatarUrl = this.data.userInfo.avatarUrl;
          if (avatarUrl) {
            wx.previewImage({
              urls: [avatarUrl],
              current: avatarUrl
            });
          }
        }
      }
    });
  },

  // ========== 直接编辑头像和昵称（无弹窗） ==========
  // 直接选择头像并保存
  async onChooseAvatarDirect(e) {
    const { avatarUrl } = e.detail;
    if (!avatarUrl) return;

    const { userInfo } = this.data;

    // 如果是临时文件路径，需要上传到COS
    let newAvatarUrl = avatarUrl;
    if (avatarUrl.startsWith('http://tmp') || avatarUrl.startsWith('wxfile://')) {
      const { i18n } = this.data;
      wx.showLoading({ title: i18n.mine_uploadingAvatar || '上传头像中...', mask: true });
      try {
        const cosUserId = getUserId();
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substr(2, 9);
        const fileName = `avatar_${timestamp}_${randomStr}.jpg`;
        // 扁平化路径: {userId}_avatar_{filename}
        const key = `${cosUserId}_avatar_${fileName}`;

        const cosUrl = await uploadWxTempFile(avatarUrl, key);
        newAvatarUrl = cosUrl;
      } catch (error) {
        // 静默处理
        wx.hideLoading();
        wx.showToast({ title: i18n.mine_avatarUploadFailed || '头像上传失败', icon: 'none' });
        return;
      }
      wx.hideLoading();
    }

    // 更新本地数据
    const newUserInfo = {
      ...userInfo,
      avatarUrl: newAvatarUrl
    };
    wx.setStorageSync('userInfo', newUserInfo);
    this.setData({ userInfo: newUserInfo });

    // 更新到服务器
    const userId = wx.getStorageSync('userId');
    if (userId) {
      try {
        await api.updateUserInfo(userId, { avatarUrl: newAvatarUrl });
      } catch (error) {
        // 静默处理
      }
    }

    wx.showToast({ title: this.data.i18n.mine_avatarUpdated || '头像已更新', icon: 'success' });
  },

  // 直接编辑昵称并保存
  async onNicknameBlurDirect(e) {
    const newNickname = (e.detail.value || '').trim();
    const { userInfo } = this.data;

    // 如果昵称没有变化或为空，不做处理
    if (!newNickname || newNickname === userInfo.nickName) {
      return;
    }

    // 更新本地数据
    const newUserInfo = {
      ...userInfo,
      nickName: newNickname
    };
    wx.setStorageSync('userInfo', newUserInfo);
    this.setData({ userInfo: newUserInfo });

    // 更新到服务器
    const userId = wx.getStorageSync('userId');
    if (userId) {
      try {
        await api.updateUserInfo(userId, { nickname: newNickname });
        wx.showToast({ title: this.data.i18n.mine_nicknameUpdated || '昵称已更新', icon: 'success' });
      } catch (error) {
        // 静默处理
      }
    }
  },

  // ========== 个人资料弹窗（保留兼容） ==========
  // 显示个人资料弹窗
  showProfileModal() {
    this.setData({
      showProfileModal: true,
      tempAvatarUrl: '',
      tempNickname: this.data.userInfo.nickName || ''
    });
  },

  // 隐藏个人资料弹窗
  hideProfileModal() {
    this.setData({
      showProfileModal: false,
      tempAvatarUrl: '',
      tempNickname: ''
    });
  },

  // 选择头像（资料弹窗内）
  onChooseAvatarProfile(e) {
    const { avatarUrl } = e.detail;
    this.setData({ tempAvatarUrl: avatarUrl });
  },

  // 昵称输入
  onProfileNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value });
  },

  // 昵称输入完成
  onProfileNicknameBlur(e) {
    this.setData({ tempNickname: e.detail.value });
  },

  // 保存个人资料
  async saveProfile() {
    const { tempAvatarUrl, tempNickname, userInfo, i18n } = this.data;
    let newAvatarUrl = tempAvatarUrl || userInfo.avatarUrl;
    const newNickname = tempNickname.trim() || userInfo.nickName;

    if (!newNickname) {
      wx.showToast({ title: i18n.mine_nicknameRequired || '请输入昵称', icon: 'none' });
      return;
    }

    // 如果选择了新头像（临时文件路径），需要上传到COS
    if (tempAvatarUrl && tempAvatarUrl.startsWith('http://tmp') || tempAvatarUrl && tempAvatarUrl.startsWith('wxfile://')) {
      wx.showLoading({ title: i18n.mine_uploadingAvatar || '上传头像中...', mask: true });
      try {
        // 生成头像文件名
        const cosUserId = getUserId();
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substr(2, 9);
        const fileName = `avatar_${timestamp}_${randomStr}.jpg`;
        // 扁平化路径: {userId}_avatar_{filename}
        const key = `${cosUserId}_avatar_${fileName}`;

        // 上传到COS
        const cosUrl = await uploadToCOS(tempAvatarUrl, key);
        newAvatarUrl = cosUrl;
      } catch (error) {
        // 静默处理
        wx.hideLoading();
        wx.showToast({ title: i18n.mine_avatarUploadFailed || '头像上传失败', icon: 'none' });
        return;
      }
      wx.hideLoading();
    }

    // 更新本地数据
    const newUserInfo = {
      ...userInfo,
      avatarUrl: newAvatarUrl,
      nickName: newNickname
    };

    // 保存到本地存储
    wx.setStorageSync('userInfo', newUserInfo);

    // 更新到服务器
    const userId = wx.getStorageSync('userId');
    if (userId) {
      try {
        await api.updateUserInfo(userId, {
          nickname: newNickname,
          avatarUrl: newAvatarUrl
        });
      } catch (error) {
        // 静默处理
      }
    }

    this.setData({
      userInfo: newUserInfo,
      showProfileModal: false,
      tempAvatarUrl: '',
      tempNickname: ''
    });

    wx.showToast({ title: i18n.mine_saveSuccess || '保存成功', icon: 'success' });
  },

  // 阻止滚动穿透
  preventTouchMove() {
    return false;
  },

  // 阻止点击穿透
  preventTap() {
    // 空函数，仅用于阻止事件冒泡
  },

  // ========== 昵称编辑 ==========
  showNicknameModal() {
    if (!this.data.isLoggedIn) {
      this.showLoginPrompt();
      return;
    }
    this.setData({
      showNicknameModal: true,
      tempNickname: this.data.userInfo.nickName || ''
    });
  },

  showEditNickname() {
    this.showNicknameModal();
  },

  hideNicknameModal() {
    this.setData({ showNicknameModal: false });
  },

  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value });
  },

  // 微信昵称审核回调（用户选择微信昵称时触发）
  onNicknameReview(e) {
    // 当用户从微信获取昵称时，会触发此回调
    if (e.detail.pass) {
      this.setData({ tempNickname: e.detail.nickname });
    }
  },

  async saveNickname() {
    const nickname = this.data.tempNickname.trim();
    if (!nickname) {
      wx.showToast({ title: lang.t('pleaseEnterNickname'), icon: 'none' });
      return;
    }

    const userId = wx.getStorageSync('userId');
    if (userId) {
      try {
        // 更新到服务器
        await api.updateUserInfo(userId, { nickname });
      } catch (error) {
        // 静默处理
      }
    }

    const userInfo = this.data.userInfo;
    userInfo.nickName = nickname;
    wx.setStorageSync('userInfo', userInfo);
    this.setData({
      userInfo,
      showNicknameModal: false
    });
    wx.showToast({ title: lang.t('nicknameSaved'), icon: 'success' });
  },

  // ========== 其他功能 ==========
  // 显示登录提示弹窗
  showLoginPrompt() {
    wx.showModal({
      title: this.data.i18n.loginRequired || '需要登录',
      content: this.data.i18n.loginRequiredContent || '请先登录后再使用此功能',
      confirmText: this.data.i18n.goLogin || '去登录',
      cancelText: this.data.i18n.cancel || '取消',
      success: (res) => {
        if (res.confirm) {
          this.wxLogin();
        }
      }
    });
  },

  // 跳转到邀请好友页面
  goToInvite() {
    if (!this.data.isLoggedIn) {
      this.showLoginPrompt();
      return;
    }
    wx.navigateTo({
      url: '/pages/invite/invite'
    });
  },

  // 跳转到看视频得醒币页面
  goToVideoReward() {
    if (!this.data.isLoggedIn) {
      this.showLoginPrompt();
      return;
    }
    wx.navigateTo({
      url: '/pages/video-reward/video-reward'
    });
  },

  // 意见反馈
  goToFeedback() {
    if (!this.data.isLoggedIn) {
      this.showLoginPrompt();
      return;
    }
    wx.navigateTo({
      url: '/pages/feedback/feedback'
    });
  },

  // 关于我们
  goToAbout() {
    wx.navigateTo({
      url: '/pages/about/about'
    });
  },

  // 隐私政策
  goToPrivacy() {
    wx.navigateTo({
      url: '/pages/privacy/privacy'
    });
  },

  // 用户协议
  goToTerms() {
    wx.navigateTo({
      url: '/pages/terms/terms'
    });
  },

  // ========== 语言设置 ==========
  // 加载语言设置
  loadLanguage() {
    const currentLanguage = lang.getCurrentLang();
    const i18n = lang.getLangData();
    this.setData({
      currentLanguage,
      i18n
    });
    // 动态设置导航栏标题
    wx.setNavigationBarTitle({
      title: i18n.mine_pageTitle || '我的'
    });
  },

  // 切换语言（三档开关）
  switchLanguage(e) {
    const langCode = e.currentTarget.dataset.lang;
    if (langCode === this.data.currentLanguage) return;

    lang.setLang(langCode);
    const i18n = lang.getLangData();
    this.setData({
      currentLanguage: langCode,
      i18n
    });

    // 实时更新导航栏标题
    wx.setNavigationBarTitle({
      title: i18n.mine_pageTitle || '我的'
    });

    // 同时刷新 TabBar 的语言
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().loadLanguage();
    }

    // 刷新配置管理器缓存，使其他页面能获取新语言的配置
    configManager.refresh();
  },

  // 分享给好友
  onShareAppMessage() {
    const userId = wx.getStorageSync('userId') || '';
    return {
      title: lang.t('shareTitle'),
      path: `/pages/index/index?inviter=${userId}`,
      imageUrl: '/images/share-cover.png'
    };
  }
});