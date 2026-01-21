const { getLangData, t } = require('../../utils/lang');

Page({
  data: {
    lang: {}
  },

  onLoad() {
    this.loadLanguage();
  },

  onShow() {
    this.loadLanguage();
  },

  // 加载语言包
  loadLanguage() {
    const lang = getLangData();
    this.setData({ lang });
    // 动态设置导航栏标题
    wx.setNavigationBarTitle({
      title: lang.terms_pageTitle || '用户协议'
    });
  },

  onShareAppMessage() {
    return {
      title: t('terms_share_title') || '醒美闪图 - 用户协议',
      path: '/pages/terms/terms'
    };
  }
});
