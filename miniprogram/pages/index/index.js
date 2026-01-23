 // 醒美闪图 - 主页面
const HISTORY_KEY = 'photoHistory';
const lang = require('../../utils/lang.js');
const imageConfig = require('../../config/images.js');
const configManager = require('../../utils/configManager.js');

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 88,
    showPrivacyModal: false,
    showLoginModal: false,
    showUserInfoModal: false,
    generatingCount: 0,
    showCompleted: false,
    lastGeneratingCount: 0,
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
    bannerAutoplay: true, // 控制轮播自动播放，解决长时间停留后卡顿问题
    // 特色功能图片
    featureImage: imageConfig.images.featureZhCN,
    // 导航栏标题图片
    titleImage: imageConfig.images.titleZhCN,
    // 中台配置
    activeScenes: [],      // 上线中的场景
    comingSoonScenes: [],  // 即将上线的场景
    scenePages: [],        // 动态分页后的场景数组 [[场景1,场景2,场景3], [场景4,场景5,场景6], ...]
    pageCount: 0,          // 总页数
    scenesPerPage: 3,      // 每页显示的场景数
    announcement: '',      // 公告
    configLoaded: false    // 配置是否加载完成
  },

  onLoad(options) {
    // 使用 app 缓存的系统信息，避免重复调用
    const app = getApp();
    const systemInfo = app.globalData.systemInfo || wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight;
    this.setData({
      statusBarHeight,
      navBarHeight: statusBarHeight + 44
    });

    // 加载语言
    this.loadLanguage();

    // 加载中台配置
    this.loadMidplatformConfig();

    // 处理邀请链接
    if (options.inviter) {
      this.handleInvite(options.inviter);
    }

    // 延迟登录模式：不再强制检查登录，用户可以先浏览
    // this.checkLoginAndPrivacy();
    this.updateLoginState();

    // 检查是否显示滑动提示
    this.checkSwipeHint();

    // 监听全局历史更新事件，实时刷新进度条
    if (app && app.on) {
      this._historyUpdateHandler = () => {
        this.loadGeneratingCount();
      };
      app.on('historyUpdated', this._historyUpdateHandler);

      // 监听登录成功事件，检查隐私政策
      this._loginHandler = () => {
        this.checkPrivacyAfterLogin();
      };
      app.on('userLogin', this._loginHandler);

      // 监听语言变化事件（从隐私弹窗等处切换语言时同步）
      this._languageChangeHandler = (langCode) => {
        this.onLanguageChanged(langCode);
      };
      app.on('languageChanged', this._languageChangeHandler);

      // 监听显示登录弹窗事件（从其他页面触发，如历史记录页面）
      this._showLoginModalHandler = () => {
        this.setData({ showLoginModal: true });
      };
      app.on('showLoginModal', this._showLoginModalHandler);
    }
  },

  // 响应语言变化（从其他地方切换语言时调用）
  onLanguageChanged(langCode) {
    // 直接调用 loadLanguage()，它会从 storage 读取最新的语言设置并更新所有 UI
    this.loadLanguage();
  },

  // 获取场景图标URL - 支持多种 icon 格式
  getSceneIconUrl(scene) {
    if (!scene || !scene.icon) {
      // 保底：使用默认证件照图标
      return imageConfig.images.idPhoto;
    }

    const icon = scene.icon;

    // 1. 如果是完整的 URL（CDN 路径），直接返回
    if (icon.startsWith('http://') || icon.startsWith('https://')) {
      return icon;
    }

    // 2. 如果是场景 key，映射到对应的 CDN 图片
    const iconMap = {
      'idphoto': imageConfig.images.idPhoto,
      'id-photo': imageConfig.images.idPhoto,
      'professional': imageConfig.images.professional,
      'portrait': imageConfig.images.portrait,
      'family': imageConfig.images.family,
      'pet': imageConfig.images.pet,
      'wedding': imageConfig.images.wedding
    };

    // 尝试从 imageConfig.images 获取对应的图片 URL
    if (iconMap[icon]) {
      return iconMap[icon];
    }

    // 3. 尝试驼峰命名格式（如 idPhoto）
    const camelCaseKey = icon.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (imageConfig.images[camelCaseKey]) {
      return imageConfig.images[camelCaseKey];
    }

    // 4. 如果是相对路径（以 / 开头），转换为 CDN 路径
    if (icon.startsWith('/')) {
      // 提取文件名并尝试匹配
      const fileName = icon.split('/').pop().split('?')[0].replace('.png', '').replace('.svg', '');
      const normalizedKey = fileName.replace(/-/g, '').toLowerCase();
      
      for (const [key, url] of Object.entries(imageConfig.images)) {
        if (key.toLowerCase() === normalizedKey) {
          return url;
        }
      }
    }

    // 5. 保底：返回默认图标
    return imageConfig.images.idPhoto;
  },

  // 加载中台配置
  async loadMidplatformConfig() {
    try {
      // 使用 init() 利用缓存，后台静默检查更新
      const config = await configManager.init();

      // 获取上线中的场景
      const activeScenes = configManager.getActiveScenes();
      // 获取即将上线的场景
      const comingSoonScenes = configManager.getComingSoonScenes();
      // 获取公告
      const announcement = configManager.getAnnouncement();

      // 合并所有可见场景并添加图标URL和多语言显示字段
      const currentLang = this.data.currentLanguage;
      const allScenes = [...activeScenes, ...comingSoonScenes].map(scene => ({
        ...scene,
        iconUrl: this.getSceneIconUrl(scene),
        displayName: this.getLocalizedText(scene, 'name', currentLang),
        displayDesc: this.getLocalizedText(scene, 'description', currentLang)
      }));

      // 调试：打印第一个场景的icon
      if (allScenes.length > 0) {
      }

      // 动态分页：每页显示 scenesPerPage 个场景
      const scenesPerPage = this.data.scenesPerPage;
      const scenePages = [];
      for (let i = 0; i < allScenes.length; i += scenesPerPage) {
        scenePages.push(allScenes.slice(i, i + scenesPerPage));
      }
      // 确保至少有一页（即使没有场景）
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

      // 如果有公告，显示提示
      if (announcement) {
        wx.showToast({
          title: announcement,
          icon: 'none',
          duration: 3000
        });
      }
    } catch (error) {
      // 静默处理
      // 配置加载失败，显示空场景列表
      this.setData({
        activeScenes: [],
        comingSoonScenes: [],
        scenePages: [[]],
        pageCount: 1,
        configLoaded: true
      });
      // 提示用户网络问题
      wx.showToast({
        title: '配置加载失败，请检查网络',
        icon: 'none',
        duration: 3000
      });
    }
  },

  // 获取多语言文本
  getLocalizedText(scene, field, langCode) {
    // 字段映射：name -> name_en, description -> description_en
    if (langCode === 'en') {
      return scene[`${field}_en`] || scene[field] || '';
    }
    return scene[field] || '';
  },

  // 更新场景显示文本（语言切换时调用）
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

  // 通用场景跳转（统一使用动态渲染）
  goToScene(e) {
    const sceneKey = e.currentTarget.dataset.scene;
    const scene = this.data.activeScenes.find(s => s.scene_key === sceneKey || s.id === sceneKey);

    if (!scene) {
      wx.showToast({ title: '场景不存在', icon: 'none' });
      return;
    }

    // 检查场景状态
    if (scene.status !== 'active') {
      wx.showToast({ title: scene.coming_soon_text || '即将上线', icon: 'none' });
      return;
    }

    // 直接跳转，登录检查移到场景页面生成时触发
    this._doNavigateToScene(scene);
  },

  // 执行场景跳转（内部方法）
  _doNavigateToScene(scene) {
    wx.navigateTo({
      url: `/pages/scene/scene?id=${scene.scene_key || scene.id}`,
      fail: (err) => {
        // 静默处理
        wx.showToast({ title: '页面跳转失败', icon: 'none' });
      }
    });
  },

  onUnload() {
    // 移除事件监听
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

    // 内存清理
    this._cleanupMemory();
  },

  // 内存清理
  _cleanupMemory() {
    // 清理大数据和事件处理器
    this.setData({
      activeScenes: [],
      comingSoonScenes: [],
      scenePages: [],
      bannerList: []
    });

    this._historyUpdateHandler = null;
    this._loginHandler = null;
  },

  // 下拉刷新 - 强制刷新配置
  async onPullDownRefresh() {
    try {
      await configManager.refresh();
      await this.loadMidplatformConfig();
      wx.showToast({ title: '已更新', icon: 'success', duration: 1500 });
    } catch (e) {
      // 静默处理
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  onShow() {
    // 设置tabBar选中状态并刷新语言和生成计数
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
      this.getTabBar().loadLanguage();
      this.getTabBar().updateGeneratingCount();
    }
    // 加载生成中的任务数量
    this.loadGeneratingCount();
    // 刷新语言
    this.loadLanguage();
    // 延迟登录模式：只更新状态，不强制弹窗
    // this.checkLoginStatus();
    this.updateLoginState();
    // 重置轮播图自动播放（解决长时间停留后卡顿问题）
    this.resetBannerAutoplay();
    // 每次进入页面都强制刷新配置，确保获取最新数据
    this.refreshConfig();
    // 检查隐私弹窗状态：如果已签署协议但弹窗还在显示，关闭它
    this.checkAndClosePrivacyModal();
  },

  // 检查并关闭不必要的隐私弹窗
  checkAndClosePrivacyModal() {
    const privacyConfirmed = wx.getStorageSync('privacyPolicyConfirmed');
    if (privacyConfirmed && this.data.showPrivacyModal) {
      this.setData({ showPrivacyModal: false });
      this.notifyTabBarDisabled(false);
    }
  },

  // 静默刷新配置（带节流，避免频繁请求）
  async refreshConfig() {
    try {
      const result = await configManager.throttledRefresh();
      if (result) {
        await this.loadMidplatformConfig();
      }
    } catch (e) {
      // 静默处理
    }
  },

  onHide() {
    // 页面隐藏时停止轮播自动播放，避免后台定时器冲突
    this.setData({ bannerAutoplay: false });
  },

  // 重置轮播图自动播放
  resetBannerAutoplay() {
    // 先关闭自动播放，清除可能存在的卡顿状态
    this.setData({ bannerAutoplay: false });
    // 延迟重新开启，确保swiper组件重置
    setTimeout(() => {
      this.setData({ bannerAutoplay: true });
    }, 100);
  },

  // 加载语言设置
  loadLanguage() {
    const currentLang = lang.getCurrentLang();

    // 根据语言切换特色功能图片
    const featureImageMap = {
      'zh-CN': imageConfig.images.featureZhCN,
      'en': imageConfig.images.featureEn
    };
    // 根据语言切换标题图片
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
    
    // 更新场景列表的多语言显示（如果场景已加载）
    if (this.data.scenePages && this.data.scenePages.length > 0) {
      this.updateSceneDisplayText(currentLang);
    }
    
    // 同时刷新 TabBar 的语言
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().loadLanguage();
    }
  },

  // 切换语言
  async switchLanguage(e) {
    const langCode = e.currentTarget.dataset.lang;
    if (langCode === this.data.currentLanguage) return;

    lang.setLang(langCode);

    // 根据语言切换特色功能图片
    const featureImageMap = {
      'zh-CN': imageConfig.images.featureZhCN,
      'en': imageConfig.images.featureEn
    };

    // 根据语言切换标题图片
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

    // 刷新配置以获取新语言的场景数据
    await configManager.refresh();
    await this.loadMidplatformConfig();

    // 同时刷新 TabBar 的语言
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().loadLanguage();
    }

    // 通知全局语言变化，让隐私弹窗等其他组件同步更新
    const app = getApp();
    if (app && app.emit) {
      app.emit('languageChanged', langCode);
    }
  },

  // 特色功能图片加载失败
  onFeatureImageError(e) {
    // 静默处理，回退到中文图片
    this.setData({
      featureImage: imageConfig.images.featureZhCN
    });
  },

  // 检查是否显示滑动提示
  checkSwipeHint() {
    const hasSwipedScene = wx.getStorageSync('hasSwipedScene');
    if (hasSwipedScene) {
      this.setData({ showSwipeHint: false });
    } else {
      // 5秒后自动隐藏提示
      setTimeout(() => {
        this.setData({ showSwipeHint: false });
      }, 5000);
    }
  },

  // Banner轮播切换
  onBannerChange(e) {
    this.setData({ bannerCurrent: e.detail.current });
  },

  // 场景切换
  onSwiperChange(e) {
    const current = e.detail.current;
    this.setData({ currentPage: current });

    // 隐藏滑动提示并记录
    if (this.data.showSwipeHint) {
      this.setData({ showSwipeHint: false });
      wx.setStorageSync('hasSwipedScene', true);
    }
  },

  // 加载生成中的任务数量
  loadGeneratingCount() {
    try {
      const history = wx.getStorageSync(HISTORY_KEY) || [];
      const generatingCount = history.filter(item => item.status === 'generating').length;
      const { lastGeneratingCount } = this.data;

      // 如果之前有生成任务，现在变成0，说明全部完成了
      if (lastGeneratingCount > 0 && generatingCount === 0) {
        this.showCompletedStatus();
      }

      this.setData({
        generatingCount,
        lastGeneratingCount: generatingCount
      });
    } catch (e) {
      // 静默处理
    }
  },

  // 显示完成状态（绿色提示条）
  showCompletedStatus() {
    this.setData({ showCompleted: true });
    // 3秒后自动隐藏
    setTimeout(() => {
      this.setData({ showCompleted: false });
    }, 3000);
  },

  // 跳转到历史页面
  goToHistory() {
    wx.switchTab({
      url: '/pages/history/history'
    });
  },

  // 检查登录状态和隐私政策
  // 强制模式：要求用户必须登录并签署协议才能使用
  checkLoginAndPrivacy() {
    const app = getApp();
    // 只信任 storage，不信任 globalData（热重载可能导致状态不一致）
    const userId = wx.getStorageSync('userId');
    const sessionKey = wx.getStorageSync('session_key');
    const isLoggedIn = !!userId && !!sessionKey;

    // 同步更新 globalData
    app.globalData.isLoggedIn = isLoggedIn;

    if (!isLoggedIn) {
      // 未登录，显示登录弹窗
      this.setData({ showLoginModal: true });
      this.notifyTabBarDisabled(true, '请先登录');
    } else {
      // 已登录，检查隐私政策
      this.checkPrivacyAfterLogin();
    }
  },

  // 通知TabBar禁用状态变化
  notifyTabBarDisabled(disabled, reason = '') {
    const app = getApp();
    if (app && app.emit) {
      app.emit('tabBarDisabledChange', {
        disabled,
        reason: reason || (disabled ? '请先完成操作' : '')
      });
    }
  },

  // 检查登录状态（onShow时调用）
  // 强制模式：必须登录并签署协议
  checkLoginStatus() {
    // 如果正在显示弹窗，不要重复检查
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
        // 已签署协议，确保所有弹窗关闭
        this.setData({
          showPrivacyModal: false,
          showLoginModal: false,
          showUserInfoModal: false
        });
        this.notifyTabBarDisabled(false);
      } else {
        // 未签署协议，显示隐私弹窗
        this.setData({ showPrivacyModal: true, showLoginModal: false, showUserInfoModal: false });
        this.notifyTabBarDisabled(true, '请先同意协议');
      }
    } else {
      // 未登录，显示登录弹窗
      this.setData({ showLoginModal: true, showPrivacyModal: false, showUserInfoModal: false });
      this.notifyTabBarDisabled(true, '请先登录');
    }
  },

  // 静默更新登录状态（延迟登录模式：不弹窗，只更新状态）
  updateLoginState() {
    const app = getApp();
    const userId = wx.getStorageSync('userId');
    const sessionKey = wx.getStorageSync('session_key');
    app.globalData.isLoggedIn = !!userId && !!sessionKey;
  },

  // 登录成功后检查隐私政策
  checkPrivacyAfterLogin() {
    // 获取当前页面路径，只有在 index 页面时才显示弹窗
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    const currentRoute = currentPage ? currentPage.route : '';

    // 如果当前不在 index 页面，不显示弹窗（其他页面会自己处理）
    if (currentRoute !== 'pages/index/index') {
      return;
    }

    const privacyConfirmed = wx.getStorageSync('privacyPolicyConfirmed');
    if (!privacyConfirmed) {
      // 显示隐私政策弹窗并禁用TabBar
      this.setData({ showPrivacyModal: true });
      this.notifyTabBarDisabled(true, '请先同意协议');
    } else {
      // 都通过了，启用TabBar
      this.notifyTabBarDisabled(false);
    }
  },

  // 登录弹窗关闭（暂不登录 / 先逛逛）
  // 延迟登录模式：允许关闭登录弹窗
  onLoginModalClose() {
    this.setData({ showLoginModal: false });
    this._pendingScene = null;
  },

  // 用户选择稍后登录（跳过登录）
  onLoginSkip() {
    this.setData({ showLoginModal: false });
    this._pendingScene = null;
  },

  // 登录成功
  onLoginSuccess(e) {
    const userData = e.detail || {};
    this.setData({ showLoginModal: false });
    
    const pendingScene = this._pendingScene;
    this._pendingScene = null;
    
    // 检查协议签署状态
    const privacyAgreed = userData.privacyAgreed === true;
    const termsAgreed = userData.termsAgreed === true;
    const privacyConfirmed = (privacyAgreed && termsAgreed) || wx.getStorageSync('privacyPolicyConfirmed');
    
    // 检查是否为新用户（没有昵称或头像）
    const isNewUser = !userData.nickname || !userData.avatarUrl;
    
    if (!privacyConfirmed) {
      // 未签署协议，显示隐私弹窗
      this._pendingSceneAfterPrivacy = pendingScene;
      this._isNewUser = isNewUser;
      this.checkPrivacyAfterLogin();
    } else if (isNewUser) {
      // 已签署协议但是新用户，显示用户信息设置弹窗
      this._pendingSceneAfterPrivacy = pendingScene;
      this.setData({ showUserInfoModal: true });
      this.notifyTabBarDisabled(true, '请完善个人信息');
    } else {
      // 老用户且已签署协议，直接进入
      if (pendingScene) {
        const scene = this.data.activeScenes.find(s => s.scene_key === pendingScene || s.id === pendingScene);
        if (scene) {
          setTimeout(() => this._doNavigateToScene(scene), 300);
        }
      }
      this.notifyTabBarDisabled(false);
    }
  },

  // 隐私政策弹窗关闭
  // 强制模式：不允许关闭隐私弹窗，必须同意才能使用
  onPrivacyModalClose() {
    wx.showToast({
      title: '请先同意协议后使用',
      icon: 'none'
    });
  },

  // 同意隐私政策（由 privacy-modal 组件的 agree 事件触发）
  // 注意：协议签署逻辑已在 privacy-modal 组件中完成，这里只更新页面状态
  onPrivacyAgree() {
    // 确保协议状态已保存
    const privacyConfirmed = wx.getStorageSync('privacyPolicyConfirmed');
    if (!privacyConfirmed) {
      console.warn('协议签署状态未保存到本地存储');
    }
    
    this.setData({ showPrivacyModal: false });
    this.loadLanguage();
    
    // 只有新用户才显示用户信息设置弹窗
    if (this._isNewUser) {
      this.setData({ showUserInfoModal: true });
      this.notifyTabBarDisabled(true, '请完善个人信息');
    } else {
      // 老用户直接启用TabBar
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

  // 用户信息设置完成
  onUserInfoComplete() {
    this.setData({ showUserInfoModal: false });
    // 启用TabBar
    this.notifyTabBarDisabled(false);
    
    // 检查是否有待跳转的场景
    const pendingScene = this._pendingSceneAfterPrivacy;
    this._pendingSceneAfterPrivacy = null;
    if (pendingScene) {
      const scene = this.data.activeScenes.find(s => s.scene_key === pendingScene || s.id === pendingScene);
      if (scene) {
        setTimeout(() => this._doNavigateToScene(scene), 300);
      }
    }
  },

  // 检查隐私政策确认状态（旧方法，保留兼容）
  checkPrivacyPolicy() {
    // 已由 checkLoginAndPrivacy 替代
  },

  // 跳转到隐私政策页面确认
  goToPrivacyConfirm() {
    this.setData({ showPrivacyModal: false });
    wx.navigateTo({
      url: '/pages/privacy/privacy'
    });
  },

  // 下次再说（保留但不再使用）
  delayPrivacy() {
    this.setData({ showPrivacyModal: false });
  },

  // 处理邀请
  handleInvite(inviterId) {
    // 将邀请者ID保存到全局，登录时会发送到服务器
    const app = getApp();
    if (app) {
      app.globalData.inviterId = inviterId;
    }

    // 同时保存到本地存储（备份）
    wx.setStorageSync('invitedBy', inviterId);
  },

  onShareAppMessage() {
    const userId = wx.getStorageSync('userId') || '';
    return {
      title: lang.t('shareTitle'),
      path: `/pages/index/index?inviter=${userId}`,
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