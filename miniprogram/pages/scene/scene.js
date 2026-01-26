// 通用场景页面 - 根据中台配置动态渲染
const { I18nPage } = require('../../utils/i18nPage');
const { t, getCurrentLang } = require('../../utils/lang');
const cosUtil = require('../../utils/cos');
const { checkImageSecurity, showSecurityAlert } = require('../../utils/security');
const aiService = require('../../utils/ai-service');
const configManager = require('../../utils/configManager');
const preloader = require('../../utils/preloader');
const { canShowRecharge, isIOS } = require('../../utils/platform');

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
    // 历史
    historyList: [],
    generatingCount: 0,
    showCompleted: false,
    showTopNotice: false,
    topNoticeText: '',
    pendingPayAfterRecharge: false
  },

  async onLoad(options) {
    const sceneId = options.id;
    if (!sceneId) {
      wx.showToast({ title: t('missingSceneParam') || '缺少场景参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    // 初始化平台设置
    this.setData({
      sceneId,
      showRecharge: canShowRecharge(),
      isIOSPlatform: isIOS()
    });

    // 直接加载场景配置，登录检查移到生成时触发
    await this.loadSceneConfig(sceneId);
    this.loadHistory();
    this.loadUserPoints();
  },

  onUnload() {
    // 页面卸载时确保启用TabBar
    this.notifyTabBarDisabled(false);
    
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
    // 清除待生成标记
    this._pendingGenerate = false;
  },

  // 登录成功
  async onLoginSuccess(e) {
    const userData = e?.detail || {};
    this.setData({ showLoginModal: false });

    // 先刷新用户积分
    await this.loadUserPoints();

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
        id: opt.id || '',                    // 后端统一使用 id
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

      // 优先使用预加载缓存的场景配置
      const currentLang = getCurrentLang();
      let sceneConfig = preloader.getCachedSceneDetail(sceneId, currentLang);

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
          // 性别选择 - 固定选项
          stepOptions[key] = [
            { id: 'male', name: currentLang === 'en' ? 'Male' : '男' },
            { id: 'female', name: currentLang === 'en' ? 'Female' : '女' }
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

      this.setData({
        configLoading: false,
        sceneConfig,
        steps: visibleSteps,
        pointsPerPhoto,
        totalPoints: pointsPerPhoto * this.data.generateCount,
        selections,
        stepOptions
      });

    } catch (error) {
      // 静默处理
      this.setData({ configLoading: false });
      wx.showToast({ title: t('configLoadFailed') || '配置加载失败', icon: 'none' });
    }
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

  // 输出当前完整 Prompt（调试用）
  logCurrentPrompt() {
    const prompt = this.buildPrompt();
  },

  // 选择图片（登录检查移到生成时触发）
  chooseImage() {
    const remainCount = 3 - this.data.uploadedImages.length;
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
      this.setData({
        uploadedImages: [...this.data.uploadedImages, ...safeImages]
      });
    }
  },

  // 删除图片
  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.uploadedImages];
    images.splice(index, 1);
    this.setData({ uploadedImages: images });
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

  // 显示支付弹窗
  showPaymentModal() {
    if (this.data.uploadedImages.length === 0) {
      wx.showToast({ title: t('fp_pleaseUpload') || '请先上传照片', icon: 'none' });
      return;
    }

    const userId = wx.getStorageSync('userId');
    if (!userId) {
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
      const selected = options.find(o => o.id === selectedId);

      if (key === 'gender') {
        variables[key] = selectedId === 'male' ? (t('fp_male') || '男性') : (t('fp_female') || '女性');
      } else if (typeof selectedId === 'number') {
        // 滑块值
        variables[key] = selectedId;
      } else {
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
    if (this.data.uploadedImages.length === 0) {
      wx.showToast({ title: t('fp_pleaseUpload') || '请先上传照片', icon: 'none' });
      return;
    }

    const { generateCount, totalPoints, sceneConfig } = this.data;
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
    const { sceneConfig, selections, uploadedImages, stepOptions, steps } = this.data;
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
    const generatingCount = historyList.filter(i => i.status === 'generating').length;
    this.setData({ historyList, generatingCount });
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

    const generatingCount = history.filter(i => i.status === 'generating').length;
    this.setData({ historyList: history, generatingCount });

    const app = getApp();
    if (app && app.emit) app.emit('historyUpdated');
  },

  // 加载历史
  loadHistory() {
    try {
      const history = wx.getStorageSync(HISTORY_KEY) || [];
      const generatingCount = history.filter(item => item.status === 'generating').length;
      this.setData({ historyList: history, generatingCount });
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
      this.showCompletedStatus();
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
    const parts = [{ text: prompt }];
    const imagesToUse = this.data.uploadedImages.slice(0, 3);

    if (imagesToUse.length === 0) {
      throw new Error(t('noAvailableImage') || '没有可用的图片');
    }

    for (const img of imagesToUse) {
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
        parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64Data } });
      } catch (err) {
        // 静默处理
      }
    }

    if (parts.length < 2) {
      throw new Error(t('cannotReadImage') || '无法读取图片');
    }

    const imagePartIndex = parts.findIndex(p => p.inline_data);
    const imagePart = imagePartIndex >= 0 ? parts[imagePartIndex] : null;
    const imageBase64 = imagePart ? imagePart.inline_data.data : null;
    const mimeType = imagePart ? imagePart.inline_data.mime_type : 'image/jpeg';

    // 调试日志：输出发送给AI的完整信息
    console.log('========== AI生图请求调试 ==========');
    console.log('[AI请求] 完整Prompt:');
    console.log(prompt);
    console.log('[AI请求] 图片类型:', mimeType);
    console.log('[AI请求] 图片大小:', imageBase64 ? Math.round(imageBase64.length / 1024) + 'KB' : '无图片');
    console.log('====================================');

    return aiService.generateImage(prompt, imageBase64, mimeType);
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

  // 显示完成状态
  showCompletedStatus() {
    this.setData({ showCompleted: true, generatingCount: 0 });
    setTimeout(() => this.setData({ showCompleted: false }), 3000);
  },

  // 跳转历史
  goToHistory() {
    wx.switchTab({ url: '/pages/history/history' });
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