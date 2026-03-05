// 醒美闪图 - 主页面
const lang = require('../../utils/lang.js');
const imageConfig = require('../../config/images.js');
const configManager = require('../../utils/configManager.js');
const tracker = require('../../utils/tracker.js');

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 88,
    showPrivacyModal: false,
    showLoginModal: false,
    showUserInfoModal: false,
    // 场景滑动
    currentPage: 0,
    showSwipeHint: true,
    // 语言切换
    currentLanguage: 'zh-CN',
    // 多语言文本
    i18n: {},
    // 图片资源
    images: imageConfig.images,
    // Banner轮播
    bannerList: imageConfig.bannerList,
    bannerCurrent: 0,
    bannerAutoplay: true,
    // 特色功能图片
    featureImage: imageConfig.images.featureZhCN,
    // 导航栏标题图片
    titleImage: imageConfig.images.titleZhCN,
    // 中台配置
    activeScenes: [],
    comingSoonScenes: [],
    scenePages: [],
    pageCount: 0,
    scenesPerPage: 3,
    announcement: '',
    configLoaded: false,
    // 热门模板
    hotTemplates: [],
    showHotTemplates: true
  },

  onLoad(options) {
    const app = getApp();
    const systemInfo = app.globalData.systemInfo || wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight;
    this.setData({
      statusBarHeight,
      navBarHeight: statusBarHeight + 44
    });

    this.loadLanguage();
    this.loadMidplatformConfig();
    this.loadHotTemplates();

    if (options.inviter) {
      this.handleInvite(options.inviter);
    }

    this.updateLoginState();
    this.checkSwipeHint();

    if (app && app.on) {
      this._loginHandler = () => {
        this.checkPrivacyAfterLogin();
      };
      app.on('userLogin', this._loginHandler);

      this._languageChangeHandler = (langCode) => {
        this.onLanguageChanged(langCode);
      };
      app.on('languageChanged', this._languageChangeHandler);

      this._showLoginModalHandler = () => {
        this.setData({ showLoginModal: true });
      };
      app.on('showLoginModal', this._showLoginModalHandler);
    }
  },

  onLanguageChanged() {
    this.loadLanguage();
  },

  getSceneIconUrl(scene) {
    if (!scene || !scene.icon) {
      return imageConfig.images.idPhoto;
    }

    const icon = scene.icon;

    if (icon.startsWith('http://') || icon.startsWith('https://')) {
      return icon;
    }

    const iconMap = {
      'idphoto': imageConfig.images.idPhoto,
      'id-photo': imageConfig.images.idPhoto,
      'professional': imageConfig.images.professional,
      'portrait': imageConfig.images.portrait,
      'family': imageConfig.images.family,
      'pet': imageConfig.images.pet,
      'wedding': imageConfig.images.wedding
    };

    if (iconMap[icon]) {
      return iconMap[icon];
    }

    const camelCaseKey = icon.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (imageConfig.images[camelCaseKey]) {
      return imageConfig.images[camelCaseKey];
    }

    if (icon.startsWith('/')) {
      const fileName = icon.split('/').pop().split('?')[0].replace('.png', '').replace('.svg', '');
      const normalizedKey = fileName.replace(/-/g, '').toLowerCase();

      for (const [key, url] of Object.entries(imageConfig.images)) {
        if (key.toLowerCase() === normalizedKey) {
          return url;
        }
      }
    }

    return imageConfig.images.idPhoto;
  },

  async loadMidplatformConfig() {
    try {
      await configManager.init();

      const activeScenes = configManager.getActiveScenes();
      const comingSoonScenes = configManager.getComingSoonScenes();
      const announcement = configManager.getAnnouncement();

      const currentLang = this.data.currentLanguage;
      const allScenes = [...activeScenes, ...comingSoonScenes].map(scene => ({
        ...scene,
        iconUrl: this.getSceneIconUrl(scene),
        displayName: this.getLocalizedText(scene, 'name', currentLang),
        displayDesc: this.getLocalizedText(scene, 'description', currentLang)
      }));

      const scenesPerPage = this.data.scenesPerPage;
      const scenePages = [];
      for (let i = 0; i < allScenes.length; i += scenesPerPage) {
        scenePages.push(allScenes.slice(i, i + scenesPerPage));
      }
      if (scenePages.length === 0) {
        scenePages.push([]);
      }
      const pageCount = scenePages.length;

      this.setData({
        activeScenes,
        comingSoonScenes,
        scenePages,
        pageCount,
        announcement,
        configLoaded: true
      });

      if (announcement) {
        wx.showToast({
          title: announcement,
          icon: 'none',
          duration: 3000
        });
      }
    } catch (error) {
      this.setData({
        activeScenes: [],
        comingSoonScenes: [],
        scenePages: [[]],
        pageCount: 1,
        configLoaded: true
      });
      wx.showToast({
        title: '配置加载失败，请检查网络',
        icon: 'none',
        duration: 3000
      });
    }
  },

  getLocalizedText(scene, field, langCode) {
    if (langCode === 'en') {
      return scene[`${field}_en`] || scene[field] || '';
    }
    return scene[field] || '';
  },

  async loadHotTemplates() {
    try {
      const app = getApp();
      const baseUrl = app.globalData.baseUrl || 'https://pop-pub.com';

      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${baseUrl}/api/market/hot`,
          method: 'GET',
          data: { limit: 6 },
          success: resolve,
          fail: reject
        });
      });

      if (res.statusCode === 200 && res.data.code === 200) {
        const templates = res.data.data.templates || [];
        const currentLang = this.data.currentLanguage;

        const hotTemplates = templates.map(t => ({
          ...t,
          displayName: currentLang === 'en' ? (t.name_en || t.name) : t.name,
          displayDesc: currentLang === 'en' ? (t.description_en || t.description) : t.description,
          isOfficial: t.is_official === 1
        }));

        this.setData({ hotTemplates });
      }
    } catch (error) {
      console.error('加载热门模板失败:', error);
    }
  },

  goToTemplate(e) {
    const templateId = e.currentTarget.dataset.id;
    if (!templateId) return;

    tracker.trackClick('hot_template', 'card', templateId);

    wx.navigateTo({
      url: `/pages/template-detail/template-detail?id=${templateId}`,
      fail: () => {
        wx.showToast({ title: '页面跳转失败', icon: 'none' });
      }
    });
  },

  goToMarket() {
    tracker.trackClick('view_more_templates', 'button');

    wx.switchTab({
      url: '/pages/market/market',
      fail: () => {
        wx.navigateTo({
          url: '/pages/market/market'
        });
      }
    });
  },

  updateSceneDisplayText(langCode) {
    const { scenePages } = this.data;
    if (!scenePages || scenePages.length === 0) return;

    const updatedPages = scenePages.map(pageScenes =>
      pageScenes.map(scene => ({
        ...scene,
        displayName: this.getLocalizedText(scene, 'name', langCode),
        displayDesc: this.getLocalizedText(scene, 'description', langCode)
      }))
    );

    this.setData({ scenePages: updatedPages });
  },

  goToScene(e) {
    const sceneKey = e.currentTarget.dataset.scene;
    const scene = this.data.activeScenes.find(s => s.scene_key === sceneKey || s.id === sceneKey);

    tracker.trackClick('scene_card', 'card', scene?.name || sceneKey, { sceneKey });

    if (!scene) {
      wx.showToast({ title: '场景不存在', icon: 'none' });
      return;
    }

    if (scene.status !== 'active') {
      wx.showToast({ title: scene.coming_soon_text || '即将上线', icon: 'none' });
      return;
    }

    this._doNavigateToScene(scene);
  },

  _doNavigateToScene(scene) {
    wx.navigateTo({
      url: `/pages/scene/scene?id=${scene.scene_key || scene.id}`,
      fail: () => {
        wx.showToast({ title: '页面跳转失败', icon: 'none' });
      }
    });
  },

  onUnload() {
    const app = getApp();
    if (app && app.off) {
      if (this._historyUpdateHandler) {
        app.off('historyUpdated', this._historyUpdateHandler);
      }
      if (this._loginHandler) {
        app.off('userLogin', this._loginHandler);
      }
      if (this._languageChangeHandler) {
        app.off('languageChanged', this._languageChangeHandler);
      }
      if (this._showLoginModalHandler) {
        app.off('showLoginModal', this._showLoginModalHandler);
      }
    }

    this._cleanupMemory();
  },

  _cleanupMemory() {
    this.setData({
      activeScenes: [],
      comingSoonScenes: [],
      scenePages: [],
      bannerList: []
    });

    this._historyUpdateHandler = null;
    this._loginHandler = null;
  },

  async onPullDownRefresh() {
    try {
      await configManager.refresh();
      await this.loadMidplatformConfig();
      wx.showToast({ title: '已更新', icon: 'success', duration: 1500 });
    } catch (e) {
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
      this.getTabBar().loadLanguage();
      this.getTabBar().updateGeneratingCount();
    }
    this.loadLanguage();
    this.updateLoginState();
    this.resetBannerAutoplay();
    this.refreshConfig();
    this.checkAndClosePrivacyModal();
  },

  checkAndClosePrivacyModal() {
    const privacyConfirmed = wx.getStorageSync('privacyPolicyConfirmed');
    if (privacyConfirmed && this.data.showPrivacyModal) {
      this.setData({ showPrivacyModal: false });
      this.notifyTabBarDisabled(false);
    }
  },

  async refreshConfig() {
    try {
      const result = await configManager.throttledRefresh();
      if (result) {
        await this.loadMidplatformConfig();
      }
    } catch (e) {
    }
  },

  onHide() {
    this.setData({ bannerAutoplay: false });
  },

  resetBannerAutoplay() {
    this.setData({ bannerAutoplay: false });
    setTimeout(() => {
      this.setData({ bannerAutoplay: true });
    }, 100);
  },

  loadLanguage() {
    const currentLang = lang.getCurrentLang();

    const featureImageMap = {
      'zh-CN': imageConfig.images.featureZhCN,
      'en': imageConfig.images.featureEn
    };
    const titleImageMap = {
      'zh-CN': imageConfig.images.titleZhCN,
      'en': imageConfig.images.titleEn
    };

    this.setData({
      currentLanguage: currentLang,
      i18n: lang.getLangData(),
      featureImage: featureImageMap[currentLang] || imageConfig.images.featureZhCN,
      titleImage: titleImageMap[currentLang] || imageConfig.images.titleZhCN,
      bannerList: imageConfig.getBannerList(currentLang)
    });

    if (this.data.scenePages && this.data.scenePages.length > 0) {
      this.updateSceneDisplayText(currentLang);
    }

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().loadLanguage();
    }
  },

  async switchLanguage(e) {
    const langCode = e.currentTarget.dataset.lang;
    if (langCode === this.data.currentLanguage) return;

    lang.setLang(langCode);

    const featureImageMap = {
      'zh-CN': imageConfig.images.featureZhCN,
      'en': imageConfig.images.featureEn
    };

    const titleImageMap = {
      'zh-CN': imageConfig.images.titleZhCN,
      'en': imageConfig.images.titleEn
    };

    const newFeatureImage = featureImageMap[langCode] || imageConfig.images.featureZhCN;
    const newTitleImage = titleImageMap[langCode] || imageConfig.images.titleZhCN;
    const newBannerList = imageConfig.getBannerList(langCode);

    this.setData({
      currentLanguage: langCode,
      i18n: lang.getLangData(),
      featureImage: newFeatureImage,
      titleImage: newTitleImage,
      bannerList: newBannerList
    });

    await configManager.refresh();
    await this.loadMidplatformConfig();

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().loadLanguage();
    }

    const app = getApp();
    if (app && app.emit) {
      app.emit('languageChanged', langCode);
    }
  },

  onFeatureImageError() {
    this.setData({
      featureImage: imageConfig.images.featureZhCN
    });
  },

  checkSwipeHint() {
    const hasSwipedScene = wx.getStorageSync('hasSwipedScene');
    if (hasSwipedScene) {
      this.setData({ showSwipeHint: false });
    } else {
      setTimeout(() => {
        this.setData({ showSwipeHint: false });
      }, 5000);
    }
  },

  onBannerChange(e) {
    this.setData({ bannerCurrent: e.detail.current });
  },

  onSwiperChange(e) {
    const current = e.detail.current;
    this.setData({ currentPage: current });

    if (this.data.showSwipeHint) {
      this.setData({ showSwipeHint: false });
      wx.setStorageSync('hasSwipedScene', true);
    }
  },

  checkLoginAndPrivacy() {
    const app = getApp();
    const userId = wx.getStorageSync('userId');
    const sessionKey = wx.getStorageSync('session_key');
    const isLoggedIn = !!userId && !!sessionKey;

    app.globalData.isLoggedIn = isLoggedIn;

    if (!isLoggedIn) {
      this.setData({ showLoginModal: true });
      this.notifyTabBarDisabled(true, '请先登录');
    } else {
      this.checkPrivacyAfterLogin();
    }
  },

  notifyTabBarDisabled(disabled, reason = '') {
    const app = getApp();
    if (app && app.emit) {
      app.emit('tabBarDisabledChange', {
        disabled,
        reason: reason || (disabled ? '请先完成操作' : '')
      });
    }
  },

  checkLoginStatus() {
    if (this.data.showLoginModal || this.data.showPrivacyModal || this.data.showUserInfoModal) {
      return;
    }

    const app = getApp();
    const userId = wx.getStorageSync('userId');
    const sessionKey = wx.getStorageSync('session_key');
    const isLoggedIn = !!userId && !!sessionKey;

    app.globalData.isLoggedIn = isLoggedIn;

    if (isLoggedIn) {
      const privacyConfirmed = wx.getStorageSync('privacyPolicyConfirmed');

      if (privacyConfirmed) {
        this.setData({
          showPrivacyModal: false,
          showLoginModal: false,
          showUserInfoModal: false
        });
        this.notifyTabBarDisabled(false);
      } else {
        this.setData({ showPrivacyModal: true, showLoginModal: false, showUserInfoModal: false });
        this.notifyTabBarDisabled(true, '请先同意协议');
      }
    } else {
      this.setData({ showLoginModal: true, showPrivacyModal: false, showUserInfoModal: false });
      this.notifyTabBarDisabled(true, '请先登录');
    }
  },

  updateLoginState() {
    const app = getApp();
    const userId = wx.getStorageSync('userId');
    const sessionKey = wx.getStorageSync('session_key');
    app.globalData.isLoggedIn = !!userId && !!sessionKey;
  },

  checkPrivacyAfterLogin() {
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    const currentRoute = currentPage ? currentPage.route : '';

    if (currentRoute !== 'pages/home/home') {
      return;
    }

    const privacyConfirmed = wx.getStorageSync('privacyPolicyConfirmed');
    if (!privacyConfirmed) {
      this.setData({ showPrivacyModal: true });
      this.notifyTabBarDisabled(true, '请先同意协议');
    } else {
      this.notifyTabBarDisabled(false);
    }
  },

  onLoginModalClose() {
    this.setData({ showLoginModal: false });
    this._pendingScene = null;
  },

  onLoginSkip() {
    this.setData({ showLoginModal: false });
    this._pendingScene = null;
  },

  onLoginSuccess(e) {
    const userData = e.detail || {};
    this.setData({ showLoginModal: false });

    const pendingScene = this._pendingScene;
    this._pendingScene = null;

    const privacyAgreed = userData.privacyAgreed === true;
    const termsAgreed = userData.termsAgreed === true;
    const privacyConfirmed = (privacyAgreed && termsAgreed) || wx.getStorageSync('privacyPolicyConfirmed');

    const isNewUser = !userData.nickname || !userData.avatarUrl;

    if (!privacyConfirmed) {
      this._pendingSceneAfterPrivacy = pendingScene;
      this._isNewUser = isNewUser;
      this.checkPrivacyAfterLogin();
    } else if (isNewUser) {
      this._pendingSceneAfterPrivacy = pendingScene;
      this.setData({ showUserInfoModal: true });
      this.notifyTabBarDisabled(true, '请完善个人信息');
    } else {
      if (pendingScene) {
        const scene = this.data.activeScenes.find(s => s.scene_key === pendingScene || s.id === pendingScene);
        if (scene) {
          setTimeout(() => this._doNavigateToScene(scene), 300);
        }
      }
      this.notifyTabBarDisabled(false);
    }
  },

  onPrivacyModalClose() {
    wx.showToast({
      title: '请先同意协议后使用',
      icon: 'none'
    });
  },

  onPrivacyAgree() {
    const privacyConfirmed = wx.getStorageSync('privacyPolicyConfirmed');
    if (!privacyConfirmed) {
      console.warn('协议签署状态未保存到本地存储');
    }

    this.setData({ showPrivacyModal: false });
    this.loadLanguage();

    if (this._isNewUser) {
      this.setData({ showUserInfoModal: true });
      this.notifyTabBarDisabled(true, '请完善个人信息');
    } else {
      this.notifyTabBarDisabled(false);

      const pendingScene = this._pendingSceneAfterPrivacy;
      this._pendingSceneAfterPrivacy = null;
      if (pendingScene) {
        const scene = this.data.activeScenes.find(s => s.scene_key === pendingScene || s.id === pendingScene);
        if (scene) {
          setTimeout(() => this._doNavigateToScene(scene), 300);
        }
      }
    }
  },

  onUserInfoComplete() {
    this.setData({ showUserInfoModal: false });
    this.notifyTabBarDisabled(false);

    const pendingScene = this._pendingSceneAfterPrivacy;
    this._pendingSceneAfterPrivacy = null;
    if (pendingScene) {
      const scene = this.data.activeScenes.find(s => s.scene_key === pendingScene || s.id === pendingScene);
      if (scene) {
        setTimeout(() => this._doNavigateToScene(scene), 300);
      }
    }
  },

  checkPrivacyPolicy() {
  },

  goToPrivacyConfirm() {
    this.setData({ showPrivacyModal: false });
    wx.navigateTo({
      url: '/pages/privacy/privacy'
    });
  },

  delayPrivacy() {
    this.setData({ showPrivacyModal: false });
  },

  handleInvite(inviterId) {
    const app = getApp();
    if (app) {
      app.globalData.inviterId = inviterId;
    }

    wx.setStorageSync('invitedBy', inviterId);
  },

  onShareAppMessage() {
    const userId = wx.getStorageSync('userId') || '';
    return {
      title: lang.t('shareTitle'),
      path: `/pages/home/home?inviter=${userId}`,
      imageUrl: this.data.images.shareCover
    };
  },

  onShareTimeline() {
    const userId = wx.getStorageSync('userId') || '';
    return {
      title: lang.t('shareTitle'),
      query: `inviter=${userId}`,
      imageUrl: this.data.images.shareCover
    };
  }
});
