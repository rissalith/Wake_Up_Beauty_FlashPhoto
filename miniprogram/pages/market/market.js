/**
 * 模板市场首页
 */
const { api } = require('../../config/api');
const imageConfig = require('../../config/images');
const lang = require('../../utils/lang');
const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 64,
    categories: [],
    currentCategory: null,
    templates: [],
    leftColumn: [],
    rightColumn: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    refreshing: false,
    showLoginModal: false,
    currentLang: 'zh-CN',
    titleImage: '',
    bannerList: [],
    officialAvatar: '' // 官方头像
  },

  onLoad() {
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight || 20;
    const navBarHeight = statusBarHeight + 44;

    // 获取当前语言
    const currentLang = lang.getCurrentLang();
    const titleImage = currentLang === 'zh-CN' ? imageConfig.images.titleZhCN : imageConfig.images.titleEn;
    const bannerList = imageConfig.getBannerList(currentLang);

    this.setData({
      statusBarHeight,
      navBarHeight,
      currentLang,
      titleImage,
      bannerList,
      officialAvatar: imageConfig.images.logoMain
    });

    // 加载分类和模板
    this.loadCategories();
    this.loadTemplates();
  },

  onShow() {
    // 设置tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }

    // 每次显示时刷新数据
    if (this.data.templates.length > 0) {
      this.refreshTemplates();
    }
  },

  // 加载分类列表
  async loadCategories() {
    try {
      const res = await api.getTemplateCategories();
      if (res.code === 200 && res.data) {
        this.setData({ categories: res.data });
      }
    } catch (error) {
      console.error('加载分类失败:', error);
    }
  },

  // 加载模板列表
  async loadTemplates(isLoadMore = false) {
    if (this.data.loading) return;
    if (isLoadMore && !this.data.hasMore) return;

    this.setData({ loading: true });

    try {
      const { currentCategory, page, pageSize } = this.data;
      const params = {
        page: isLoadMore ? page : 1,
        pageSize,
        sort: 'use_count'
      };

      // 如果选中了具体分类（非推荐），添加分类筛选
      // 推荐分类（第一个分类）显示所有模板
      const firstCategoryId = this.data.categories[0]?.id;
      if (currentCategory !== null && currentCategory !== firstCategoryId) {
        params.category_id = currentCategory;
      }

      const res = await api.getTemplates(params);

      if (res.code === 200 && res.data) {
        const newTemplates = res.data.list || [];
        const templates = isLoadMore
          ? [...this.data.templates, ...newTemplates]
          : newTemplates;

        // 分配到左右两列（瀑布流）
        const { leftColumn, rightColumn } = this.distributeToColumns(templates);

        this.setData({
          templates,
          leftColumn,
          rightColumn,
          page: isLoadMore ? page + 1 : 2,
          hasMore: newTemplates.length >= pageSize,
          loading: false,
          refreshing: false
        });
      }
    } catch (error) {
      console.error('加载模板失败:', error);
      this.setData({
        loading: false,
        refreshing: false
      });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  // 将模板分配到左右两列
  distributeToColumns(templates) {
    const leftColumn = [];
    const rightColumn = [];

    templates.forEach((item, index) => {
      if (index % 2 === 0) {
        leftColumn.push(item);
      } else {
        rightColumn.push(item);
      }
    });

    return { leftColumn, rightColumn };
  },

  // 切换分类
  switchCategory(e) {
    const categoryId = e.currentTarget.dataset.id;
    if (categoryId === this.data.currentCategory) return;

    this.setData({
      currentCategory: categoryId,
      templates: [],
      leftColumn: [],
      rightColumn: [],
      page: 1,
      hasMore: true
    });

    this.loadTemplates();
  },

  // 下拉刷新
  onRefresh() {
    this.setData({ refreshing: true });
    this.loadTemplates();
  },

  // 刷新模板（静默刷新）
  refreshTemplates() {
    this.loadTemplates();
  },

  // 加载更多
  loadMore() {
    this.loadTemplates(true);
  },

  // 跳转到搜索页
  goToSearch() {
    wx.navigateTo({
      url: '/pages/market-search/market-search'
    });
  },

  // 切换语言
  switchLanguage(e) {
    const newLang = e.currentTarget.dataset.lang;
    if (newLang === this.data.currentLang) return;

    lang.setLang(newLang);

    const titleImage = newLang === 'zh-CN' ? imageConfig.images.titleZhCN : imageConfig.images.titleEn;
    const bannerList = imageConfig.getBannerList(newLang);

    this.setData({
      currentLang: newLang,
      titleImage,
      bannerList
    });

    // 通知其他页面语言已切换
    if (app && app.emit) {
      app.emit('languageChanged', newLang);
    }
  },

  // 跳转到制作页面（直接做同款）
  goToTemplate(e) {
    const templateId = e.currentTarget.dataset.id;
    // 允许未登录用户进入场景页浏览，登录检查移到场景页的功能操作时
    wx.navigateTo({
      url: `/pages/scene/scene?template_id=${templateId}`
    });
  },

  // 做同款
  doSame(e) {
    const templateId = e.currentTarget.dataset.id;
    // 允许未登录用户进入场景页浏览，登录检查移到场景页的功能操作时
    wx.navigateTo({
      url: `/pages/scene/scene?template_id=${templateId}`
    });
  },

  // 登录弹窗关闭
  onLoginModalClose() {
    this.setData({ showLoginModal: false });
  },

  // 登录成功
  onLoginSuccess() {
    this.setData({ showLoginModal: false });
    // 刷新数据
    this.loadTemplates();
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '醒美闪图 - 发现精彩模板',
      path: '/pages/market/market'
    };
  }
});
