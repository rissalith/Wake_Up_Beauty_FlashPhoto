const lang = require('../../utils/lang');
const { images } = require('../../config/images');

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },

  data: {
    i18n: {},
    loading: false,
    loginStep: '', // 登录步骤提示
    logoUrl: images.logo,
    currentLanguage: 'zh-CN'
  },

  lifetimes: {
    attached() {
      this.loadLanguage();
      
      // 监听全局语言变化事件
      const app = getApp();
      if (app && app.on) {
        this._languageChangeHandler = (langCode) => {
          if (langCode !== this.data.currentLanguage) {
            this.setData({
              currentLanguage: langCode,
              i18n: lang.getLangData()
            });
          }
        };
        app.on('languageChanged', this._languageChangeHandler);
      }
    },
    detached() {
      // 移除事件监听
      const app = getApp();
      if (app && app.off && this._languageChangeHandler) {
        app.off('languageChanged', this._languageChangeHandler);
      }
    }
  },

  methods: {
    loadLanguage() {
      const currentLang = lang.getCurrentLang();
      const i18n = lang.getLangData();
      this.setData({ 
        i18n,
        currentLanguage: currentLang
      });
    },

    // 确认登录 - 导航到独立登录页面
    onLogin() {
      // 关闭弹窗
      this.triggerEvent('close');

      // 导航到登录页面
      wx.navigateTo({
        url: '/pages/login/login',
        fail: (err) => {
          console.error('[Login Modal] 导航失败:', err);
          wx.showToast({
            title: '页面跳转失败',
            icon: 'none'
          });
        }
      });
    },

    // 阻止点击穿透
    preventTouchMove() {
      return false;
    },

    // 用户选择稍后登录
    onSkip() {
      this.triggerEvent('close');
    }
  }
});
