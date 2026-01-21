/**
 * 中台配置管理器
 * 负责从服务器获取配置、本地缓存、版本控制、降级处理
 */

const { api } = require('../config/api');
const logger = require('./logger');

const CACHE_KEY = 'midplatform_config';
const VERSION_KEY = 'midplatform_version';
const LAST_REFRESH_KEY = 'midplatform_last_refresh';
const CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存
const REFRESH_THROTTLE = 5 * 60 * 1000; // 5分钟刷新节流

class ConfigManager {
  constructor() {
    this.config = null;
    this.loading = false;
    this.loadPromise = null;
    this._backgroundCheckTimer = null;
  }

  /**
   * 初始化配置
   * @returns {Promise<Object>} 配置数据
   */
  async init() {
    // 如果已经在加载中，返回现有的Promise
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // 如果已经有配置，直接返回
    if (this.config) {
      // 后台静默检查更新
      this.checkUpdateInBackground();
      return this.config;
    }

    this.loadPromise = this._loadConfig();
    return this.loadPromise;
  }

  /**
   * 加载配置的核心逻辑
   * @param {boolean} skipCache 是否跳过缓存
   */
  async _loadConfig(skipCache = false) {
    try {
      // 1. 先尝试从缓存加载（除非明确跳过）
      if (!skipCache) {
        const cached = this._getCache();
        if (cached && !this._isExpired(cached)) {
          this.config = cached.data;
          // 后台静默检查更新
          this.checkUpdateInBackground();
          return this.config;
        }
      }

      // 2. 从服务器获取
      const remoteConfig = await this._fetchRemoteConfig();

      if (remoteConfig) {
        this._setCache(remoteConfig);
        this.config = remoteConfig;
        return this.config;
      }

      // 3. 服务器获取失败，使用过期缓存
      const cached = this._getCache();
      if (cached) {
        this.config = cached.data;
        return this.config;
      }

      // 4. 服务器获取失败且无缓存，返回空配置
      this.config = { version: 0, system: {}, scenes: [] };
      return this.config;

    } catch (error) {
      this.config = { version: 0, system: {}, scenes: [] };
      return this.config;
    } finally {
      this.loadPromise = null;
    }
  }

  /**
   * 后台静默检查更新
   */
  async checkUpdateInBackground() {
    try {
      const localVersion = wx.getStorageSync(VERSION_KEY) || 0;
      const res = await api.getConfigVersion();

      if (res.code === 200 && res.data.version > localVersion) {
        // 后台更新配置
        const remoteConfig = await this._fetchRemoteConfig();
        if (remoteConfig) {
          this._setCache(remoteConfig);
          this.config = remoteConfig;
          // 触发全局事件通知页面更新
          const app = getApp();
          if (app && app.globalData) {
            app.globalData.configUpdated = true;
          }
        }
      }
    } catch (error) {
      // 静默失败，不影响用户
    }
  }

  /**
   * 强制刷新配置
   */
  async refresh() {
    this._clearCache();
    this.config = null;
    this.loadPromise = null;
    wx.setStorageSync(LAST_REFRESH_KEY, Date.now());
    return this._loadConfig();
  }

  /**
   * 节流刷新配置（防止频繁刷新）
   * @param {boolean} force - 是否强制刷新（忽略节流）
   * @returns {Promise<Object|null>} 配置数据，如果被节流则返回null
   */
  async throttledRefresh(force = false) {
    const lastRefresh = wx.getStorageSync(LAST_REFRESH_KEY) || 0;
    const now = Date.now();

    // 如果未超过节流时间且非强制刷新，跳过
    if (!force && (now - lastRefresh < REFRESH_THROTTLE)) {
      return this.config;
    }

    return this.refresh();
  }

  /**
   * 获取场景列表
   * @param {boolean} reviewMode 是否审核模式
   */
  getScenes(reviewMode = false) {
    if (!this.config || !this.config.scenes) {
      return [];
    }

    let scenes = this.config.scenes;

    // 审核模式过滤
    if (reviewMode || this.config.system?.review_mode) {
      scenes = scenes.filter(s => s.is_review_safe);
    }

    return scenes;
  }

