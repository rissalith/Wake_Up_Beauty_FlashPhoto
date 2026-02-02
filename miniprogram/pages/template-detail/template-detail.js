/**
 * 模板详情页
 * 展示模板信息、参考图、创作者信息
 * 支持点赞、收藏、做同款
 */
const { api } = require('../../config/api');

Page({
  data: {
    templateId: '',
    template: null,
    loading: true,
    isLiked: false,
    isFavorited: false,
    showLoginModal: false,
    statusBarHeight: 20,
    navBarHeight: 64
  },

  onLoad(options) {
    const templateId = options.id;
    if (!templateId) {
      wx.showToast({ title: '缺少模板参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight || 20;
    const navBarHeight = statusBarHeight + 44;

    this.setData({
      templateId,
      statusBarHeight,
      navBarHeight
    });

    this.loadTemplateDetail();
  },

  onShow() {
    // 刷新点赞/收藏状态
    if (this.data.templateId) {
      this.loadTemplateDetail();
    }
  },

  // 加载模板详情
  async loadTemplateDetail() {
    const { templateId } = this.data;
    const userId = wx.getStorageSync('userId');

    try {
      this.setData({ loading: true });

      const res = await api.getTemplateDetail(templateId, userId);

      if (res.code === 200 && res.data) {
        const template = res.data;
        this.setData({
          template,
          isLiked: template.isLiked || false,
          isFavorited: template.isFavorited || false,
          loading: false
        });

        // 设置导航栏标题
        wx.setNavigationBarTitle({
          title: template.name || '模板详情'
        });
      } else {
        wx.showToast({ title: '模板不存在', icon: 'none' });
        this.setData({ loading: false });
      }
    } catch (error) {
      console.error('加载模板详情失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  },

  // 预览参考图
  previewImage() {
    const { template } = this.data;
    if (template && template.reference_image) {
      wx.previewImage({
        urls: [template.reference_image],
        current: template.reference_image
      });
    }
  },

  // 点赞
  async toggleLike() {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      this.setData({ showLoginModal: true });
      return;
    }

    const { templateId, isLiked, template } = this.data;

    try {
      const res = await api.likeTemplate(templateId, userId);
      if (res.code === 200) {
        const newIsLiked = res.data.isLiked;
        this.setData({
          isLiked: newIsLiked,
          'template.like_count': template.like_count + (newIsLiked ? 1 : -1)
        });

        wx.showToast({
          title: newIsLiked ? '已点赞' : '已取消点赞',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('点赞失败:', error);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 收藏
  async toggleFavorite() {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      this.setData({ showLoginModal: true });
      return;
    }

    const { templateId, isFavorited, template } = this.data;

    try {
      const res = await api.favoriteTemplate(templateId, userId);
      if (res.code === 200) {
        const newIsFavorited = res.data.isFavorited;
        this.setData({
          isFavorited: newIsFavorited,
          'template.favorite_count': template.favorite_count + (newIsFavorited ? 1 : -1)
        });

        wx.showToast({
          title: newIsFavorited ? '已收藏' : '已取消收藏',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('收藏失败:', error);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 做同款
  doSame() {
    const { templateId } = this.data;
    wx.navigateTo({
      url: `/pages/scene/scene?template_id=${templateId}`
    });
  },

  // 查看创作者主页
  goToCreatorPage() {
    const { template } = this.data;
    if (template && template.creator && template.creator.id) {
      wx.navigateTo({
        url: `/pages/creator/profile?id=${template.creator.id}`
      });
    }
  },

  // 登录弹窗关闭
  onLoginModalClose() {
    this.setData({ showLoginModal: false });
  },

  // 登录成功
  onLoginSuccess() {
    this.setData({ showLoginModal: false });
    this.loadTemplateDetail();
  },

  // 分享
  onShareAppMessage() {
    const { template, templateId } = this.data;
    return {
      title: template ? `${template.name} - 快来做同款` : '发现一个有趣的模板',
      path: `/pages/template-detail/template-detail?id=${templateId}`,
      imageUrl: template ? template.cover_image : ''
    };
  }
});
