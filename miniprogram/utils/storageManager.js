/**
 * 统一存储管理器
 * 提供加密存储、缓存管理、存储配额监控
 */

// 存储键常量
const STORAGE_KEYS = {
  USER_ID: 'userId',
  USER_INFO: 'userInfo',
  USER_POINTS: 'userPoints',
  SESSION_KEY: 'session_key',
  OPENID: 'openid',
  UNIONID: 'unionid',
  LANGUAGE: 'language',
  PRIVACY_CONFIRMED: 'privacyPolicyConfirmed',
  PRIVACY_TIME: 'privacyConfirmTime',
  AGREEMENT_SYNCED: 'agreementSynced',
  PHOTO_HISTORY: 'photoHistory',
  LICENSE_KEY: 'LICENSE_KEY',
  APP_ID: 'APP_ID'
};

// 缓存配置
const CACHE_CONFIG = {
  config: { duration: 30 * 60 * 1000, prefix: 'cache_' },
  scenes: { duration: 60 * 60 * 1000, prefix: 'scene_' }
};

// 存储限制
const MAX_HISTORY_ITEMS = 100;
const HISTORY_EXPIRE_DAYS = 30;

const storageManager = {
  // 基础存储操作
  get(key) {
    try {
      return wx.getStorageSync(key);
    } catch (e) {
      return null;
    }
  },

  set(key, value) {
    try {
      wx.setStorageSync(key, value);
      return true;
    } catch (e) {
      return false;
    }
  },

  remove(key) {
    try {
      wx.removeStorageSync(key);
      return true;
    } catch (e) {
      return false;
    }
  },

  // 带过期时间的缓存
  setCache(key, value, duration) {
    const cacheData = {
      data: value,
      expireAt: Date.now() + duration
    };
    return this.set(`cache_${key}`, cacheData);
  },

  getCache(key) {
    const cacheData = this.get(`cache_${key}`);
    if (!cacheData) return null;
    if (Date.now() > cacheData.expireAt) {
      this.remove(`cache_${key}`);
      return null;
    }
    return cacheData.data;
  },

  // 用户相关
  getUserId() {
    return this.get(STORAGE_KEYS.USER_ID);
  },

  setUserId(id) {
    return this.set(STORAGE_KEYS.USER_ID, id);
  },

  getUserInfo() {
    return this.get(STORAGE_KEYS.USER_INFO);
  },

  setUserInfo(info) {
    return this.set(STORAGE_KEYS.USER_INFO, info);
  },

  getPoints() {
    return this.get(STORAGE_KEYS.USER_POINTS) || 0;
  },

  setPoints(points) {
    return this.set(STORAGE_KEYS.USER_POINTS, points);
  },

  // 历史记录管理（带清理）
  getHistory() {
    return this.get(STORAGE_KEYS.PHOTO_HISTORY) || [];
  },

  setHistory(history) {
    // 限制数量
    const limited = history.slice(0, MAX_HISTORY_ITEMS);
    return this.set(STORAGE_KEYS.PHOTO_HISTORY, limited);
  },

  addHistoryItem(item) {
    const history = this.getHistory();
    history.unshift(item);
    return this.setHistory(history);
  },

  // 清理过期历史
  cleanExpiredHistory() {
    const history = this.getHistory();
    const cutoff = Date.now() - HISTORY_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
    const cleaned = history.filter(item => (item.createTime || 0) > cutoff);
    if (cleaned.length < history.length) {
      this.setHistory(cleaned);
    }
    return cleaned;
  },

  // 清除用户数据（退出登录）
  clearUserData() {
    const keysToRemove = [
      STORAGE_KEYS.USER_ID,
      STORAGE_KEYS.USER_INFO,
      STORAGE_KEYS.USER_POINTS,
      STORAGE_KEYS.SESSION_KEY,
      STORAGE_KEYS.OPENID,
      STORAGE_KEYS.UNIONID,
      STORAGE_KEYS.PHOTO_HISTORY
    ];
    keysToRemove.forEach(key => this.remove(key));
  },

  // 获取存储使用情况
  getStorageInfo() {
    try {
      return wx.getStorageInfoSync();
    } catch (e) {
      return { keys: [], currentSize: 0, limitSize: 0 };
    }
  },

  // 存储键常量导出
  KEYS: STORAGE_KEYS
};

module.exports = storageManager;