  /**
   * 获取上线中的场景
   */
  getActiveScenes() {
    const scenes = this.getScenes();
    return scenes.filter(s => s.status === 'active');
  }

  /**
   * 获取即将上线的场景
   */
  getComingSoonScenes() {
    const scenes = this.getScenes();
    return scenes.filter(s => s.status === 'coming_soon');
  }

  /**
   * 获取系统配置
   */
  getSystemConfig() {
    return this.config?.system || {
      review_mode: false,
      maintenance_mode: false,
      announcement: '',
      announcement_visible: false
    };
  }

  /**
   * 获取场景定价
   * @param {string} sceneId - 场景ID或scene_key
   */
  getScenePrice(sceneId) {
    const scene = this.config?.scenes?.find(s => s.id === sceneId || s.scene_key === sceneId);
    return scene?.price || this.config?.system?.default_scene_price || 50;
  }

  /**
   * 根据ID或key获取场景基本信息（不含steps）
   * @param {string} sceneId - 场景ID或scene_key
   */
  getSceneById(sceneId) {
    // 兼容字符串和数字类型的 id 匹配
    return this.config?.scenes?.find(s => 
      String(s.id) === String(sceneId) || 
      s.scene_key === sceneId
    );
  }

  /**
   * 获取场景完整配置（包含steps和prompt）
   * @param {string} sceneId - 场景ID
   * @param {string} langCode - 语言代码（可选，默认使用当前语言）
   * @returns {Promise<Object>} 场景完整配置
   */
  async getSceneDetail(sceneId, langCode = null) {
    try {
      const lang = langCode || wx.getStorageSync('language') || 'zh-CN';
      const res = await api.getSceneConfig(sceneId, lang);

      // API 返回格式: { code: 200, data: { scene: {...}, steps: [...], prompt: {...} } }
      if (res.code === 200 && res.data) {
        const { scene, steps, prompt } = res.data;

        if (scene) {
          // 合并场景基本信息和详情
          return {
            ...scene,
            steps: steps || [],
            prompt: prompt || {},
            promptTemplate: prompt?.template || ''
          };
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 是否处于维护模式
   */
  isMaintenanceMode() {
    return this.config?.system?.maintenance_mode === true;
  }

  /**
   * 是否处于审核模式
   */
  isReviewMode() {
    return this.config?.system?.review_mode === true;
  }

  /**
   * 获取公告
   * @returns {string|null} 公告内容，未启用则返回null
   */
  getAnnouncement() {
    const system = this.getSystemConfig();
    if (system.announcement_enabled && system.announcement_text) {
      return system.announcement_text;
    }
    return null;
  }

  // ============================================
  // 私有方法
  // ============================================

  /**
   * 从服务器获取配置
   */
  async _fetchRemoteConfig() {
    try {
      const lang = wx.getStorageSync('language') || 'zh-CN';
      const res = await api.getConfig(lang);

      if (res.code === 200 && res.data) {
        return res.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 获取本地缓存
   */
  _getCache() {
    try {
      const cached = wx.getStorageSync(CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 设置本地缓存
   */
  _setCache(data) {
    try {
      const cacheData = {
        data: data,
        version: data.version,
        timestamp: Date.now()
      };
      wx.setStorageSync(CACHE_KEY, JSON.stringify(cacheData));
      wx.setStorageSync(VERSION_KEY, data.version);
    } catch (error) {
      // 静默处理
    }
  }

  /**
   * 清除缓存
   */
  _clearCache() {
    try {
      wx.removeStorageSync(CACHE_KEY);
      wx.removeStorageSync(VERSION_KEY);
    } catch (error) {
      // 静默处理
    }
  }

  /**
   * 检查缓存是否过期
   */
  _isExpired(cached) {
    if (!cached || !cached.timestamp) return true;
    return Date.now() - cached.timestamp > CACHE_DURATION;
  }

  /**
   * 强制刷新配置（清除缓存并重新加载）
   * 用于开发调试时立即获取最新配置
   */
  async forceRefresh() {
    this._clearCache();
    this.config = null;
    this.loadPromise = null;
    return this.init();
  }

}

// 单例模式
const configManager = new ConfigManager();

module.exports = configManager;