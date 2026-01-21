const apiConfig = require('../../config/api.js');
const api = apiConfig.api;
const { I18nPage } = require('../../utils/i18nPage');
const { t, getLangData } = require('../../utils/lang');

I18nPage({
  data: {
    feedbackList: [],
    loading: false
  },

  onLoad() {
    this.updateNavTitle();
  },

  onShow() {
    this.loadFeedbackList();
    this.updateNavTitle();
  },

  // 更新导航栏标题
  updateNavTitle() {
    const i18n = getLangData();
    wx.setNavigationBarTitle({
      title: i18n.fb_pageTitle || '意见反馈'
    });
  },

  // 加载反馈列表
  async loadFeedbackList() {
    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    this.setData({ loading: true });
    try {
      const res = await api.getUserFeedbacks(userId);
      if (res.code === 200) {
        this.setData({
          feedbackList: res.data
        });
      }
    } catch (error) {
      // 静默处理
    } finally {
      this.setData({ loading: false });
    }
  },

  // 跳转到提交页
  goToSubmit() {
    wx.navigateTo({
      url: '/pages/feedback-submit/feedback-submit'
    });
  },

  // 编辑反馈
  editFeedback(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: '/pages/feedback-submit/feedback-submit?id=' + item.feedback_id,
      success: (res) => {
        res.eventChannel.emit('acceptDataFromOpenerPage', item);
      }
    });
  },

  // 删除反馈
  deleteFeedback(e) {
    const id = e.currentTarget.dataset.id;
    const i18n = getLangData();
    wx.showModal({
      title: i18n.tipTitle || '提示',
      content: i18n.fb_deleteConfirm || '确定要删除这条反馈吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await api.deleteFeedback(id);
            if (result.code === 200) {
              wx.showToast({ title: i18n.fb_deleteSuccess || '已删除', icon: 'success' });
              this.loadFeedbackList();
            }
          } catch (error) {
            // 静默处理
            wx.showToast({ title: i18n.fb_deleteFailed || '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 预览图片
  previewImage(e) {
    const { current, urls } = e.currentTarget.dataset;
    wx.previewImage({
      current,
      urls
    });
  }
});
