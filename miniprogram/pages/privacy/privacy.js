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
      title: lang.privacy_pageTitle || '隐私政策'
    });
  },

  onShareAppMessage() {
    return {
      title: t('privacy_share_title') || '醒美闪图 - 隐私政策',
      path: '/pages/privacy/privacy'
    };
  }
});
