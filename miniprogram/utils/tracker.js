/**
 * 用户行为追踪 SDK
 *
 * 功能特性:
 * 1. 自动追踪页面访问 (PV)
 * 2. 手动追踪点击事件
 * 3. 手动追踪功能使用
 * 4. 批量上报 + 节流控制
 * 5. 离线缓存 + 重试机制
 */

const logger = require('./logger');
const { getBeijingISOString } = require('./timeUtil');

// API 地址
const API_BASE = 'https://pop-pub.com/api';

// 配置常量
const CONFIG = {
  // 批量上报阈值
  BATCH_SIZE: 10,
  // 上报间隔 (毫秒)
  REPORT_INTERVAL: 5000,
  // 最大缓存条数
  MAX_CACHE_SIZE: 100,
  // 本地存储 key
  STORAGE_KEY: 'tracker_queue',
  // 是否启用追踪
  ENABLED: true
};

// 行为类型枚举
const BehaviorType = {
  PAGE_VIEW: 'page_view',
  CLICK: 'click',
  EVENT: 'event',
  ERROR: 'error'
};

// 内部状态
let _queue = [];
let _sessionId = null;
let _reportTimer = null;
let _isReporting = false;
let _deviceInfo = null;

/**
 * 初始化追踪器
 * 在 app.js onLaunch 中调用
 */
function init() {
  if (!CONFIG.ENABLED) return;

  // 生成会话ID
  _sessionId = generateSessionId();

  // 获取设备信息
  _deviceInfo = getDeviceInfo();

  // 恢复本地缓存的数据
  restoreFromStorage();

  // 启动定时上报
  startReportTimer();

  // 监听小程序隐藏事件，立即上报
  wx.onAppHide(() => {
    flushQueue();
  });

  logger.log('[Tracker] 初始化完成, sessionId:', _sessionId);
}

/**
 * 生成会话ID
 */
function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * 获取设备信息
 */
function getDeviceInfo() {
  try {
    const deviceInfo = wx.getDeviceInfo();
    const appBaseInfo = wx.getAppBaseInfo();
    return {
      brand: deviceInfo.brand,
      model: deviceInfo.model,
      system: deviceInfo.system,
      platform: deviceInfo.platform,
      language: appBaseInfo.language
    };
  } catch (e) {
    return {};
  }
}

/**
 * 获取网络类型
 */
function getNetworkType() {
  return new Promise((resolve) => {
    wx.getNetworkType({
      success: (res) => resolve(res.networkType),
      fail: () => resolve('unknown')
    });
  });
}

/**
 * 追踪页面访问 (PV)
 * @param {string} pagePath - 页面路径
 * @param {object} query - 页面参数
 * @param {string} pageName - 页面名称 (可选)
 */
async function trackPageView(pagePath, query = {}, pageName = '') {
  if (!CONFIG.ENABLED) return;

  const networkType = await getNetworkType();

  const behavior = {
    behavior_type: BehaviorType.PAGE_VIEW,
    behavior_name: pageName || extractPageName(pagePath),
    page_path: pagePath,
    page_query: JSON.stringify(query),
    network_type: networkType,
    client_time: getBeijingISOString()
  };

  addToQueue(behavior);
}

/**
 * 追踪页面离开 (更新停留时长)
 * @param {string} pagePath - 页面路径
 * @param {number} duration - 停留时长(毫秒)
 */
function trackPageLeave(pagePath, duration) {
  if (!CONFIG.ENABLED) return;

  const behavior = {
    behavior_type: BehaviorType.PAGE_VIEW,
    behavior_name: extractPageName(pagePath) + '_leave',
    page_path: pagePath,
    duration: duration,
    client_time: getBeijingISOString()
  };

  addToQueue(behavior);
}

/**
 * 追踪点击事件
 * @param {string} elementId - 元素ID
 * @param {string} elementType - 元素类型 (button, image, tab, etc.)
 * @param {string} elementText - 元素文本
 * @param {object} extra - 扩展数据
 */
function trackClick(elementId, elementType, elementText = '', extra = {}) {
  if (!CONFIG.ENABLED) return;

  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  const pagePath = currentPage ? '/' + currentPage.route : '';

  const behavior = {
    behavior_type: BehaviorType.CLICK,
    behavior_name: elementId,
    page_path: pagePath,
    element_id: elementId,
    element_type: elementType,
    element_text: elementText,
    extra_data: JSON.stringify(extra),
    client_time: getBeijingISOString()
  };

  addToQueue(behavior);
}

/**
 * 追踪功能事件
 * @param {string} eventName - 事件名称
 * @param {object} eventData - 事件数据
 */
