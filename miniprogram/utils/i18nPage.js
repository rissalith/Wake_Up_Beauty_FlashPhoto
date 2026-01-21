/**
 * 全局国际化 Page 封装
 * 使用方式：用 I18nPage 代替 Page
 *
 * 示例：
 * const { I18nPage } = require('../../utils/i18nPage');
 * I18nPage({
 *   data: { ... },
 *   onLoad() { ... }
 * });
 */

const { getLangData, t, getCurrentLang } = require('./lang');

/**
 * 封装 Page，自动注入国际化功能
 * @param {Object} options - 原始 Page 配置
 */
function I18nPage(options) {
  // 保存原有的生命周期函数
  const originalOnLoad = options.onLoad;
  const originalOnShow = options.onShow;

  // 合并 data，添加 lang 对象
  options.data = Object.assign({}, options.data, {
    lang: {}
  });

  // 重写 onLoad
  options.onLoad = function(query) {
    // 加载语言包
    this.loadLanguage();
    // 调用原有的 onLoad
    if (originalOnLoad) {
      originalOnLoad.call(this, query);
    }
  };

  // 重写 onShow
  options.onShow = function() {
    // 每次显示时重新加载语言包（处理语言切换的情况）
    this.loadLanguage();
    // 调用原有的 onShow
    if (originalOnShow) {
      originalOnShow.call(this);
    }
  };

  // 添加加载语言包方法
  options.loadLanguage = function() {
    const currentLang = getCurrentLang();
    const langData = getLangData();
    this.setData({ lang: langData });
  };

  // 添加翻译方法（用于 JS 中动态获取翻译）
  options.t = function(key) {
    return t(key);
  };

  // 添加获取当前语言方法
  options.getCurrentLang = function() {
    return getCurrentLang();
  };

  // 调用原始 Page
  Page(options);
}

/**
 * 封装 Component，自动注入国际化功能
 * @param {Object} options - 原始 Component 配置
 */
function I18nComponent(options) {
  // 保存原有的生命周期函数
  const originalAttached = options.lifetimes?.attached || options.attached;
  const originalShow = options.pageLifetimes?.show;

  // 确保 data 存在
  options.data = Object.assign({}, options.data, {
    lang: {}
  });

  // 确保 lifetimes 存在
  options.lifetimes = options.lifetimes || {};

  // 重写 attached
  options.lifetimes.attached = function() {
    this.loadLanguage();
    if (originalAttached) {
      originalAttached.call(this);
    }
  };

  // 确保 pageLifetimes 存在
  options.pageLifetimes = options.pageLifetimes || {};

  // 重写 show
  options.pageLifetimes.show = function() {
    this.loadLanguage();
    if (originalShow) {
      originalShow.call(this);
    }
  };

  // 确保 methods 存在
  options.methods = options.methods || {};

  // 添加加载语言包方法
  options.methods.loadLanguage = function() {
    this.setData({ lang: getLangData() });
  };

  // 添加翻译方法
  options.methods.t = function(key) {
    return t(key);
  };

  // 添加获取当前语言方法
  options.methods.getCurrentLang = function() {
    return getCurrentLang();
  };

  // 调用原始 Component
  Component(options);
}

module.exports = {
  I18nPage,
  I18nComponent
};
