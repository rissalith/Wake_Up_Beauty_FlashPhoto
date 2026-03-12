const lang = require('../../utils/lang');
const { images } = require('../../config/images');
const policyApi = require('../../utils/policy-api');

Page({
  data: {
    i18n: {},
    currentLanguage: 'zh-CN',
    logoUrl: images.logo,
    loading: false,
    loginStep: '',

    // 协议勾选状态
    privacyChecked: false,
    termsChecked: false,

    // 弹窗状态
    showPrivacyDetail: false,
    showTermsDetail: false,

    // 协议内容
    privacyContent: '',
    termsContent: '',

    // 滚动位置
    privacyScrollTop: 0,
    termsScrollTop: 0
  },

  onLoad(options) {
    this.loadLanguage();
    this.loadPolicies();

    // 监听全局语言变化
    const app = getApp();
    if (app && app.on) {
      this._languageChangeHandler = (langCode) => {
        this.loadLanguage();
      };
      app.on('languageChanged', this._languageChangeHandler);
    }
  },

  onUnload() {
    const app = getApp();
    if (app && app.off && this._languageChangeHandler) {
      app.off('languageChanged', this._languageChangeHandler);
    }
  },

  loadLanguage() {
    const currentLang = lang.getCurrentLang();
    this.setData({
      i18n: lang.getLangData(),
      currentLanguage: currentLang
    });
  },

  // 加载协议内容
  async loadPolicies() {
    try {
      const [privacyContent, termsContent] = await Promise.all([
        policyApi.getPrivacyPolicy(),
        policyApi.getUserAgreement()
      ]);

      this.setData({
        privacyContent,
        termsContent
      });
    } catch (error) {
      console.error('[Login] 加载协议内容失败:', error);
    }
  },

  // 切换隐私政策勾选
  togglePrivacyCheck() {
    this.setData({ privacyChecked: !this.data.privacyChecked });
  },

  // 切换用户协议勾选
  toggleTermsCheck() {
    this.setData({ termsChecked: !this.data.termsChecked });
  },

  // 查看隐私政策详情
  viewPrivacyDetail() {
    this.setData({ showPrivacyDetail: true });
  },

  // 查看用户协议详情
  viewTermsDetail() {
    this.setData({ showTermsDetail: true });
  },

  // 关闭隐私政策详情
  closePrivacyDetail() {
    this.setData({ showPrivacyDetail: false });
  },

  // 关闭用户协议详情
  closeTermsDetail() {
    this.setData({ showTermsDetail: false });
  },

  // 微信登录
  async onWxLogin() {
    const { i18n, privacyChecked, termsChecked } = this.data;

    // 检查协议勾选
    if (!privacyChecked || !termsChecked) {
      wx.showToast({
        title: i18n.pleaseCheckAgreement || '请先勾选同意协议',
        icon: 'none'
      });
      return;
    }

    // 防止重复点击
    if (this.data.loading) return;
    this.setData({ loading: true });

    const app = getApp();

    try {
      this.setData({ loginStep: i18n.loginStep1 || '正在验证微信...' });

      // 延迟显示步骤提示
      setTimeout(() => {
        if (this.data.loading) {
          this.setData({ loginStep: i18n.loginStep2 || '正在创建账户...' });
        }
      }, 800);

      setTimeout(() => {
        if (this.data.loading) {
          this.setData({ loginStep: i18n.loginStep3 || '正在加载数据...' });
        }
      }, 1500);

      // 执行登录
      const userData = await app.userLogin({});

      // 记录用户同意协议
      await Promise.all([
        policyApi.recordAgreement('privacy'),
        policyApi.recordAgreement('terms')
      ]);

      this.setData({ loginStep: i18n.loginSuccess || '登录成功' });

      wx.showToast({
        title: i18n.loginSuccess || '登录成功',
        icon: 'success'
      });

      // 延迟返回，让用户看到成功提示
      setTimeout(() => {
        wx.navigateBack({
          delta: 1
        });
      }, 1500);

    } catch (error) {
      console.error('[Login] 登录失败:', error);

      const errorMsg = error.message || error.msg || error.errMsg || '登录失败';
      this.setData({ loginStep: '' });

      wx.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 3000
      });
    } finally {
      this.setData({ loading: false, loginStep: '' });
    }
  },

  // 关闭登录页面
  onClose() {
    wx.navigateBack({
      delta: 1
    });
  },

  // 阻止点击穿透
  preventTouchMove() {
    return false;
  }
});
