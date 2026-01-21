const lang = require('../../utils/lang');

Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
      observer(newVal) {
        // 弹窗显示时禁用TabBar，隐藏时启用
        this.notifyTabBarDisabled(newVal);
      }
    }
  },

  data: {
    i18n: {},
    viewingPolicy: '', // '', 'privacy', 'terms'
    agreementChecked: false, // 协议勾选状态（合并隐私政策和用户协议）
    currentLanguage: 'zh-CN', // 当前语言
    submitting: false // 防止重复提交
  },

  lifetimes: {
    attached() {
      this.loadLanguage();
      
      // 监听全局语言变化事件
      const app = getApp();
      if (app && app.on) {
        this._languageChangeHandler = (langCode) => {
          // 避免自己触发的事件再次处理
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

    // 通知TabBar禁用状态
    notifyTabBarDisabled(disabled) {
      const app = getApp();
      if (app && app.emit) {
        app.emit('tabBarDisabledChange', disabled);
      }
    },

    // 切换协议勾选状态
    toggleAgreementCheck() {
      this.setData({ agreementChecked: !this.data.agreementChecked });
    },

    // 同意隐私政策
    async onAgree() {
      // 检查是否勾选了
      if (!this.data.agreementChecked) {
        wx.showToast({
          title: this.data.i18n.pleaseCheckAgreement || '请先勾选同意协议',
          icon: 'none'
        });
        return;
      }

      // 防止重复点击
      if (this.data.submitting) return;
      this.setData({ submitting: true });

      const app = getApp();

      try {
        // 等待服务器保存成功
        await app.confirmPrivacyPolicy();

        wx.showToast({
          title: this.data.i18n.privacyConfirmed || '已确认',
          icon: 'success'
        });

        // 重置视图状态
        this.setData({
          viewingPolicy: '',
          agreementChecked: false,
          submitting: false
        });

        // 启用TabBar
        this.notifyTabBarDisabled(false);

        this.triggerEvent('agree');
        this.triggerEvent('close');
      } catch (err) {
        // 静默处理
        this.setData({ submitting: false });
        
        wx.showModal({
          title: '签署失败',
          content: '协议签署失败，请检查网络后重试',
          showCancel: false,
          confirmText: '知道了'
        });
      }
    },

    // 查看隐私政策详情 - 在弹窗内展示
    viewPrivacy() {
      this.setData({ viewingPolicy: 'privacy' });
    },

    // 查看用户协议 - 在弹窗内展示
    viewTerms() {
      this.setData({ viewingPolicy: 'terms' });
    },

    // 返回主界面
    backToMain() {
      this.setData({ viewingPolicy: '' });
    },

    // 拒绝（退出小程序）
    onReject() {
      wx.showModal({
        title: this.data.i18n.tip || '提示',
        content: this.data.i18n.privacyRejectTip || '拒绝隐私政策将无法使用小程序，确定要退出吗？',
        confirmText: this.data.i18n.exitApp || '退出',
        cancelText: this.data.i18n.thinkAgain || '再想想',
        success: (res) => {
          if (res.confirm) {
            // 尝试退出小程序
            wx.exitMiniProgram({
              success: () => {
                // 静默处理
              },
              fail: () => {
                // 开发者工具中无法退出，显示提示
                wx.showToast({
                  title: this.data.i18n.pleaseCloseManually || '请手动关闭小程序',
                  icon: 'none',
                  duration: 2000
                });
              }
            });
          }
        }
      });
    },

    // 阻止点击穿透
    preventTouchMove() {
      return false;
    }
  }
});
