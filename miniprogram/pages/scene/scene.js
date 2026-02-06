// 通用场景页面 - 根据中台配置动态渲染
const { I18nPage } = require('../../utils/i18nPage');
const { t, getCurrentLang } = require('../../utils/lang');
const cosUtil = require('../../utils/cos');
const { checkImageSecurity, showSecurityAlert } = require('../../utils/security');
const aiService = require('../../utils/ai-service');
const configManager = require('../../utils/configManager');
const preloader = require('../../utils/preloader');
const { canShowRecharge, isIOS } = require('../../utils/platform');
const tracker = require('../../utils/tracker');

const HISTORY_KEY = 'photoHistory';

I18nPage({
  data: {
    sceneId: '',
    sceneConfig: null,
    configLoading: true,
    uploadedImages: [],
    loading: false,
    uploading: false,
    uploadProgress: 0, // 上传进度百分比
    // 步骤配置
    steps: [],
    currentStepIndex: 0,
    // 用户选择
    selections: {},
    // 各步骤的选项数据
    stepOptions: {},
    // 摇骰子步骤状态（受控组件模式）
    diceSteps: {},
    // 价格
    pointsPerPhoto: 100,
    generateCount: 1,
    totalPoints: 100,
    // 用户余额
    userPoints: 0,
    // 平台相关
    showRecharge: true,
    isIOSPlatform: false,
    // 弹窗
    showPayModal: false,
    showPrivacyModal: false,
    showLoginModal: false,
    showDiceRulesModal: false,
    currentDicePoolItems: [],
    currentDiceDrawType: 'phrase',
    currentDiceStepKey: '',
    // 历史
    historyList: [],
    showTopNotice: false,
    topNoticeText: '',
    pendingPayAfterRecharge: false,
    // 模板模式（参考图替换）
    isTemplateMode: false,
    templateId: '',
    templateConfig: null,
    referenceImage: '',
    referenceWeight: 0.8,
    faceSwapMode: 'replace',
    // 新增：多参考图支持
    referenceImages: [],
    currentRefIndex: 0,
    // 新增：用户图配置
    userImageConfig: {
      max_count: 3,
      slots: [{
        index: 1,
        title: '上传照片',
        title_en: 'Upload Photo',
        description: '请上传清晰的正面照片',
        description_en: 'Please upload a clear front photo',
        required: true,
        role: 'face_source'
      }]
    },
    emptySlots: [], // 空槽位列表
    // 新增：Prompt 预览
    showPromptPreview: true,
    promptPreview: '',
    promptPreviewExpanded: false,
    // 当前语言
    currentLang: 'zh-CN'
  },

  async onLoad(options) {
    const sceneId = options.id;
    const templateId = options.template_id; // 模板ID（如果是从模板市场进入）

    if (!sceneId && !templateId) {
      wx.showToast({ title: t('missingSceneParam') || '缺少场景参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    // 初始化平台设置
    this.setData({
      sceneId: sceneId || '',
      templateId: templateId || '',
      isTemplateMode: !!templateId,
      showRecharge: canShowRecharge(),
      isIOSPlatform: isIOS()
    });

    // 根据模式加载配置
    if (templateId) {
      // 模板模式：加载模板配置
      await this.loadTemplateConfig(templateId);
    } else {
      // 场景模式：加载场景配置
      await this.loadSceneConfig(sceneId);
    }

    this.loadHistory();
    this.loadUserPoints();
  },

  onUnload() {
    // 页面卸载时确保启用TabBar
    this.notifyTabBarDisabled(false);

    // 如果没有待处理的生成任务，清理临时图片存储
    if (!this._pendingGenerate && !this._pendingAction) {
      wx.removeStorageSync('_pendingUploadedImages');
    }

    // 内存清理
    this._cleanupMemory();
  },

  // 内存清理
  _cleanupMemory() {
    // 清理大数据
    this.setData({
      uploadedImages: [],
      steps: [],
      stepOptions: {},
      selections: {},
      historyList: []
    });

    // 清理私有变量
    this._rawSteps = null;
    this._allStepOptions = null;
    this._allSteps = null;
    this._lastLang = null;
  },

  // 检查登录和隐私协议
  async checkLoginAndPrivacy() {
    const app = getApp();

    // 1. 检查登录状态
    const isLoggedIn = app.checkLogin();
    if (!isLoggedIn) {
      this.setData({ showLoginModal: true });
      // 禁用TabBar
      this.notifyTabBarDisabled(true, t('pleaseLogin') || '请先登录');
      return false;
    }

    // 2. 检查隐私协议
    const privacyConfirmed = wx.getStorageSync('privacyPolicyConfirmed');
    if (!privacyConfirmed) {
      this.setData({ showPrivacyModal: true });
      // 禁用TabBar
      this.notifyTabBarDisabled(true, t('pleaseAgreePrivacy') || '请先同意协议');
      return false;
    }

    return true;
  },

  // 通知TabBar禁用状态变化
  notifyTabBarDisabled(disabled, reason = '') {
    const app = getApp();
    if (app && app.emit) {
      app.emit('tabBarDisabledChange', {
        disabled,
        reason: reason || (disabled ? (t('pleaseCompleteAction') || '请先完成操作') : '')
      });
    }
  },

  // 检查登录状态（onShow时调用）
  checkLoginStatus() {
    const app = getApp();
    const isLoggedIn = app.checkLogin();

    if (!isLoggedIn) {
      this.setData({ showLoginModal: true });
      this.notifyTabBarDisabled(true, t('pleaseLogin') || '请先登录');
      return;
    }

    // 已登录，检查隐私协议
    const privacyConfirmed = wx.getStorageSync('privacyPolicyConfirmed');
    if (!privacyConfirmed) {
      this.setData({ showPrivacyModal: true });
      this.notifyTabBarDisabled(true, t('pleaseAgreePrivacy') || '请先同意协议');
    } else {
      // 都通过了，确保TabBar启用
      this.notifyTabBarDisabled(false);
    }
  },

  // 登录弹窗关闭（用户点击稍后再说）
  onLoginModalClose() {
    this.setData({ showLoginModal: false });
    // 清除待处理标记
    this._pendingGenerate = false;
    this._pendingAction = null;
  },

  // 登录成功
  async onLoginSuccess(e) {
    const userData = e?.detail || {};
    this.setData({ showLoginModal: false });

    // 恢复登录前保存的图片
    const pendingImages = wx.getStorageSync('_pendingUploadedImages');
    if (pendingImages && pendingImages.length > 0 && this.data.uploadedImages.length === 0) {
      this.setData({ uploadedImages: pendingImages });
    }
    wx.removeStorageSync('_pendingUploadedImages');

    // 先刷新用户积分
    await this.loadUserPoints();

    // 关键修复：登录后重新加载骰子免费次数
    if (this._rawSteps && this._rawSteps.length > 0) {
      await this.loadDiceFreeCount(this._rawSteps);
    }

    // 优先使用登录返回的协议状态，其次使用本地存储
    const privacyAgreed = userData.privacyAgreed === true;
    const termsAgreed = userData.termsAgreed === true;
    const privacyConfirmed = (privacyAgreed && termsAgreed) || wx.getStorageSync('privacyPolicyConfirmed');

    if (!privacyConfirmed) {
      this.setData({ showPrivacyModal: true });
      return;
    }

    // 启用 TabBar
    this.notifyTabBarDisabled(false);

    // 如果是从生成流程触发的登录，继续生成
    if (this._pendingGenerate) {
      this._pendingGenerate = false;
      // 直接显示支付弹窗（积分已在上面刷新）
      this.setData({ showPayModal: true });
    } else if (this._pendingAction === 'chooseImage') {
      this._pendingAction = null;
      this.chooseImage();
    }
  },

  // 隐私协议弹窗关闭（拒绝）
  onPrivacyModalClose() {
    // 用户拒绝协议，启用TabBar并返回上一页
    this.notifyTabBarDisabled(false);
    wx.navigateBack();
  },

  // 同意隐私协议（由 privacy-modal 组件的 agree 事件触发）
  // 注意：协议签署逻辑已在 privacy-modal 组件中完成，这里只更新页面状态
  async onPrivacyAgree() {
    this.setData({ showPrivacyModal: false });

    // 启用 TabBar
    this.notifyTabBarDisabled(false);

    // 如果是从生成流程触发的协议确认，继续生成
    if (this._pendingGenerate) {
      this._pendingGenerate = false;
      await this.loadUserPoints();
      this.setData({ showPayModal: true });
    }
  },

  // 加载页面内容
  async loadPageContent() {
    const { sceneId } = this.data;
    if (sceneId) {
      await this.loadSceneConfig(sceneId);
      this.loadHistory();
      this.loadUserPoints();
    }
  },

  /**
   * 通用选项处理函数
   * 将后端返回的选项数据转换为前端使用的格式
   * @param {Array} options - 原始选项数组
   * @param {Object} config - 额外配置
   *   - filterBy: 过滤字段名（如 'gender'）
   *   - filterValue: 过滤值（如 'male'）
   *   - includeImage: 是否包含图片字段
   *   - includeColor: 是否包含颜色字段
   * @returns {Array} 处理后的选项数组
   */
  _processOptions(options, config = {}) {
    if (!options || !Array.isArray(options)) {
      return [];
    }
    
    const { filterBy, filterValue, includeImage = false, includeColor = false } = config;
    
    // 根据依赖字段过滤
    let filteredOptions = options;
    if (filterBy && filterValue) {
      filteredOptions = options.filter(opt => opt[filterBy] === filterValue);
    }
    
    // 转换为前端格式（后端已经根据语言返回了正确的 label）
    return filteredOptions.map(opt => {
      const result = {
        id: String(opt.id || ''),            // 统一转为字符串，避免类型比较问题
        name: opt.label || opt.name || '',   // 后端已根据语言返回正确的 label
        promptText: opt.prompt_text || '',
        isDefault: opt.is_default || false
      };
      
      // 按需添加可选字段
      if (includeImage && opt.image) result.image = opt.image;
      if (includeColor && opt.color) result.color = opt.color;
      if (opt.metadata) result.metadata = opt.metadata;
      
      return result;
    });
  },

  /**
   * 获取默认选中项
   * @param {Array} options - 选项数组
   * @returns {string} 默认选中的 id
   */
  _getDefaultSelection(options) {
    if (!options || options.length === 0) return '';
    const defaultOpt = options.find(o => o.isDefault) || options[0];
    return defaultOpt?.id || '';
  },

  /**
   * 检查步骤是否需要根据组件类型包含图片
   */
  _needsImage(componentType) {
    return componentType === 'image_tags';
  },

  /**
   * 检查步骤是否需要根据组件类型包含颜色
   */
  _needsColor(componentType) {
    return componentType === 'color_picker';
  },

  // 加载场景配置
  async loadSceneConfig(sceneId) {
    try {
      this.setData({ configLoading: true });

      // 获取当前语言
      const currentLang = getCurrentLang();

      // 优先使用预加载缓存的场景配置
      let sceneConfig = preloader.getCachedSceneDetail(sceneId, currentLang);

      // 如果缓存不存在或语言不匹配，从 API 获取
      if (!sceneConfig) {
        sceneConfig = await configManager.getSceneDetail(sceneId, currentLang);
      }
      
      if (!sceneConfig) {
        wx.showToast({ title: t('sceneNotExist') || '场景不存在', icon: 'none' });
        this.setData({ configLoading: false });
        return;
      }

      // 设置导航栏标题（后端已根据语言返回正确的 name）
      wx.setNavigationBarTitle({
        title: sceneConfig.name || t('scene') || '场景'
      });

      const steps = sceneConfig.steps || [];
      const pointsPerPhoto = sceneConfig.points_cost || 100;

      // 保存原始步骤配置
      this._rawSteps = steps;

      // 初始化选择项和选项数据
      const selections = {};
      const stepOptions = {};

      // 过滤可见步骤（后端已根据语言返回正确的 title）
      const visibleSteps = steps.filter(step => step.is_visible !== false);

      // 第一遍：处理没有依赖的步骤（如性别选择）
      visibleSteps.forEach(step => {
        const key = step.step_key;
        const options = step.options || [];
        const componentType = step.component_type;

        // 跳过图片上传类型
        if (componentType === 'image_upload') {
          return;
        }

        // 跳过有依赖的步骤，稍后处理
        if (step.depends_on) {
          return;
        }

        // 处理无依赖的步骤
        if (componentType === 'gender_select') {
          // 性别选择 - 使用语言包获取翻译
          stepOptions[key] = [
            { id: 'male', name: t('fp_male') },
            { id: 'female', name: t('fp_female') }
          ];
          selections[key] = 'male';
        } else if (componentType === 'slider') {
          // 滑块
          selections[key] = step.default_value || 50;
        } else if (options.length > 0) {
          // 其他类型：通用处理
          stepOptions[key] = this._processOptions(options, {
            includeImage: this._needsImage(componentType),
            includeColor: this._needsColor(componentType)
          });
          selections[key] = this._getDefaultSelection(stepOptions[key]);
        }
      });

      // 第二遍：处理有依赖的步骤
      visibleSteps.forEach(step => {
        const key = step.step_key;
        const options = step.options || [];
        const componentType = step.component_type;
        const dependsOn = step.depends_on;

        // 只处理有依赖的步骤
        if (!dependsOn || componentType === 'image_upload') {
          return;
        }

        // 获取依赖步骤的当前选中值
        const dependentValue = selections[dependsOn.step];
        const filterField = dependsOn.filter_field;

        // 根据依赖值过滤选项
        stepOptions[key] = this._processOptions(options, {
          filterBy: filterField,
          filterValue: dependentValue,
          includeImage: this._needsImage(componentType),
          includeColor: this._needsColor(componentType)
        });
        selections[key] = this._getDefaultSelection(stepOptions[key]);
      });

      // 保存步骤依赖关系和原始选项，用于动态更新
      this._stepDependencies = {};
      this._allStepOptions = {};
      this._allSteps = visibleSteps;
      
      visibleSteps.forEach(step => {
        if (step.depends_on) {
          // 记录依赖关系
          this._stepDependencies[step.step_key] = {
            dependsOn: step.depends_on,
            componentType: step.component_type
          };
          // 保存原始选项
          this._allStepOptions[step.step_key] = step.options || [];
        }
      });

      // 调试：检查数据格式
      for (const key of Object.keys(stepOptions)) {
        const opts = stepOptions[key];
        if (!opts || opts.length === 0) {
          // 静默处理
        }
      }

      // 初始化用户图配置（场景模式使用默认配置）
      const userImageConfig = {
        max_count: 3,
        slots: [{
          index: 1,
          title: '上传照片',
          title_en: 'Upload Photo',
          description: '请上传清晰的正面照片',
          description_en: 'Please upload a clear front photo',
          required: true,
          role: 'face_source'
        }]
      };
      const emptySlots = this._calculateEmptySlots(userImageConfig, 0);

      this.setData({
        configLoading: false,
        sceneConfig,
        steps: visibleSteps,
        pointsPerPhoto,
        totalPoints: pointsPerPhoto * this.data.generateCount,
        selections,
        stepOptions,
        userImageConfig,
        emptySlots,
        currentLang
      });

      // 初始化摇骰子步骤状态
      this.initDiceSteps(visibleSteps);

      // 生成初始 Prompt 预览
      this.updatePromptPreview();

    } catch (error) {
      // 静默处理
      this.setData({ configLoading: false });
      wx.showToast({ title: t('configLoadFailed') || '配置加载失败', icon: 'none' });
    }
  },

  // 加载模板配置（参考图替换模式）
  async loadTemplateConfig(templateId) {
    const { api } = require('../../config/api');

    try {
      this.setData({ configLoading: true });

      const userId = wx.getStorageSync('userId');
      const res = await api.getTemplateDetail(templateId, userId);

      if (res.code !== 200 || !res.data) {
        wx.showToast({ title: '模板不存在', icon: 'none' });
        this.setData({ configLoading: false });
        return;
      }

      const templateConfig = res.data;

      // 设置导航栏标题
      wx.setNavigationBarTitle({
        title: templateConfig.name || '模板'
      });

      const steps = templateConfig.steps || [];
      const pointsPerPhoto = templateConfig.points_cost || 50;

      // 初始化选择项和选项数据
      const selections = {};
      const stepOptions = {};

      // 处理步骤配置
      const visibleSteps = steps.filter(step => step.is_visible !== false);

      visibleSteps.forEach(step => {
        const key = step.step_key;
        const options = step.options || [];
        const componentType = step.component_type;

        if (componentType === 'image_upload') {
          return;
        }

        if (componentType === 'gender_select') {
          stepOptions[key] = [
            { id: 'male', name: t('fp_male') || '男' },
            { id: 'female', name: t('fp_female') || '女' }
          ];
          selections[key] = 'male';
        } else if (componentType === 'slider') {
          selections[key] = step.default_value || 50;
        } else if (options.length > 0) {
          stepOptions[key] = this._processOptions(options, {
            includeImage: this._needsImage(componentType),
            includeColor: this._needsColor(componentType)
          });
          selections[key] = this._getDefaultSelection(stepOptions[key]);
        }
      });

      // 获取参考图和 Prompt 配置
      const referenceImage = templateConfig.reference_image || '';
      const promptConfig = templateConfig.prompt || {};

      // 新增：获取多参考图配置
      const referenceImages = templateConfig.referenceImages || [];

      // 新增：获取用户图配置
      let userImageConfig = templateConfig.userImageConfig || {
        max_count: 3,
        slots: [{
          index: 1,
          title: '上传照片',
          title_en: 'Upload Photo',
          description: '请上传清晰的正面照片',
          description_en: 'Please upload a clear front photo',
          required: true,
          role: 'face_source'
        }]
      };

      // 计算空槽位
      const emptySlots = this._calculateEmptySlots(userImageConfig, 0);

      // 获取当前语言
      const currentLang = getCurrentLang();

      this.setData({
        configLoading: false,
        templateConfig,
        sceneConfig: templateConfig, // 兼容现有逻辑
        steps: visibleSteps,
        pointsPerPhoto,
        totalPoints: pointsPerPhoto * this.data.generateCount,
        selections,
        stepOptions,
        referenceImage,
        referenceImages,
        referenceWeight: promptConfig.reference_weight || 0.8,
        faceSwapMode: promptConfig.face_swap_mode || 'replace',
        isTemplateMode: true,
        userImageConfig,
        emptySlots,
        currentLang
      });

      // 初始化摇骰子步骤状态
      this.initDiceSteps(visibleSteps);

      // 生成初始 Prompt 预览
      this.updatePromptPreview();

    } catch (error) {
      console.error('[Scene] 加载模板配置失败:', error);
      this.setData({ configLoading: false });
      wx.showToast({ title: '模板加载失败', icon: 'none' });
    }
  },

  // 计算空槽位
  _calculateEmptySlots(userImageConfig, uploadedCount) {
    const maxCount = userImageConfig.max_count || 3;
    const slots = userImageConfig.slots || [];
    const emptySlots = [];

    for (let i = uploadedCount; i < maxCount; i++) {
      const slotConfig = slots[i] || {
        index: i + 1,
        title: '添加照片',
        title_en: 'Add Photo',
        required: false
      };
      emptySlots.push(slotConfig);
    }

    return emptySlots;
  },

  // 选择参考图
  selectReferenceImage(e) {
    const index = e.currentTarget.dataset.index;
    const { referenceImages } = this.data;

    if (referenceImages[index]) {
      this.setData({
        currentRefIndex: index,
        referenceImage: referenceImages[index].image_url
      });
    }
  },

  // 预览参考图
  previewReferenceImage() {
    const { referenceImage, referenceImages } = this.data;
    const urls = referenceImages.length > 0
      ? referenceImages.map(img => img.image_url)
      : [referenceImage];

    wx.previewImage({
      current: referenceImage,
      urls: urls.filter(Boolean)
    });
  },

  // 为指定槽位选择图片
  chooseImageForSlot(e) {
    const slotIndex = e.currentTarget.dataset.slotIndex;
    this._currentSlotIndex = slotIndex;
    this.chooseImage();
  },

  // 切换 Prompt 预览展开状态
  togglePromptPreview() {
    this.setData({
      promptPreviewExpanded: !this.data.promptPreviewExpanded
    });
  },

  // 更新 Prompt 预览
  updatePromptPreview() {
    const prompt = this.buildPrompt();
    this.setData({ promptPreview: prompt });
  },

  onShow() {
    // 加载历史和用户余额（登录检查移到生成时触发）
    this.loadHistory();
    this.loadUserPoints();
    if (this.data.pendingPayAfterRecharge) {
      this.setData({ pendingPayAfterRecharge: false });
      setTimeout(() => this.showPaymentModal(), 500);
    }

    // 检查语言是否变化，如果变化则重新加载配置和语言包
    const currentLang = getCurrentLang();
    if (this._lastLang && this._lastLang !== currentLang) {
      this._lastLang = currentLang;
      // 手动重新加载语言包（更新底部栏等UI文字）
      if (this.loadLanguage) {
        this.loadLanguage();
      }
      // 重新加载场景配置（更新选项翻译）
      if (this.data.sceneId) {
        this.loadSceneConfig(this.data.sceneId);
      }
    } else {
      this._lastLang = currentLang;
    }
  },

  // 加载用户余额
  async loadUserPoints() {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      this.setData({ userPoints: 0 });
      return;
    }
    const app = getApp();
    try {
      const balance = await app.getUserPoints();
      this.setData({ userPoints: balance });
    } catch (error) {
      const userPoints = wx.getStorageSync('userPoints') || 0;
      this.setData({ userPoints });
    }
  },

  // 选择选项（通用）
  selectOption(e) {
    const { key, id } = e.currentTarget.dataset;
    const newSelections = { ...this.data.selections, [key]: id };

    // 检查是否有其他步骤依赖当前步骤
    const hasDependents = this._hasDependentSteps(key);

    if (hasDependents) {
      // 更新所有依赖当前步骤的选项
      this._updateDependentOptions(key, id, newSelections);
    } else {
      this.setData({ selections: newSelections }, () => {
        this.logCurrentPrompt();
        this.updatePromptPreview();
      });
    }
  },

  /**
   * 检查是否有步骤依赖指定的步骤
   * @param {string} stepKey - 步骤 key
   * @returns {boolean}
   */
  _hasDependentSteps(stepKey) {
    if (!this._stepDependencies) return false;
    return Object.values(this._stepDependencies).some(
      dep => dep.dependsOn && dep.dependsOn.step === stepKey
    );
  },

  /**
   * 更新所有依赖指定步骤的选项
   * @param {string} changedKey - 变化的步骤 key
   * @param {string} newValue - 新选中的值
   * @param {Object} selections - 当前选择状态
   */
  _updateDependentOptions(changedKey, newValue, selections) {
    const newStepOptions = { ...this.data.stepOptions };
    const newSelections = { ...selections };

    // 遍历所有有依赖的步骤
    Object.entries(this._stepDependencies || {}).forEach(([stepKey, depInfo]) => {
      const { dependsOn, componentType } = depInfo;
      
      // 只更新依赖当前变化步骤的选项
      if (dependsOn.step !== changedKey) {
        return;
      }

      const allOptions = this._allStepOptions[stepKey] || [];
      const filterField = dependsOn.filter_field;

      // 根据新的依赖值过滤选项
      const filteredOptions = this._processOptions(allOptions, {
        filterBy: filterField,
        filterValue: newValue,
        includeImage: this._needsImage(componentType),
        includeColor: this._needsColor(componentType)
      });

      newStepOptions[stepKey] = filteredOptions;
      newSelections[stepKey] = this._getDefaultSelection(filteredOptions);
    });

    this.setData({
      stepOptions: newStepOptions,
      selections: newSelections
    }, () => {
      this.logCurrentPrompt();
      this.updatePromptPreview();
    });
  },

  // 预览图片标签大图
  previewTagImage(e) {
    const { url, name } = e.currentTarget.dataset;
    if (url) {
      wx.previewImage({
        current: url,
        urls: [url]
      });
    }
  },

  // 滑块变化
  onSliderChange(e) {
    const { key } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      [`selections.${key}`]: value
    }, () => {
      this.logCurrentPrompt();
    });
  },

  // ========== 摇骰子相关方法（重构版）==========

  // 初始化摇骰子步骤状态
  initDiceSteps(steps) {
    const diceSteps = {};
    const userId = wx.getStorageSync('userId');

    steps.forEach(step => {
      if (step.component_type === 'random_dice') {
        diceSteps[step.step_key] = {
          result: null,
          isRolling: false,
          // 关键修复：未登录时设为0，已登录时设为null表示待加载
          freeCount: userId ? null : 0,
          confirmed: false,
          poolItems: [],
          loading: !!userId  // 已登录时标记为加载中
        };
      }
    });
    this.setData({ diceSteps });

    // 加载各步骤的免费次数（仅已登录用户）
    if (userId) {
      this.loadDiceFreeCount(steps);
    }
  },

  // 加载摇骰子免费次数
  async loadDiceFreeCount(steps) {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      // 未登录用户，设置 freeCount 为 0，loading 为 false
      steps.forEach(step => {
        if (step.component_type === 'random_dice') {
          this.setData({
            [`diceSteps.${step.step_key}.freeCount`]: 0,
            [`diceSteps.${step.step_key}.loading`]: false
          });
        }
      });
      return;
    }

    const { request } = require('../../config/api');

    for (const step of steps) {
      if (step.component_type === 'random_dice') {
        try {
          const drawType = step.config?.poolType || 'phrase';
          const res = await request({
            url: `/draw/free-count/${userId}/${this.data.sceneId}/${drawType}`,
            method: 'GET'
          });
          if (res.code === 0) {
            this.setData({
              [`diceSteps.${step.step_key}.freeCount`]: res.data.freeCount,
              [`diceSteps.${step.step_key}.loading`]: false
            });
          } else {
            this.setData({
              [`diceSteps.${step.step_key}.freeCount`]: 0,
              [`diceSteps.${step.step_key}.loading`]: false
            });
          }
        } catch (error) {
          console.error('[Scene] Load dice free count error:', error);
          this.setData({
            [`diceSteps.${step.step_key}.freeCount`]: 0,
            [`diceSteps.${step.step_key}.loading`]: false
          });
        }
      }
    }
  },

  // 重置摇骰子步骤状态（生成完成后调用）
  resetDiceSteps() {
    const { diceSteps, selections } = this.data;
    const newDiceSteps = {};
    const newSelections = { ...selections };

    // 遍历所有骰子步骤，重置状态
    Object.keys(diceSteps).forEach(stepKey => {
      newDiceSteps[stepKey] = {
        result: null,
        isRolling: false,
        freeCount: diceSteps[stepKey].freeCount, // 保留当前免费次数
        confirmed: false,
        poolItems: diceSteps[stepKey].poolItems, // 保留选项池数据
        loading: false
      };
      // 清空对应的选择值
      delete newSelections[stepKey];
    });

    this.setData({
      diceSteps: newDiceSteps,
      selections: newSelections
    });

    console.log('[Scene] Dice steps reset after generation');
  },

  // 摇骰子请求（由 dice-roller 组件触发）
  async onDiceRoll(e) {
    const { stepKey, drawType, sceneId, needPay } = e.detail;
    console.log('[Scene] Dice roll request:', stepKey, drawType, needPay);

    const userId = wx.getStorageSync('userId');
    if (!userId) {
      // 弹出登录窗口
      this.setData({ showLoginModal: true });
      return;
    }

    // 设置滚动状态
    this.setData({
      [`diceSteps.${stepKey}.isRolling`]: true
    });

    try {
      const { request } = require('../../config/api');
      const res = await request({
        url: '/draw/roll',
        method: 'POST',
        data: { userId, sceneId, drawType }
      });

      // 等待动画完成
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (res.code === 0) {
        const result = res.data.result;
        const value = drawType === 'phrase' ? result.phrase : result.grade_key;
        // 对于 horse 类型，使用 prompt_text 作为 prompt 变量值
        const promptValue = drawType === 'phrase' ? result.phrase : (result.prompt_text || result.name);

        this.setData({
          [`diceSteps.${stepKey}.result`]: result,
          [`diceSteps.${stepKey}.isRolling`]: false,
          [`diceSteps.${stepKey}.freeCount`]: res.data.isFree
            ? this.data.diceSteps[stepKey].freeCount - 1
            : this.data.diceSteps[stepKey].freeCount,
          [`selections.${stepKey}`]: promptValue,
          userPoints: res.data.newBalance || this.data.userPoints
        }, () => {
          this.logCurrentPrompt();
        });
      } else {
        this.setData({
          [`diceSteps.${stepKey}.isRolling`]: false
        });
        wx.showToast({ title: res.msg || '抽取失败', icon: 'none' });
      }
    } catch (error) {
      console.error('[Scene] Dice roll error:', error);
      this.setData({
        [`diceSteps.${stepKey}.isRolling`]: false
      });
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  // 摇骰子确认选择（由 dice-roller 组件触发）
  onDiceConfirm(e) {
    const { stepKey, result } = e.detail;
    console.log('[Scene] Dice confirm:', stepKey, result);

    this.setData({
      [`diceSteps.${stepKey}.confirmed`]: true
    });
  },

  // 醒币不足事件处理
  onDiceInsufficientPoints(e) {
    const { stepKey, required, current } = e.detail;
    console.log('[Scene] Insufficient points:', stepKey, required, current);

    // 可以在这里显示充值弹窗
    if (this.data.showRecharge) {
      this.setData({ showPayModal: true });
    }
  },

  // 加载骰子选项池数据
  async onLoadDicePool(e) {
    const { stepKey, drawType, sceneId } = e.detail;
    console.log('[Scene] Load dice pool:', stepKey, drawType, sceneId);

    // 如果已经加载过，不重复加载
    if (this.data.diceSteps[stepKey]?.poolItems?.length > 0) {
      return;
    }

    try {
      const { request } = require('../../config/api');
      const res = await request({
        url: `/draw/pool/${sceneId}/${drawType}`,
        method: 'GET'
      });

      if (res.code === 0) {
        this.setData({
          [`diceSteps.${stepKey}.poolItems`]: res.data.items || []
        });
      }
    } catch (error) {
      console.error('[Scene] Load dice pool error:', error);
    }
  },

  // 旧版回调（保持兼容）
  onDiceResult(e) {
    // 重构后不再使用，保留空实现以防旧代码调用
    console.log('[Scene] onDiceResult (deprecated):', e.detail);
  },

  onDiceSelect(e) {
    // 重构后不再使用，保留空实现以防旧代码调用
    console.log('[Scene] onDiceSelect (deprecated):', e.detail);
  },

  // ========== 摇骰子相关方法结束 ==========

  // 显示骰子规则弹窗（从标题问号点击）
  async onShowDiceRules(e) {
    const { stepKey, drawType } = e.currentTarget.dataset;
    console.log('[Scene] Show dice rules:', stepKey, drawType);

    this.setData({
      showDiceRulesModal: true,
      currentDiceDrawType: drawType,
      currentDiceStepKey: stepKey,
      currentDicePoolItems: []
    });

    // 加载选项池数据
    try {
      const { request } = require('../../config/api');
      const res = await request({
        url: `/draw/pool/${this.data.sceneId}/${drawType}`,
        method: 'GET'
      });

      if (res.code === 0) {
        this.setData({
          currentDicePoolItems: res.data.items || []
        });
      }
    } catch (error) {
      console.error('[Scene] Load dice pool error:', error);
    }
  },

  // 关闭骰子规则弹窗
  onCloseDiceRules() {
    this.setData({
      showDiceRulesModal: false
    });
  },

  // 输出当前完整 Prompt（调试用）
  logCurrentPrompt() {
    const prompt = this.buildPrompt();
  },

  // 选择图片
  chooseImage() {
    // 登录检查
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      // 保存当前上传的图片到临时存储，防止登录流程中丢失
      if (this.data.uploadedImages.length > 0) {
        wx.setStorageSync('_pendingUploadedImages', this.data.uploadedImages);
      }
      this._pendingAction = 'chooseImage';
      this.setData({ showLoginModal: true });
      return;
    }

    const maxCount = this.data.userImageConfig.max_count || 3;
    const remainCount = maxCount - this.data.uploadedImages.length;
    wx.chooseMedia({
      count: remainCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const totalFiles = res.tempFiles.length;
        this.setData({ uploading: true, uploadProgress: 0 });
        const newImages = [];
        let processedCount = 0;

        // 更新进度的辅助函数
        const updateProgress = () => {
          const progress = Math.round((processedCount / totalFiles) * 100);
          this.setData({ uploadProgress: progress });
        };

        res.tempFiles.forEach(file => {
          const filePath = file.tempFilePath;
          const fileSize = file.size || 0; // 文件大小（字节）

          // 根据图片大小动态计算压缩参数
          wx.getImageInfo({
            src: filePath,
            success: (imgInfo) => {
              const { width, height } = imgInfo;
              const { quality, targetWidth } = this.calculateCompressParams(width, height, fileSize);

              wx.compressImage({
                src: filePath,
                quality: quality,
                compressedWidth: targetWidth,
                success: (compressRes) => {
                  const compressedPath = compressRes.tempFilePath;
                  wx.getFileSystemManager().readFile({
                    filePath: compressedPath,
                    encoding: 'base64',
                    success: (readRes) => {
                      cosUtil.saveImageToCOS(readRes.data, 'temp', this.data.sceneId).then(result => {
                        newImages.push({ path: result.url, cosUrl: result.cosUrl });
                        processedCount++;
                        updateProgress();
                        if (processedCount === totalFiles) {
                          this.finishImageUpload(newImages);
                        }
                      }).catch(() => {
                        newImages.push({ path: compressedPath });
                        processedCount++;
                        updateProgress();
                        if (processedCount === totalFiles) {
                          this.finishImageUpload(newImages);
                        }
                      });
                    },
                    fail: () => {
                      processedCount++;
                      updateProgress();
                      if (processedCount === totalFiles) {
                        this.finishImageUpload(newImages);
                      }
                    }
                  });
                },
                fail: () => {
                  newImages.push({ path: filePath });
                  processedCount++;
                  updateProgress();
                  if (processedCount === totalFiles) {
                    this.finishImageUpload(newImages);
                  }
                }
              });
            },
            fail: () => {
              // 获取图片信息失败，使用默认压缩参数
              wx.compressImage({
                src: filePath,
                quality: 60,
                compressedWidth: 800,
                success: (compressRes) => {
                  newImages.push({ path: compressRes.tempFilePath });
                  processedCount++;
                  updateProgress();
                  if (processedCount === totalFiles) {
                    this.finishImageUpload(newImages);
                  }
                },
                fail: () => {
                  newImages.push({ path: filePath });
                  processedCount++;
                  updateProgress();
                  if (processedCount === totalFiles) {
                    this.finishImageUpload(newImages);
                  }
                }
              });
            }
          });
        });
      }
    });
  },

  // 根据图片尺寸和大小动态计算压缩参数
  calculateCompressParams(width, height, fileSize) {
    const fileSizeKB = fileSize / 1024;
    const pixels = width * height;
    
    let quality, targetWidth;
    
    // 根据分辨率确定目标宽度
    if (width > 3000) {
      targetWidth = 1200;  // 超大图压缩到1200
    } else if (width > 2000) {
      targetWidth = 1000;  // 大图压缩到1000
    } else if (width > 1200) {
      targetWidth = 800;   // 中图压缩到800
    } else {
      targetWidth = Math.min(width, 800); // 小图保持或压缩到800
    }
    
    // 根据文件大小确定质量
    if (fileSizeKB > 5000) {
      quality = 40;  // 大于5MB，质量40
    } else if (fileSizeKB > 2000) {
      quality = 50;  // 2-5MB，质量50
    } else if (fileSizeKB > 1000) {
      quality = 60;  // 1-2MB，质量60
    } else if (fileSizeKB > 500) {
      quality = 70;  // 500KB-1MB，质量70
    } else {
      quality = 80;  // 小于500KB，质量80
    }
    
    return { quality, targetWidth };
  },

  // 完成图片上传
  async finishImageUpload(newImages) {
    if (newImages.length === 0) {
      this.setData({ uploading: false });
      return;
    }

    wx.showLoading({ title: t('checkingImage') || '正在检测图片...', mask: true });
    const safeImages = [];

    for (const img of newImages) {
      try {
        if (img.path && !img.path.startsWith('http')) {
          const result = await checkImageSecurity(img.path);
          if (result.safe) safeImages.push(img);
        } else {
          safeImages.push(img);
        }
      } catch (err) {
        safeImages.push(img);
      }
    }

    wx.hideLoading();
    this.setData({ uploading: false });

    if (safeImages.length > 0) {
      const newUploadedImages = [...this.data.uploadedImages, ...safeImages];
      const emptySlots = this._calculateEmptySlots(this.data.userImageConfig, newUploadedImages.length);
      this.setData({
        uploadedImages: newUploadedImages,
        emptySlots
      });
    }
  },

  // 删除图片
  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.uploadedImages];
    images.splice(index, 1);
    const emptySlots = this._calculateEmptySlots(this.data.userImageConfig, images.length);
    this.setData({
      uploadedImages: images,
      emptySlots
    });
  },

  // 增加数量
  increaseQuantity() {
    const count = Math.min(10, this.data.generateCount + 1);
    this.setData({
      generateCount: count,
      totalPoints: count * this.data.pointsPerPhoto
    });
  },

  // 减少数量
  decreaseQuantity() {
    const count = Math.max(1, this.data.generateCount - 1);
    this.setData({
      generateCount: count,
      totalPoints: count * this.data.pointsPerPhoto
    });
  },

  // 检查所有必填的摇骰子步骤是否已完成抽取
  checkRequiredDiceSteps() {
    const { sceneConfig, diceSteps } = this.data;
    const steps = sceneConfig.steps || [];

    for (const step of steps) {
      // 检查是否是必填的摇骰子步骤
      if (step.component_type === 'random_dice' &&
          step.is_required &&
          step.is_visible !== false) {
        const diceState = diceSteps[step.step_key];
        // 检查是否已完成抽取
        if (!diceState || diceState.result === null) {
          return {
            valid: false,
            missingStep: step.title || step.step_key
          };
        }
      }
    }

    return { valid: true, missingStep: null };
  },

  // 显示支付弹窗
  showPaymentModal() {
    const { uploadedImages, userImageConfig } = this.data;
    const minCount = userImageConfig.min_count || 1;

    // 检查最少上传数量
    if (uploadedImages.length < minCount) {
      const msg = minCount === 1
        ? (t('fp_pleaseUpload') || '请先上传照片')
        : `请至少上传${minCount}张照片`;
      wx.showToast({ title: msg, icon: 'none' });
      return;
    }

    // 检查必填的摇骰子步骤是否已完成
    const diceCheck = this.checkRequiredDiceSteps();
    if (!diceCheck.valid) {
      wx.showToast({
        title: `请先完成"${diceCheck.missingStep}"的抽取`,
        icon: 'none',
        duration: 2000
      });
      return;
    }

    const userId = wx.getStorageSync('userId');
    if (!userId) {
      // 保存当前上传的图片到临时存储，防止登录流程中丢失
      if (this.data.uploadedImages.length > 0) {
        wx.setStorageSync('_pendingUploadedImages', this.data.uploadedImages);
      }
      // 标记：登录成功后继续生成流程
      this._pendingGenerate = true;
      this.setData({ showLoginModal: true });
      return;
    }

    const privacyConfirmed = wx.getStorageSync('privacyPolicyConfirmed');
    if (!privacyConfirmed) {
      // 标记：同意协议后继续生成流程
      this._pendingGenerate = true;
      this.showPrivacyConfirmModal();
      return;
    }

    this.loadUserPoints().then(() => {
      this.setData({ showPayModal: true });
    });
  },

  hidePaymentModal() {
    this.setData({ showPayModal: false });
  },

  confirmPayment() {
    this.setData({ showPayModal: false });
    this.generatePhoto();
  },

  // 构建提示词
  buildPrompt() {
    const { sceneConfig, selections, stepOptions } = this.data;
    let promptTemplate = sceneConfig.promptTemplate || '';

    // 替换变量
    const variables = {};
    Object.keys(selections).forEach(key => {
      const selectedId = selections[key];
      const options = stepOptions[key] || [];
      // 修复：使用宽松比较或字符串转换，确保能匹配到选项
      // 因为 selectedId 可能是字符串 "7"，而 option.id 可能是数字 7
      const selected = options.find(o =>
        String(o.id) === String(selectedId) || o.id == selectedId
      );

      if (key === 'gender') {
        // 对于 prompt 使用英文性别描述
        variables[key] = selectedId === 'male' ? 'male' : 'female';
      } else if (typeof selectedId === 'number' && !selected) {
        // 滑块值（只有在没有匹配到选项时才当作滑块值处理）
        variables[key] = selectedId;
      } else {
        // 优先使用 promptText，其次 name，最后才用 selectedId
        variables[key] = selected?.promptText || selected?.name || selectedId;
      }
    });

    // 替换模板变量
    Object.keys(variables).forEach(key => {
      promptTemplate = promptTemplate.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
    });

    // 如果没有模板，生成默认提示词
    if (!promptTemplate) {
      promptTemplate = `基于参考图生成${sceneConfig.name}。`;
      Object.values(variables).forEach(v => {
        if (v) promptTemplate += `${v}，`;
      });
    }

    return promptTemplate;
  },

  // 生成照片
  async generatePhoto() {
    const { uploadedImages, userImageConfig } = this.data;
    const minCount = userImageConfig.min_count || 1;

    // 检查最少上传数量
    if (uploadedImages.length < minCount) {
      const msg = minCount === 1
        ? (t('fp_pleaseUpload') || '请先上传照片')
        : `请至少上传${minCount}张照片`;
      wx.showToast({ title: msg, icon: 'none' });
      return;
    }

    const { generateCount, totalPoints, sceneConfig } = this.data;

    // 埋点：开始生成照片
    tracker.trackEvent('generate_photo', {
      sceneId: this.data.sceneId,
      sceneName: sceneConfig?.name,
      generateCount,
      totalPoints
    });

    const prompt = this.buildPrompt();
    const historyIds = [];

    for (let i = 0; i < generateCount; i++) {
      const id = this.addHistoryItem('generating', '', 0, prompt);
      historyIds.push(id);
    }

    wx.showToast({ title: t('fp_addedToQueue') || '已加入生成队列', icon: 'success', duration: 1500 });

    this.processGenerationQueue(historyIds, prompt, { totalPoints, generateCount });
  },

  // 添加历史记录
  addHistoryItem(status = 'generating', image = '', progress = 0, savedPrompt = '') {
    const { sceneConfig, selections, uploadedImages, stepOptions, steps, diceSteps } = this.data;
    const now = Date.now();

    // 构建包含多语言label的完整配置（从后台配置获取，不硬编码）
    const configWithLabels = {};
    for (const [key, value] of Object.entries(selections)) {
      if (!value || key === 'upload') continue;

      // 从 stepOptions 中查找对应的选项获取多语言label
      const options = stepOptions[key] || [];

      // 从 steps 中查找步骤的多语言标题
      const step = steps.find(s => s.step_key === key);
      // 获取原始step配置（包含多语言字段和原始options）
      const originalStep = this._allSteps?.find(s => s.step_key === key) || step;
      // 从未处理的原始步骤配置中查找，确保获取后台返回的完整数据
      const rawStep = this._rawSteps?.find(s => s.step_key === key);
      // 从原始步骤配置的options中查找，这里包含后台返回的多语言字段
      const originalOptions = rawStep?.options || originalStep?.options || [];

      // 检查是否是摇骰子类型的步骤，如果是则从 diceSteps 获取结果名称
      const diceResult = diceSteps?.[key]?.result;
      if (diceResult) {
        // 摇骰子步骤：使用 result.name 作为显示名称，而不是 prompt_text
        configWithLabels[key] = {
          id: value,
          label: diceResult.name || value,
          label_cn: diceResult.name || value,
          label_en: diceResult.name_en || diceResult.nameEn || '',
          stepTitle: rawStep?.title || originalStep?.title || key,
          stepTitle_cn: rawStep?.title || originalStep?.title || key,
          stepTitle_en: rawStep?.title_en || rawStep?.titleEn || originalStep?.title_en || originalStep?.titleEn || ''
        };
        continue;
      }

      // 匹配选项：可能是 id 或 option_key
      const selectedOption = options.find(opt =>
        opt.id === value ||
        opt.option_key === value ||
        String(opt.id) === String(value)
      );

      // 同时从原始选项中查找，以获取后台返回的多语言字段
      const originalOption = originalOptions.find(opt =>
        opt.id === value ||
        opt.option_key === value ||
        String(opt.id) === String(value)
      );

      if (selectedOption || originalOption) {
        const opt = selectedOption || {};
        const origOpt = originalOption || {};

        // 保存所有语言版本的label，供历史页面根据当前语言显示
        // 优先从原始选项获取多语言字段，因为处理后的选项可能丢失了这些字段
        configWithLabels[key] = {
          id: value,
          // 选项的多语言名称（从后台配置获取，尝试多种字段名格式）
          // label_cn: 简体中文（后台默认name字段）
          // label_en: 英文
          // label: 当前语言的显示值（兼容旧数据）
          label: opt.name || origOpt.name || value,
          label_cn: origOpt.name || origOpt.name_cn || opt.name || value,
          label_en: opt.nameEn || opt.name_en || origOpt.name_en || origOpt.nameEn || origOpt.en_name || '',
          // 步骤的多语言标题（从后台配置获取，优先使用原始配置）
          stepTitle: rawStep?.title || originalStep?.title || key,
          stepTitle_cn: rawStep?.title || originalStep?.title || key,
          stepTitle_en: rawStep?.title_en || rawStep?.titleEn || originalStep?.title_en || originalStep?.titleEn || ''
        };
      } else {
        configWithLabels[key] = {
          id: value,
          label: value,
          label_cn: value,
          label_en: '',
          stepTitle: rawStep?.title || originalStep?.title || key,
          stepTitle_cn: rawStep?.title || originalStep?.title || key,
          stepTitle_en: rawStep?.title_en || rawStep?.titleEn || originalStep?.title_en || originalStep?.titleEn || ''
        };
      }
    }

    const item = {
      id: now.toString() + Math.random().toString(36).substr(2, 5),
      createTime: now,
      status,
      resultImage: image,
      originalImage: uploadedImages.length > 0 ? uploadedImages[0].path : '',
      type: this.data.sceneId,
      // 场景名称多语言支持 - 优先使用对应语言字段，确保每种语言都保存正确的翻译
      spec: sceneConfig?.name || t('photo') || '照片',
      spec_cn: sceneConfig?.name_cn || sceneConfig?.nameCn || sceneConfig?.name || '照片',
      spec_en: sceneConfig?.name_en || sceneConfig?.nameEn || sceneConfig?.name || '',
      progress,
      config: configWithLabels,
      prompt: savedPrompt,  // 保存原始prompt用于重制
      promptTemplate: sceneConfig?.promptTemplate || '',  // 保存模板用于重建
      freeRetry: 1
    };

    const historyList = [item, ...this.data.historyList];
    this.setData({ historyList });
    this.saveHistory();

    return item.id;
  },

  // 更新历史记录
  updateHistoryItem(id, updates) {
    let history = wx.getStorageSync(HISTORY_KEY) || [];
    history = history.map(item => item.id === id ? { ...item, ...updates } : item);

    try {
      wx.setStorageSync(HISTORY_KEY, history.slice(0, 50));
    } catch (e) {
      // 静默处理
    }

    this.setData({ historyList: history });

    const app = getApp();
    if (app && app.emit) app.emit('historyUpdated');

    // 当状态变为 done 时，同步到服务器
    if (updates.status === 'done') {
      this.syncPhotoToServer(id, history.find(item => item.id === id));
    }
  },

  // 同步照片记录到服务器
  async syncPhotoToServer(photoId, historyItem) {
    if (!historyItem) return;

    const userId = wx.getStorageSync('userId');
    if (!userId) return;

    try {
      const { api } = require('../../config/api');
      await api.createPhoto({
        userId,
        taskId: photoId,
        scene: historyItem.spec || historyItem.type || '',  // 场景名称
        spec: historyItem.spec || '',
        originalUrl: historyItem.originalImage || '',
        pointsCost: this.data.pointsPerPhoto || 50
      });
    } catch (error) {
      // 静默处理，不影响用户体验
      console.log('[同步] 照片记录同步失败:', error.message);
    }
  },

  // 加载历史
  loadHistory() {
    try {
      const history = wx.getStorageSync(HISTORY_KEY) || [];
      this.setData({ historyList: history });
    } catch (e) {
      // 静默处理
    }
  },

  // 保存历史
  saveHistory() {
    try {
      let historyToSave = this.data.historyList.slice(0, 50);
      wx.setStorageSync(HISTORY_KEY, historyToSave);
    } catch (e) {
      // 静默处理
    }
  },

  // 扣除醒币
  async deductUserPoints(points, description) {
    const app = getApp();
    const userId = app.globalData.userId || wx.getStorageSync('userId');

    if (!userId) {
      return { success: false, message: t('userNotLoggedIn') || '用户未登录' };
    }

    try {
      const newBalance = await app.consumePoints(points, description);
      this.setData({ userPoints: newBalance });
      return { success: true, balance: newBalance };
    } catch (error) {
      const message = error.message || t('deductFailed') || '扣费失败';
      return { success: false, message };
    }
  },

  // 获取进度阶段定义（支持国际化）
  getProgressStages() {
    return {
      QUEUED: { progress: 5, text: t('progress_queued') || '排队中...' },
      DEDUCTING: { progress: 10, text: t('progress_deducting') || '扣费处理...' },
      UPLOADING: { progress: 20, text: t('progress_uploading') || '上传图片...' },
      PROCESSING: { progress: 40, text: t('progress_processing') || 'AI处理中...' },
      GENERATING: { progress: 60, text: t('progress_generating') || '生成图片...' },
      ENHANCING: { progress: 80, text: t('progress_enhancing') || '优化处理...' },
      SAVING: { progress: 90, text: t('progress_saving') || '保存中...' },
      DONE: { progress: 100, text: t('progress_done') || '完成' }
    };
  },

  // 处理生成队列
  async processGenerationQueue(historyIds, prompt, paymentInfo) {
    const MAX_CONCURRENT = 3;
    const STAGES = this.getProgressStages();

    // 阶段1: 排队
    historyIds.forEach(hid => this.updateHistoryItem(hid, { 
      progress: STAGES.QUEUED.progress, 
      progressText: STAGES.QUEUED.text 
    }));

    // 阶段2: 扣费
    historyIds.forEach(hid => this.updateHistoryItem(hid, { 
      progress: STAGES.DEDUCTING.progress,
      progressText: STAGES.DEDUCTING.text 
    }));

    const deductResult = await this.deductUserPoints(
      paymentInfo.totalPoints,
      `生成${paymentInfo.generateCount}张${this.data.sceneConfig?.name || '照片'}`
    );

    if (!deductResult.success) {
      historyIds.forEach(hid => {
        this.updateHistoryItem(hid, { status: 'failed', failReason: deductResult.message, progress: 0 });
      });
      wx.showToast({ title: deductResult.message, icon: 'none' });
      return;
    }

    // 消费记录已由服务器端 consumePoints 接口自动保存到 points_records 表

    // 阶段3: 上传准备
    historyIds.forEach(hid => this.updateHistoryItem(hid, { 
      progress: STAGES.UPLOADING.progress,
      progressText: STAGES.UPLOADING.text 
    }));

    const processOneTask = async (historyId, index) => {
      // 阶段4: AI处理
      this.updateHistoryItem(historyId, { 
        progress: STAGES.PROCESSING.progress,
        progressText: STAGES.PROCESSING.text 
      });

      try {
        let result = null;
        for (let retry = 0; retry < 3; retry++) {
          try {
            if (retry > 0) {
              const retryText = (t('progress_retrying') || '重试中({retry}/3)...').replace('{retry}', retry);
              this.updateHistoryItem(historyId, {
                progressText: retryText
              });
              await new Promise(resolve => setTimeout(resolve, 2000 + retry * 1000));
            }
            
            // 阶段5: 生成中
            this.updateHistoryItem(historyId, { 
              progress: STAGES.GENERATING.progress,
              progressText: STAGES.GENERATING.text 
            });
            
            result = await this.callAPI(prompt);
            break;
          } catch (err) {
            if (retry >= 2) throw err;
          }
        }

        if (result && result.imageData) {
          // 阶段6: 优化处理
          this.updateHistoryItem(historyId, { 
            progress: STAGES.ENHANCING.progress,
            progressText: STAGES.ENHANCING.text 
          });

          // 阶段7: 保存
          this.updateHistoryItem(historyId, { 
            progress: STAGES.SAVING.progress,
            progressText: STAGES.SAVING.text 
          });

          const filePath = await this.saveBase64ToFile(result.imageData, result.mimeType);
          
          // 阶段8: 完成
          this.updateHistoryItem(historyId, { 
            status: 'done', 
            resultImage: filePath, 
            progress: STAGES.DONE.progress,
            progressText: STAGES.DONE.text 
          });
          return { success: true };
        } else {
          this.updateHistoryItem(historyId, { status: 'failed', failReason: t('fp_noImage') || '未获取到图片', progress: 0 });
          return { success: false };
        }
      } catch (error) {
        this.updateHistoryItem(historyId, { status: 'failed', failReason: error.message || t('fp_generateFailed') || '生成失败', progress: 0 });
        return { success: false };
      }
    };

    const runWithConcurrencyLimit = async (tasks, limit) => {
      const results = [];
      const executing = [];

      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const p = task().then(result => {
          executing.splice(executing.indexOf(p), 1);
          return result;
        });
        results.push(p);
        executing.push(p);

        if (executing.length >= limit) {
          await Promise.race(executing);
        }
      }

      return Promise.all(results);
    };

    const tasks = historyIds.map((hid, index) => () => processOneTask(hid, index));
    const results = await runWithConcurrencyLimit(tasks, MAX_CONCURRENT);

    const successCount = results.filter(r => r.success).length;
    if (successCount > 0) {
      const completeMsg = (t('photosGenerateComplete') || '{count}张照片生成完成').replace('{count}', successCount);
      this.showNotice(completeMsg);

      // 关键修复：生成完成后重置骰子状态，清空抽到的词条
      this.resetDiceSteps();

      // 生成完成后自动跳转到历史页面，让用户查看结果
      setTimeout(() => {
        wx.switchTab({ url: '/pages/history/history' });
      }, 1500);
    } else {
      this.showNotice(t('fp_generateFailed') || '生成失败');
    }
  },

  // 调用AI API
  async callAPI(prompt) {
    const { isTemplateMode, referenceImage, referenceWeight, faceSwapMode, userImageConfig, uploadedImages } = this.data;

    // 获取用户上传的图片
    const maxCount = userImageConfig.max_count || 3;
    const imagesToUse = uploadedImages.slice(0, maxCount);

    if (imagesToUse.length === 0) {
      throw new Error(t('noAvailableImage') || '没有可用的图片');
    }

    // 构建图片数组（新格式）
    const images = [];

    // 读取用户照片的 base64
    for (let i = 0; i < imagesToUse.length; i++) {
      const img = imagesToUse[i];
      const slotConfig = userImageConfig.slots[i] || {};

      try {
        let base64Data;
        if (img.path.startsWith('http')) {
          base64Data = await this.downloadImageAsBase64(img.path);
        } else {
          base64Data = await new Promise((resolve, reject) => {
            wx.getFileSystemManager().readFile({
              filePath: img.path,
              encoding: 'base64',
              success: (res) => resolve(res.data),
              fail: reject
            });
          });
        }

        images.push({
          type: 'user',
          base64: base64Data,
          mimeType: 'image/jpeg',
          role: slotConfig.role || 'face_source',
          slot_index: i + 1,
          slot_title: slotConfig.title || `照片${i + 1}`
        });
      } catch (err) {
        console.error(`[Scene] 读取用户图片 ${i + 1} 失败:`, err);
      }
    }

    if (images.length === 0) {
      throw new Error(t('cannotReadImage') || '无法读取图片');
    }

    // 获取第一张用户图作为主图（兼容旧逻辑）
    const userImageBase64 = images[0].base64;
    const userMimeType = images[0].mimeType;

    // 模板模式：使用参考图替换
    if (isTemplateMode && referenceImage) {
      console.log('========== 参考图替换模式 ==========');
      console.log('[AI请求] 参考图:', referenceImage.substring(0, 50) + '...');
      console.log('[AI请求] 参考图权重:', referenceWeight);
      console.log('[AI请求] 替换模式:', faceSwapMode);
      console.log('[AI请求] 用户照片数量:', images.length);
      console.log('[AI请求] Prompt:', prompt);
      console.log('====================================');

      // 下载参考图
      let referenceImageBase64;
      try {
        referenceImageBase64 = await this.downloadImageAsBase64(referenceImage);
      } catch (err) {
        console.error('[AI请求] 下载参考图失败:', err);
        throw new Error('参考图加载失败');
      }

      // 添加参考图到图片数组
      images.unshift({
        type: 'reference',
        base64: referenceImageBase64,
        mimeType: 'image/jpeg',
        role: 'style_reference'
      });

      // 调用参考图替换 API（传递扩展参数）
      return aiService.generateWithReference(prompt, referenceImageBase64, userImageBase64, {
        referenceMimeType: 'image/jpeg',
        userMimeType: userMimeType,
        referenceWeight: referenceWeight,
        faceSwapMode: faceSwapMode,
        // 新增：传递完整图片数组（供后端扩展使用）
        images: images
      });
    }

    // 普通模式：使用原有的 Prompt 生成
    console.log('========== AI生图请求调试 ==========');
    console.log('[AI请求] 完整Prompt:');
    console.log(prompt);
    console.log('[AI请求] 图片类型:', userMimeType);
    console.log('[AI请求] 图片数量:', images.length);
    console.log('====================================');

    return aiService.generateImage(prompt, userImageBase64, userMimeType);
  },

  // 下载图片转base64
  downloadImageAsBase64(url) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url: url,
        success: (res) => {
          if (res.statusCode === 200) {
            wx.getFileSystemManager().readFile({
              filePath: res.tempFilePath,
              encoding: 'base64',
              success: (readRes) => resolve(readRes.data),
              fail: reject
            });
          } else {
            reject(new Error(t('downloadFailed') || '下载失败'));
          }
        },
        fail: reject
      });
    });
  },

  // 保存base64到文件
  saveBase64ToFile(base64Data, mimeType) {
    return new Promise((resolve, reject) => {
      cosUtil.saveImageToCOS(base64Data, 'output', this.data.sceneId).then(result => {
        resolve(result.url);
      }).catch(err => {
        const ext = mimeType.includes('png') ? 'png' : 'jpg';
        const filePath = `${wx.env.USER_DATA_PATH}/output_${Date.now()}.${ext}`;
        wx.getFileSystemManager().writeFile({
          filePath,
          data: base64Data,
          encoding: 'base64',
          success: () => resolve(filePath),
          fail: reject
        });
      });
    });
  },

  // 显示通知
  showNotice(text) {
    this.setData({ showTopNotice: true, topNoticeText: text });
    setTimeout(() => this.setData({ showTopNotice: false }), 5000);
  },

  // 跳转充值
  goToRecharge() {
    this.setData({ showPayModal: false, pendingPayAfterRecharge: true });
    wx.navigateTo({ url: '/pages/recharge/recharge' });
  },

  // 跳转邀请页面（iOS用户余额不足时使用）
  goToInvite() {
    this.setData({ showPayModal: false });
    wx.navigateTo({ url: '/pages/invite/invite' });
  },

  // 隐私相关
  showPrivacyConfirmModal() {
    this.setData({ showPrivacyModal: true });
  },

  hidePrivacyModal() {
    this.setData({ showPrivacyModal: false });
  },

  agreePrivacyAndContinue() {
    wx.setStorageSync('privacyPolicyConfirmed', true);
    this.setData({ showPrivacyModal: false });
    this.showPaymentModal();
  },

  showPrivacyRequiredTip() {
    wx.showModal({
      title: t('tip') || '提示',
      content: t('fp_privacyRequired') || '请先同意隐私政策',
      confirmText: t('fp_goAgree') || '去同意',
      cancelText: t('cancel') || '取消',
      success: (res) => {
        if (res.confirm) wx.navigateTo({ url: '/pages/privacy/privacy' });
      }
    });
  },

  viewPrivacyDetail() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  stopPropagation() {}
});