function trackEvent(eventName, eventData = {}) {
  if (!CONFIG.ENABLED) return;

  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  const pagePath = currentPage ? '/' + currentPage.route : '';

  const behavior = {
    behavior_type: BehaviorType.EVENT,
    behavior_name: eventName,
    page_path: pagePath,
    extra_data: JSON.stringify(eventData),
    client_time: getBeijingISOString()
  };

  addToQueue(behavior);
}

/**
 * 追踪错误事件
 * @param {string} errorType - 错误类型
 * @param {string} errorMessage - 错误信息
 * @param {object} extra - 扩展数据
 */
function trackError(errorType, errorMessage, extra = {}) {
  if (!CONFIG.ENABLED) return;

  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  const pagePath = currentPage ? '/' + currentPage.route : '';

  const behavior = {
    behavior_type: BehaviorType.ERROR,
    behavior_name: errorType,
    page_path: pagePath,
    extra_data: JSON.stringify({ message: errorMessage, ...extra }),
    client_time: getBeijingISOString()
  };

  addToQueue(behavior);

  // 错误事件立即上报
  flushQueue();
}

/**
 * 添加到队列
 */
function addToQueue(behavior) {
  const userId = wx.getStorageSync('userId') || '';

  const fullBehavior = {
    ...behavior,
    user_id: userId,
    session_id: _sessionId,
    device_brand: _deviceInfo?.brand || '',
    device_model: _deviceInfo?.model || '',
    system_info: _deviceInfo?.system || ''
  };

  _queue.push(fullBehavior);

  // 超过阈值立即上报
  if (_queue.length >= CONFIG.BATCH_SIZE) {
    flushQueue();
  }

  // 超过最大缓存，丢弃最早的数据
  if (_queue.length > CONFIG.MAX_CACHE_SIZE) {
    _queue = _queue.slice(-CONFIG.MAX_CACHE_SIZE);
  }

  // 保存到本地存储
  saveToStorage();
}

/**
 * 启动定时上报
 */
function startReportTimer() {
  if (_reportTimer) return;

  _reportTimer = setInterval(() => {
    if (_queue.length > 0) {
      flushQueue();
    }
  }, CONFIG.REPORT_INTERVAL);
}

/**
 * 立即上报队列中的数据
 */
async function flushQueue() {
  if (_isReporting || _queue.length === 0) return;

  _isReporting = true;
  const dataToReport = [..._queue];
  _queue = [];

  try {
    await reportBehaviors(dataToReport);
    // 上报成功，清除本地存储
    wx.removeStorageSync(CONFIG.STORAGE_KEY);
    logger.log('[Tracker] 上报成功, 条数:', dataToReport.length);
  } catch (error) {
    // 上报失败，数据放回队列
    _queue = [...dataToReport, ..._queue].slice(-CONFIG.MAX_CACHE_SIZE);
    saveToStorage();
    logger.warn('[Tracker] 上报失败, 已缓存:', error.message || error);
  } finally {
    _isReporting = false;
  }
}

/**
 * 上报行为数据到服务器
 */
function reportBehaviors(behaviors) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + '/behavior/report',
      method: 'POST',
      data: { behaviors },
      timeout: 10000,
      success: (res) => {
        if (res.statusCode === 200 && (res.data.code === 0 || res.data.code === 200)) {
          resolve(res.data);
        } else {
          reject(new Error(res.data?.msg || '上报失败'));
        }
      },
      fail: (err) => {
        reject(new Error(err.errMsg || '网络错误'));
      }
    });
  });
}

/**
 * 保存到本地存储
 */
function saveToStorage() {
  try {
    wx.setStorageSync(CONFIG.STORAGE_KEY, _queue);
  } catch (e) {
    // 存储失败，忽略
  }
}

/**
 * 从本地存储恢复
 */
function restoreFromStorage() {
  try {
    const cached = wx.getStorageSync(CONFIG.STORAGE_KEY);
    if (cached && Array.isArray(cached)) {
      _queue = cached;
      logger.log('[Tracker] 恢复缓存数据, 条数:', cached.length);
    }
  } catch (e) {
    // 恢复失败，忽略
  }
}

/**
 * 从页面路径提取页面名称
 */
function extractPageName(pagePath) {
  if (!pagePath) return 'unknown';
  const parts = pagePath.split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || 'unknown';
}

/**
 * 设置是否启用追踪
 */
function setEnabled(enabled) {
  CONFIG.ENABLED = enabled;
}

/**
 * 获取当前会话ID
 */
function getSessionId() {
  return _sessionId;
}

module.exports = {
  init,
  trackPageView,
  trackPageLeave,
  trackClick,
  trackEvent,
  trackError,
  setEnabled,
  getSessionId,
  flushQueue,
  BehaviorType
};
