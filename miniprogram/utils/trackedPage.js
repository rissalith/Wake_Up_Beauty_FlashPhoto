/**
 * 带自动追踪的页面基类
 * 自动追踪页面访问和停留时长
 *
 * 使用方式:
 * const TrackedPage = require('../../utils/trackedPage');
 *
 * TrackedPage({
 *   pageName: '首页',  // 可选，页面名称
 *   data: { ... },
 *   onLoad(options) { ... },
 *   // 其他页面方法
 * });
 */

const tracker = require('./tracker');

/**
 * 创建带追踪功能的页面
 * @param {object} pageConfig - 原始页面配置
 * @returns {object} 增强后的页面配置
 */
function TrackedPage(pageConfig) {
  const originalOnLoad = pageConfig.onLoad;
  const originalOnShow = pageConfig.onShow;
  const originalOnHide = pageConfig.onHide;
  const originalOnUnload = pageConfig.onUnload;

  const enhancedConfig = {
    ...pageConfig,

    // 页面进入时间
    _pageEnterTime: 0,

    onLoad(options) {
      // 记录进入时间
      this._pageEnterTime = Date.now();

      // 追踪页面访问
      const pagePath = '/' + this.route;
      const pageName = pageConfig.pageName || '';
      tracker.trackPageView(pagePath, options, pageName);

      // 调用原始 onLoad
      if (originalOnLoad) {
        originalOnLoad.call(this, options);
      }
    },

    onShow() {
      // 如果是从后台恢复，重新记录进入时间
      if (!this._pageEnterTime) {
        this._pageEnterTime = Date.now();
      }

      if (originalOnShow) {
        originalOnShow.call(this);
      }
    },

    onHide() {
      // 计算停留时长
      if (this._pageEnterTime) {
        const duration = Date.now() - this._pageEnterTime;
        const pagePath = '/' + this.route;
        tracker.trackPageLeave(pagePath, duration);
        this._pageEnterTime = 0;
      }

      if (originalOnHide) {
        originalOnHide.call(this);
      }
    },

    onUnload() {
      // 页面卸载时也记录停留时长
      if (this._pageEnterTime) {
        const duration = Date.now() - this._pageEnterTime;
        const pagePath = '/' + this.route;
        tracker.trackPageLeave(pagePath, duration);
        this._pageEnterTime = 0;
      }

      if (originalOnUnload) {
        originalOnUnload.call(this);
      }
    },

    // 便捷方法：追踪点击
    trackClick(elementId, elementType, elementText, extra) {
      tracker.trackClick(elementId, elementType, elementText, extra);
    },

    // 便捷方法：追踪事件
    trackEvent(eventName, eventData) {
      tracker.trackEvent(eventName, eventData);
    }
  };

  // 调用 Page 函数注册页面
  Page(enhancedConfig);
}

module.exports = TrackedPage;
