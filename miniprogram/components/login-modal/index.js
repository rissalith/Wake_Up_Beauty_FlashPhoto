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

    // 确认登录 - 直接调用 wx.login
    async onLogin() {
      const app = getApp();
      const { i18n } = this.data;
      this.setData({ loading: true, loginStep: i18n.loginStep1 || '正在验证微信...' });

      try {
        console.log('[Login] 开始登录流程...');

        // 步骤1: 微信验证
        this.setData({ loginStep: i18n.loginStep1 || '正在验证微信...' });

        // 步骤2: 创建账户（在 userLogin 内部完成）
        setTimeout(() => {
          if (this.data.loading) {
            this.setData({ loginStep: i18n.loginStep2 || '正在创建账户...' });
          }
        }, 800);

        // 步骤3: 加载数据
        setTimeout(() => {
          if (this.data.loading) {
            this.setData({ loginStep: i18n.loginStep3 || '正在加载数据...' });
          }
        }, 1500);

        // 直接登录，不需要头像昵称
        const userData = await app.userLogin({});
        console.log('[Login] 登录成功:', userData);

        this.setData({ loginStep: i18n.loginSuccess || '登录成功' });

        wx.showToast({
          title: i18n.loginSuccess || '登录成功',
          icon: 'success'
        });

        // 触发登录成功事件（不触发close，由页面处理关闭）
        this.triggerEvent('loginsuccess', userData);

      } catch (error) {
        // 打印详细错误信息便于调试
        console.error('[Login] 登录失败:', error);
        console.error('[Login] 错误详情:', JSON.stringify(error));

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
