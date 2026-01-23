const lang = require('../../utils/lang.js');
const { canShowRecharge, isIOS, getPlatformTips, shouldUseVirtualPayment, getPaymentMethod } = require('../../utils/platform.js');
const { api } = require('../../config/api.js');

Page({
  data: {
    userPoints: 0,
    packages: [],
    selectedPackage: null,
    customAmount: '',
    customPoints: 0,      // 自定义金额对应的基础醒币
    customBonusPoints: 0, // 自定义金额对应的赠送醒币
    isCustom: false,
    loading: false,
    i18n: {},
    // 平台相关
    showRecharge: true,   // 是否显示充值
    platformTips: {},     // 平台提示
    isTestMode: false,    // 测试模式关闭，使用真实支付
    // 虚拟支付相关
    isVirtualPayment: false,  // 是否使用虚拟支付
    paymentMethod: 'normal'   // 'virtual' | 'normal'
  },

  onLoad() {
    this.loadLanguage();
    this.initPlatformSettings();
    this.loadUserPoints();
    this.loadPackages();
  },

  onShow() {
    this.loadUserPoints();
  },

  // 初始化平台设置
  initPlatformSettings() {
    const showRecharge = canShowRecharge();
    const platformTips = getPlatformTips();
    const isVirtualPayment = shouldUseVirtualPayment();
    const paymentMethod = getPaymentMethod();

    this.setData({
      showRecharge,
      platformTips,
      isVirtualPayment,
      paymentMethod
    });
  },

  // 加载语言
  loadLanguage() {
    const i18n = lang.getLangData();
    this.setData({ i18n });
    wx.setNavigationBarTitle({
      title: i18n.recharge_title || '充值醒币'
    });
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

  // 加载充值套餐
  loadPackages() {
    // 充值套餐（1元=10醒币）
    const defaultPackages = [
      { id: 1, amount: 5, points: 50, bonus_points: 0 },
      { id: 2, amount: 10, points: 100, bonus_points: 0 },
      { id: 3, amount: 20, points: 200, bonus_points: 10 },
      { id: 4, amount: 100, points: 1000, bonus_points: 100 },
      { id: 5, amount: 200, points: 2000, bonus_points: 300 },
      { id: 6, amount: 500, points: 5000, bonus_points: 1000 }
    ];

    this.setData({
      packages: defaultPackages,
      selectedPackage: defaultPackages[0]
    });
  },

  // 选择套餐
  selectPackage(e) {
    const pkg = e.currentTarget.dataset.package;
    this.setData({
      selectedPackage: pkg,
      isCustom: false,
      customAmount: ''
    });
  },

  // 选择自定义金额
  selectCustom() {
    this.setData({
      selectedPackage: null,
      isCustom: true
    });
  },

  // 输入自定义金额
  onCustomAmountInput(e) {
    let value = e.detail.value;
    // 只允许输入正整数
    value = value.replace(/[^\d]/g, '');
    if (value && parseInt(value) > 10000) {
      value = '10000';
    }

    // 计算自定义金额对应的醒币和赠送
    const amount = parseInt(value) || 0;
    const { points, bonusPoints } = this.calculateCustomPoints(amount);

    this.setData({
      customAmount: value,
      customPoints: points,
      customBonusPoints: bonusPoints
    });
  },

  // 计算自定义金额对应的醒币（含阶梯式赠送）
  calculateCustomPoints(amount) {
    const basePoints = amount * 10; // 1元=10醒币
    let bonusPoints = 0;

    // 阶梯式赠送规则（与套餐保持一致）
    if (amount >= 500) {
      bonusPoints = Math.floor(basePoints * 0.20);
    } else if (amount >= 200) {
      bonusPoints = Math.floor(basePoints * 0.15);
    } else if (amount >= 100) {
      bonusPoints = Math.floor(basePoints * 0.10);
    } else if (amount >= 20) {
      bonusPoints = Math.floor(basePoints * 0.05);
    }

    return { points: basePoints, bonusPoints };
  },

  // 发起充值
  async doRecharge() {
    const { selectedPackage, isCustom, customAmount, customPoints, customBonusPoints, loading, i18n, isTestMode, isVirtualPayment } = this.data;

    console.log('[充值] doRecharge 被调用, 状态:', { isTestMode, isVirtualPayment, loading });

    if (loading) {
      console.log('[充值] 正在加载中，忽略点击');
      return;
    }

    let amount, points;

    if (isCustom) {
      amount = parseInt(customAmount);
      if (!amount || amount < 1) {
        wx.showToast({ title: i18n.pleaseEnterValidAmount || '请输入有效金额', icon: 'none' });
        return;
      }
      points = customPoints + customBonusPoints;
    } else if (selectedPackage) {
      amount = selectedPackage.amount;
      points = selectedPackage.points + (selectedPackage.bonus_points || 0);
    } else {
      wx.showToast({ title: i18n.pleaseSelectAmount || '请选择充值金额', icon: 'none' });
      return;
    }

    console.log('[充值] 选择的套餐:', { amount, points, isCustom });

    // 根据平台和模式选择支付方式
    if (isTestMode) {
      console.log('[充值] 使用测试模式');
      // 测试模式：模拟支付
      this.mockPaySuccess(amount, points);
    } else if (isVirtualPayment) {
      console.log('[充值] 虚拟支付模式（iOS），调用虚拟支付');
      // iOS: 使用虚拟支付
      this.doVirtualPayment(amount, points);
    } else {
      console.log('[充值] 使用标准微信支付');
      // Android / 开发者工具: 标准微信支付
      this.wxPayRecharge(amount, points);
    }
  },

  // 虚拟支付流程 (iOS)
  async doVirtualPayment(amount, points) {
    const { i18n } = this.data;
    const userId = wx.getStorageSync('userId');
    const openid = wx.getStorageSync('openid');

    if (!userId || !openid) {
      wx.showToast({ title: i18n.pleaseLogin || '请先登录', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      // 支付前先刷新 session_key，确保签名有效
      let sessionKey;
      try {
        const loginResult = await new Promise((resolve, reject) => {
          wx.login({
            success: async (loginRes) => {
              if (loginRes.code) {
                // 用 code 换取最新的 session_key
                const wxLoginRes = await api.wxLogin({ code: loginRes.code });
                if (wxLoginRes.code === 200 && wxLoginRes.data && wxLoginRes.data.sessionKey) {
                  wx.setStorageSync('session_key', wxLoginRes.data.sessionKey);
                  resolve(wxLoginRes.data.sessionKey);
                } else {
                  // 开发环境可能没有 sessionKey，不视为错误
                  resolve(null);
                }
              } else {
                reject(new Error('wx.login 失败'));
              }
            },
            fail: reject
          });
        });
        if (loginResult) {
          sessionKey = loginResult;
        } else {
          sessionKey = wx.getStorageSync('session_key');
        }
      } catch (e) {
        // 静默处理
        // 尝试使用本地存储的 session_key
        sessionKey = wx.getStorageSync('session_key');
      }

      // 检查 sessionKey 有效性（允许为空，后端会从数据库获取）
      if (sessionKey === 'logged') {
        sessionKey = null; // 清除无效占位符
      }

      // 1. 调用后端获取虚拟支付参数
      const res = await api.createVirtualPayOrder({
        userId,
        openid,
        amount,
        points,
        sessionKey,
        platform: 'ios'
      });

      if (res.code !== 0 && res.code !== 200) {
        throw new Error(res.message || '创建订单失败');
      }

      const payParams = res.data;

      // 调试：打印虚拟支付参数
      console.log('[虚拟支付] API 返回参数:', JSON.stringify(payParams, null, 2));

      const virtualPayParams = {
        signData: payParams.signData,
        mode: payParams.mode || 'short_series_coin',
        paySig: payParams.paySig,
        signature: payParams.signature,
        sigMethod: payParams.sigMethod || 'hmac_sha256'
      };

      console.log('[虚拟支付] 调用 wx.requestVirtualPayment 参数:', JSON.stringify(virtualPayParams, null, 2));

      // 2. 调用微信虚拟支付 API
      wx.requestVirtualPayment({
        ...virtualPayParams,
        success: async (payRes) => {
          console.log('[虚拟支付] 支付成功:', payRes);
          // 支付成功，主动调用发货接口
          await this.deliverOrder(payParams.orderId);
        },
        fail: async (err) => {
          console.error('[虚拟支付] 支付失败:', err);
          // 静默处理
          this.setData({ loading: false });

          // 取消订单
          const reason = err.errMsg && err.errMsg.includes('cancel') ? '用户取消' : (err.errMsg || '支付失败');
          try {
            await api.cancelVirtualPayOrder(payParams.orderId, reason);
          } catch (cancelErr) {
            // 静默处理
          }

          if (err.errMsg && err.errMsg.includes('cancel')) {
            wx.showToast({ title: i18n.paymentCancelled || '已取消支付', icon: 'none' });
          } else {
            wx.showToast({
              title: err.errMsg || i18n.paymentFailed || '支付失败',
              icon: 'none'
            });
          }
        }
      });
    } catch (error) {
      // 静默处理
      this.setData({ loading: false });
      wx.showToast({
        title: error.message || i18n.rechargeFailed || '充值失败',
        icon: 'none'
      });
    }
  },

  // 主动发货
  async deliverOrder(orderId) {
    const { i18n } = this.data;

    try {
      const res = await api.deliverVirtualPayOrder(orderId);

      if (res.code === 200) {
        // 发货成功，刷新余额
        const app = getApp();
        const newBalance = await app.getUserPoints();

        this.setData({
          userPoints: newBalance,
          loading: false
        });

        wx.showToast({ title: i18n.rechargeSuccess || '充值成功', icon: 'success' });

        if (app && app.emit) {
          app.emit('pointsUpdated', { points: newBalance });
        }

        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        throw new Error(res.message || '发货失败');
      }
    } catch (error) {
      // 静默处理
      this.setData({ loading: false });
      wx.showToast({
        title: error.message || '充值失败，请联系客服',
        icon: 'none'
      });
    }
  },

  // 轮询订单状态
  async pollOrderStatus(orderId, maxRetries = 15) {
    const { i18n } = this.data;

    for (let i = 0; i < maxRetries; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5秒间隔

      try {
        const res = await api.queryVirtualPayOrder(orderId);

        if (res.data && res.data.status === 'delivered') {
          // 发货成功，刷新余额
          const app = getApp();
          const newBalance = await app.getUserPoints();

          this.setData({
            userPoints: newBalance,
            loading: false
          });

          wx.showToast({ title: i18n.rechargeSuccess || '充值成功', icon: 'success' });

          if (app && app.emit) {
            app.emit('pointsUpdated', { points: newBalance });
          }

          setTimeout(() => wx.navigateBack(), 1500);
          return;
        }

        if (res.data && res.data.status === 'failed') {
          throw new Error('支付失败');
        }
      } catch (e) {
        // 静默处理
      }
    }

    // 超时，提示用户
    this.setData({ loading: false });
    wx.showModal({
      title: i18n.tipTitle || '提示',
      content: '订单处理中，请稍后在订单记录中查看',
      showCancel: false
    });
  },

  // 微信支付充值（Android / 开发者工具）
  async wxPayRecharge(amount, points) {
    const { i18n } = this.data;
    const userId = wx.getStorageSync('userId');
    const openid = wx.getStorageSync('openid');

    console.log('[充值] 开始微信支付流程:', { userId, openid, amount, points });

    if (!userId) {
      console.log('[充值] 错误: 用户未登录');
      wx.showToast({ title: i18n.pleaseLogin || '请先登录', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      // 1. 调用后端创建预付单
      console.log('[充值] 调用 createPayOrder API...');
      const orderRes = await api.createPayOrder({
        userId,
        openid: openid || userId,  // 兼容没有openid的情况
        amount,        // 金额（元）
        points,        // 获得的醒币数
        description: `充值${points}醒币`
      });

      console.log('[充值] createPayOrder 响应:', orderRes);

      if (orderRes.code !== 0 && orderRes.code !== 200) {
        throw new Error(orderRes.message || '创建订单失败');
      }

      const payParams = orderRes.data;
      console.log('[充值] 支付参数:', payParams);

      // 检查是否为测试模式（微信支付未配置）
      if (payParams.testMode) {
        console.log('[充值] 服务端返回测试模式，使用模拟支付');
        this.setData({ loading: false });
        this.mockPaySuccess(amount, points);
        return;
      }

      // 2. 调用微信支付
      console.log('[充值] 调用 wx.requestPayment...');
      wx.requestPayment({
        timeStamp: payParams.timeStamp,
        nonceStr: payParams.nonceStr,
        package: payParams.package,
        signType: payParams.signType || 'RSA',
        paySign: payParams.paySign,
        success: async () => {
          console.log('[充值] 微信支付成功');
          // 3. 支付成功，刷新余额
          const app = getApp();
          const newBalance = await app.getUserPoints();

          this.setData({
            userPoints: newBalance,
            loading: false
          });

          wx.showToast({ title: i18n.rechargeSuccess || '充值成功', icon: 'success' });

          // 通知其他页面刷新
          if (app && app.emit) {
            app.emit('pointsUpdated', { points: newBalance });
          }

          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        },
        fail: (err) => {
          console.log('[充值] 微信支付失败:', err);
          this.setData({ loading: false });

          if (err.errMsg && err.errMsg.includes('cancel')) {
            wx.showToast({ title: i18n.paymentCancelled || '已取消支付', icon: 'none' });
          } else {
            wx.showToast({ title: i18n.paymentFailed || '支付失败', icon: 'none' });
          }
        }
      });
    } catch (error) {
      console.error('[充值] 创建订单失败:', error);
      this.setData({ loading: false });
      wx.showToast({ title: error.message || i18n.rechargeFailed || '充值失败', icon: 'none' });
    }
  },

  // 模拟支付成功（测试阶段）
  mockPaySuccess(amount, points) {
    const { i18n } = this.data;
    const confirmContent = (i18n.testRechargeConfirm || '模拟充值 ¥{amount}，获得 {points} 醒币？')
      .replace('{amount}', amount)
      .replace('{points}', points);

    wx.showModal({
      title: i18n.testMode || '测试模式',
      content: confirmContent,
      success: async (res) => {
        if (res.confirm) {
          this.setData({ loading: true });

          try {
            // 调用后端API充值
            const app = getApp();
            const newBalance = await app.rechargePoints(points, 'test_pay_' + Date.now());

            this.setData({
              userPoints: newBalance,
              loading: false
            });

            wx.showToast({ title: i18n.rechargeSuccess || '充值成功', icon: 'success' });

            // 通知其他页面刷新
            if (app && app.emit) {
              app.emit('pointsUpdated', { points: newBalance });
            }

            // 延迟返回上一页
            setTimeout(() => {
              wx.navigateBack();
            }, 1500);
          } catch (error) {
            // 静默处理
            wx.showToast({ title: i18n.rechargeFailed || '充值失败', icon: 'none' });
            this.setData({ loading: false });
          }
        }
      }
    });
  }
});