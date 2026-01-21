// 醒美闪图 - AI智能证件照小程序
const lang = require('./utils/lang');
const { api, request, IS_TEST_MODE, TEST_CONFIG } = require('./config/api');
const configManager = require('./utils/configManager');
const preloader = require('./utils/preloader');

App({
  onLaunch(options) {
    // 使用新 API 替代已废弃的 wx.getSystemInfoSync
    const deviceInfo = wx.getDeviceInfo();
    const windowInfo = wx.getWindowInfo();
    const appBaseInfo = wx.getAppBaseInfo();
    
    // 组合系统信息，保持向后兼容
    const systemInfo = {
      ...deviceInfo,
      ...windowInfo,
      ...appBaseInfo,
      statusBarHeight: windowInfo.statusBarHeight,
      screenWidth: windowInfo.screenWidth,
      screenHeight: windowInfo.screenHeight,
      windowWidth: windowInfo.windowWidth,
      windowHeight: windowInfo.windowHeight,
      pixelRatio: windowInfo.pixelRatio,
      platform: deviceInfo.platform,
      system: deviceInfo.system,
      brand: deviceInfo.brand,
      model: deviceInfo.model,
      language: appBaseInfo.language,
      theme: appBaseInfo.theme
    };
    
    this.globalData.theme = systemInfo.theme || 'light';
    this.globalData.language = systemInfo.language.includes('zh') ? 'zh' : 'en';
    this.globalData.systemInfo = systemInfo; // 缓存系统信息，避免重复获取

    // 检查邀请者参数
    if (options.query && options.query.inviter) {
      this.globalData.inviterId = options.query.inviter;
    }

    // 初始化网络状态监听
    this.initNetworkListener();

    // 立即预加载所有图片资源（不等登录，提升语言切换体验）
    preloader.preloadAllImages();

    // 并行执行初始化任务，不阻塞启动
    Promise.all([
      this.initConfig(),
      this.silentLogin()
    ]).catch(() => {});
  },

  // 网络状态监听
  initNetworkListener() {
    // 获取初始网络状态
    wx.getNetworkType({
      success: (res) => {
        this.globalData.networkType = res.networkType;
        this.globalData.isConnected = res.networkType !== 'none';
      }
    });

    // 监听网络状态变化
    wx.onNetworkStatusChange((res) => {
      const wasConnected = this.globalData.isConnected;
      this.globalData.networkType = res.networkType;
      this.globalData.isConnected = res.isConnected;

      // 网络断开提示
      if (wasConnected && !res.isConnected) {
        wx.showToast({
          title: '网络已断开',
          icon: 'none',
          duration: 3000
        });
        this.emit('networkDisconnected');
      }
      
      // 网络恢复提示
      if (!wasConnected && res.isConnected) {
        wx.showToast({
          title: '网络已恢复',
          icon: 'success',
          duration: 2000
        });
        this.emit('networkConnected');
      }

      // 触发网络状态变化事件
      this.emit('networkStatusChange', res);
    });
  },

  // 初始化中台配置
  async initConfig() {
    try {
      const config = await configManager.init();
      this.globalData.midplatformConfig = config;
      this.globalData.configReady = true;

      // 检查公告
      const announcement = configManager.getAnnouncement();
      if (announcement) {
        this.globalData.announcement = announcement;
      }
    } catch (error) {
      this.globalData.configReady = true; // 即使失败也标记为ready，使用保底配置
    }
  },

  // 获取配置管理器
  getConfigManager() {
    return configManager;
  },

  // 获取预加载器
  getPreloader() {
    return preloader;
  },

  // 预加载所有资源（后台执行，不阻塞UI）
  preloadResources() {
    // 使用 setTimeout 确保不阻塞当前流程
    setTimeout(() => {
      preloader.preloadAll().catch(() => {});
    }, 100);
  },

  // 静默登录（不需要用户交互）
  // 只恢复已有的登录状态,不自动创建新用户
  async silentLogin() {
    // 检查本地是否有登录信息
    let userId = wx.getStorageSync('userId');
    const sessionKey = wx.getStorageSync('session_key');
    const userInfo = wx.getStorageSync('userInfo');

    // 兼容：如果没有独立的userId，尝试从userInfo恢复
    if (!userId && userInfo && userInfo.userId) {
      userId = userInfo.userId;
      wx.setStorageSync('userId', userId);
    }
    // 注意：不再将 openid 当作 userId 使用，这会导致数据关联混乱
    // 如果没有有效的 userId，需要用户重新登录

    if (userId && (sessionKey || userInfo)) {
      // 已有登录态，恢复全局数据
      this.globalData.userId = userId;
      this.globalData.userInfo = wx.getStorageSync('userInfo');
      this.globalData.userPoints = wx.getStorageSync('userPoints') || 0;
      this.globalData.isLoggedIn = true;

      // 补报历史协议签署状态（如果本地已确认但未同步到服务器）
      this.syncAgreementStatus(userId);

      // 已登录用户也预加载资源
      this.preloadResources();

      return true;
    }

    // 新用户：不自动创建账号,等用户主动操作时再登录
    return false;
  },

  // 恢复用户数据（从服务器同步到本地）
  async restoreUserData(userId) {
    try {
      // 恢复照片历史
      const historyRes = await api.getPhotoHistory(userId, { pageSize: 100 });
      if ((historyRes.code === 0 || historyRes.code === 200) && historyRes.data?.list?.length > 0) {
        const serverHistory = historyRes.data.list.map(item => ({
          id: item.photo_id || item.id,
          createTime: item.created_at ? new Date(item.created_at.replace(/-/g, '/')).getTime() : Date.now(),
          status: item.status || 'done',
          resultImage: item.result_image || '',
          originalImage: item.original_image || '',
          spec: item.spec || '证件照',
          bgName: item.bg_color || '',
          synced: true
        }));
        wx.setStorageSync('photoHistory', serverHistory);
      }

      // 触发历史更新事件
      this.emit('historyUpdated');
    } catch (err) {
      // 静默处理
    }
  },

  // 同步协议签署状态到服务器（用于补报历史数据）
  async syncAgreementStatus(userId) {
    const privacyConfirmed = wx.getStorageSync('privacyPolicyConfirmed');
    const alreadySynced = wx.getStorageSync('agreementSynced');

    if (privacyConfirmed && !alreadySynced) {
      try {
        // 使用 'all' 类型一次性同步两个协议
        await api.signAgreement(userId, 'all');
        wx.setStorageSync('agreementSynced', true);
      } catch (err) {
        // 静默处理
      }
    }
  },

  // 微信登录（获取openid和unionid）- 用户主动触发
  async wxLogin() {
    return new Promise((resolve, reject) => {
      console.log('[wxLogin] 调用 wx.login...');
      wx.login({
        success: async (res) => {
          console.log('[wxLogin] wx.login 成功, code:', res.code ? '已获取' : '未获取');
          if (res.code) {
            try {
              // 调用后端接口，用code换取openid和unionid
              console.log('[wxLogin] 调用后端 /user/wx-login 接口...');
              const loginRes = await api.wxLogin({ code: res.code });
              console.log('[wxLogin] 后端响应:', JSON.stringify(loginRes));

              if (loginRes.code === 200) {
                // 保存登录凭证
                wx.setStorageSync('session_key', loginRes.data.session_key || loginRes.data.sessionKey || 'logged');
                wx.setStorageSync('openid', loginRes.data.openid);
                console.log('[wxLogin] openid 已保存:', loginRes.data.openid);

                // UnionID 优先，没有则用 openid（开发阶段兼容）
                if (loginRes.data.unionid) {
                  wx.setStorageSync('unionid', loginRes.data.unionid);
                  console.log('[wxLogin] unionid 已保存');
                } else {
                  console.log('[wxLogin] 未获取到 unionid（小程序可能未绑定开放平台）');
                }
                resolve(loginRes.data);
              } else {
                // 显示更详细的错误信息
                const errorDetail = loginRes.errmsg || loginRes.detail || '';
                console.error('[wxLogin] 后端返回错误:', loginRes.msg, errorDetail);
                const errorMsg = errorDetail ? `${loginRes.msg} (${errorDetail})` : loginRes.msg;
                reject(new Error(errorMsg || '登录失败'));
              }
            } catch (error) {
              // 显示更详细的错误信息
              const errorMsg = error.msg || error.message || '网络请求失败';
              const errorDetail = error.errmsg || error.detail || '';
              console.error('[wxLogin] 请求后端失败:', errorMsg, errorDetail, error);
              reject(new Error(errorDetail ? `${errorMsg}: ${errorDetail}` : errorMsg));
            }
          } else {
            console.error('[wxLogin] wx.login 未返回 code');
            reject(new Error('微信登录失败'));
          }
        },
        fail: (err) => {
          console.error('[wxLogin] wx.login 失败:', err);
          reject(err);
        }
      });
    });
  },

  // 完整登录流程（微信登录 + 用户注册/登录）
  async userLogin(userInfo = {}) {
    try {
      console.log('[userLogin] 开始完整登录流程...');
      
      // 第一步：调用wx.login获取code，然后换取openid和unionid
      const wxLoginData = await this.wxLogin();
      const openid = wxLoginData.openid;
      const unionid = wxLoginData.unionid || null;
      console.log('[userLogin] 获取到 openid:', openid, 'unionid:', unionid ? '有' : '无');

      // 第二步：调用后端用户登录/注册接口
      // 优先使用 unionid 作为用户标识，没有则用 openid
      console.log('[userLogin] 调用后端 /user/login 接口...');
      const res = await api.login({
        openid: openid,
        unionid: unionid,
        nickname: userInfo.nickName || null,
        avatarUrl: userInfo.avatarUrl || null,
        inviterId: this.globalData.inviterId || null
      });
      console.log('[userLogin] 后端响应:', JSON.stringify(res));

      if (res.code === 0 || res.code === 200) {
        console.log('[userLogin] 登录成功，处理用户数据...');
        // 保存用户信息到本地和全局
        const userData = res.data;
        // 兼容不同的字段名：userId, user_id, id
        const userId = userData.userId || userData.user_id || userData.id || openid;
        // 优先使用用户刚设置的头像昵称，其次用服务器返回的
        const finalNickname = userInfo.nickName || userData.nickname;
        const finalAvatarUrl = userInfo.avatarUrl || userData.avatarUrl;

        this.globalData.userId = userId;
        this.globalData.userInfo = {
          nickName: finalNickname,
          avatarUrl: finalAvatarUrl,
          userId: userId
        };
        this.globalData.userPoints = userData.points;
        this.globalData.isLoggedIn = true;
        this.globalData.unionid = userData.unionid;

        // 同步到本地存储
        wx.setStorageSync('userId', userId);
        wx.setStorageSync('userInfo', this.globalData.userInfo);
        wx.setStorageSync('userPoints', userData.points);
        if (userData.unionid) {
          wx.setStorageSync('unionid', userData.unionid);
        }
        
        // 保存协议签署状态（完全信任服务器状态）
        const privacyAgreed = userData.privacyAgreed === true;
        const termsAgreed = userData.termsAgreed === true;

        if (privacyAgreed && termsAgreed) {
          // 服务器显示已签署，同步到本地缓存
          wx.setStorageSync('privacyPolicyConfirmed', true);
          wx.setStorageSync('privacyConfirmTime', userData.agreementTime || Date.now());
        } else {
          // 服务器显示未签署，清除本地缓存
          wx.removeStorageSync('privacyPolicyConfirmed');
          wx.removeStorageSync('privacyConfirmTime');
        }

        // 触发登录成功事件，包含完整的用户信息
        const fullUserData = {
          ...userData,
          nickname: finalNickname,
          avatarUrl: finalAvatarUrl
        };
        this.emit('userLogin', fullUserData);

        // 登录成功后，后台预加载所有资源（不阻塞返回）
        this.preloadResources();

        return fullUserData;
      } else {
        throw new Error(res.msg || '登录失败');
      }
    } catch (error) {
      throw error;
    }
  },

  // 检查登录状态
  checkLogin() {
    const userId = wx.getStorageSync('userId');
    const userInfo = wx.getStorageSync('userInfo');
    if (userId && userInfo) {
      this.globalData.userId = userId;
      this.globalData.userInfo = userInfo;
      this.globalData.isLoggedIn = true;
      return true;
    }
    return false;
  },

  // 检查是否需要显示隐私政策
  checkPrivacyPolicy() {
    return !wx.getStorageSync('privacyPolicyConfirmed');
  },

  // 确认隐私政策（异步，返回 Promise）
  async confirmPrivacyPolicy() {
    const userId = this.globalData.userId || wx.getStorageSync('userId');
    if (!userId) {
      throw new Error('用户未登录');
    }

    try {
      // 先调用服务器 API，确保服务器保存成功
      await api.signAgreement(userId, 'all');

      // 服务器保存成功后，更新本地缓存
      const now = Date.now();
      wx.setStorageSync('privacyPolicyConfirmed', true);
      wx.setStorageSync('privacyConfirmTime', now);

      this.emit('privacyConfirmed');
      return true;
    } catch (err) {
      // 不更新本地状态，让用户重试
      throw err;
    }
  },

  // 更新用户信息
  async updateUserInfo(userInfo) {
    const userId = this.globalData.userId || wx.getStorageSync('userId');
    if (!userId) {
      throw new Error('用户未登录');
    }

    try {
      const res = await api.updateUserInfo(userId, {
        nickname: userInfo.nickname,
        avatarUrl: userInfo.avatarUrl
      });

      if (res.code === 0 || res.code === 200) {
        // 更新本地和全局数据
        this.globalData.userInfo = {
          ...this.globalData.userInfo,
          nickName: userInfo.nickname,
          avatarUrl: userInfo.avatarUrl
        };
        wx.setStorageSync('userInfo', this.globalData.userInfo);
        return true;
      } else {
        throw new Error(res.msg || '更新失败');
      }
    } catch (error) {
      throw error;
    }
  },

  // 获取用户醒币余额（从服务器）
  async getUserPoints() {
    const userId = this.globalData.userId || wx.getStorageSync('userId');
    if (!userId) {
      return wx.getStorageSync('userPoints') || 0;
    }

    try {
      const res = await api.getPointsBalance(userId);
      if (res.code === 0 || res.code === 200) {
        const balance = res.data.points !== undefined ? res.data.points : res.data.balance;
        this.globalData.userPoints = balance || 0;
        wx.setStorageSync('userPoints', balance || 0);
        return balance || 0;
      }
    } catch (error) {
      // 静默处理
    }

    // 失败时返回本地缓存
    return wx.getStorageSync('userPoints') || 0;
  },

  // 消费醒币
  async consumePoints(amount, description = '消费') {
    const userId = this.globalData.userId || wx.getStorageSync('userId');
    if (!userId) {
      throw new Error('用户未登录');
    }

    try {
      const res = await api.consumePoints({
        userId,
        amount,
        description
      });

      if (res.code === 0 || res.code === 200) {
        const newBalance = res.data.balance;
        this.globalData.userPoints = newBalance;
        wx.setStorageSync('userPoints', newBalance);
        return newBalance;
      } else if (res.code === -2) {
        // 余额不足
        throw new Error('醒币不足');
      } else {
        throw new Error(res.msg || '消费失败');
      }
    } catch (error) {
      throw error;
    }
  },

  // 充值醒币（测试阶段直接增加）
  async rechargePoints(amount, paymentId = null) {
    const userId = this.globalData.userId || wx.getStorageSync('userId');
    if (!userId) {
      throw new Error('用户未登录');
    }

    try {
      // 1. 先创建充值订单
      const createRes = await request({
        url: '/recharge/create',
        method: 'POST',
        data: {
          userId,
          customAmount: Math.ceil(amount / 10) // 粗略转换回金额，用于模拟
        }
      });

      if (createRes.code !== 200) {
        throw new Error(createRes.msg || '创建订单失败');
      }

      const orderId = createRes.data.orderId;

      // 2. 模拟支付成功
      const res = await api.mockPay({ orderId });

      if (res.code === 0 || res.code === 200) {
        const newBalance = res.data.balance;
        this.globalData.userPoints = newBalance;
        wx.setStorageSync('userPoints', newBalance);
        return newBalance;
      } else {
        throw new Error(res.msg || '充值失败');
      }
    } catch (error) {
      throw error;
    }
  },

  // 退还醒币（用于系统错误时）
  async refundPoints(amount, description = '系统退还') {
    const userId = this.globalData.userId || wx.getStorageSync('userId');
    if (!userId) {
      throw new Error('用户未登录');
    }

    try {
      const res = await api.refundPoints({
        userId,
        amount,
        description
      });

      if (res.code === 0 || res.code === 200) {
        const newBalance = res.data.balance;
        this.globalData.userPoints = newBalance;
        wx.setStorageSync('userPoints', newBalance);
        return newBalance;
      } else {
        throw new Error(res.msg || '退还失败');
      }
    } catch (error) {
      throw error;
    }
  },

  // 退出登录
  logout() {
    // 清除本地存储的用户数据
    wx.removeStorageSync('userId');
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('userPoints');
    wx.removeStorageSync('session_key');
    wx.removeStorageSync('openid');
    wx.removeStorageSync('unionid');
    // 保留隐私政策确认状态，不需要重新确认
    // wx.removeStorageSync('privacyPolicyConfirmed');
    // wx.removeStorageSync('privacyConfirmTime');
    // 注意：photoHistory保留在服务器，本地缓存可清除
    wx.removeStorageSync('photoHistory');

    // 清除全局数据
    this.globalData.userId = null;
    this.globalData.userInfo = null;
    this.globalData.userPoints = 0;
    this.globalData.isLoggedIn = false;
    this.globalData.unionid = null;

    // 触发事件通知其他页面
    this.emit('userLogout');
    this.emit('historyUpdated');
  },

  // 简单的事件系统
  _eventListeners: {},

  // 监听事件
  on(eventName, callback) {
    if (!this._eventListeners[eventName]) {
      this._eventListeners[eventName] = [];
    }
    this._eventListeners[eventName].push(callback);
  },

  // 取消监听
  off(eventName, callback) {
    if (this._eventListeners[eventName]) {
      const index = this._eventListeners[eventName].indexOf(callback);
      if (index > -1) {
        this._eventListeners[eventName].splice(index, 1);
      }
    }
  },

  // 触发事件
  emit(eventName, data) {
    if (this._eventListeners[eventName]) {
      this._eventListeners[eventName].forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          // 静默处理
        }
      });
    }
  },

  globalData: {
    theme: null,
    language: 'zh',
    inviterId: null,    // 邀请者ID
    userId: null,       // 当前用户ID（内部主键）
    unionid: null,      // 用户UnionID（矩阵产品核心标识）
    userInfo: null,     // 用户信息
    userPoints: 0,      // 醒币余额
    isLoggedIn: false,  // 是否已登录
    // 网络状态
    networkType: 'unknown', // 网络类型: wifi/2g/3g/4g/5g/unknown/none
    isConnected: true,      // 是否有网络连接
    // 配置状态
    configReady: false,     // 中台配置是否加载完成
    configUpdated: false    // 配置是否有更新
  }
});