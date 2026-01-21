const { getLangData, t } = require('../../utils/lang');
const { images } = require('../../config/images');
const { request } = require('../../config/api');

Page({
  data: {
    lang: {},
    logoUrl: images.logo,
    supportEmail: 'support@xingmei.com',  // 默认值
    copyrightText: ''  // 从后台获取
  },

  onLoad() {
    this.loadLanguage();
    this.loadSystemConfig();
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
      title: lang.about_pageTitle || '关于我们'
    });
  },

  // 加载系统配置（邮箱、版权信息等）
  loadSystemConfig() {
    request({
      url: '/config/system',
      method: 'GET'
    }).then(res => {
      if (res.code === 200 && res.data) {
        const { support_email, copyright_text } = res.data;
        this.setData({
          supportEmail: support_email || 'support@xingmei.com',
          copyrightText: copyright_text || ''
        });
      }
    }).catch(err => {
      // 静默处理
    });
  },

  // 复制客服邮箱
  copyEmail() {
    wx.setClipboardData({
      data: this.data.supportEmail,
      success: () => {
        wx.showToast({
          title: this.data.lang.copied || '已复制',
          icon: 'success'
        });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: t('about_share_title') || '醒美闪图 - AI智能证件照',
      path: '/pages/index/index'
    };
  }
});
