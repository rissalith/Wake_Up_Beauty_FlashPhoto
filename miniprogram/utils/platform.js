/**
 * 平台判断工具函数
 * 用于区分 iOS / Android 平台，控制功能展示
 */

// 缓存系统信息
let _systemInfo = null;

/**
 * 获取系统信息（带缓存）
 */
function getSystemInfo() {
  if (!_systemInfo) {
    _systemInfo = wx.getSystemInfoSync();
  }
  return _systemInfo;
}

/**
 * 判断是否为 iOS 平台
 * @returns {boolean}
 */
function isIOS() {
  const systemInfo = getSystemInfo();
  return systemInfo.platform === 'ios';
}

/**
 * 判断是否为 Android 平台
 * @returns {boolean}
 */
function isAndroid() {
  const systemInfo = getSystemInfo();
  return systemInfo.platform === 'android';
}

/**
 * 判断是否为开发者工具
 * @returns {boolean}
 */
function isDevtools() {
  const systemInfo = getSystemInfo();
  // Windows/Mac 上运行的小程序开发工具
  const platform = systemInfo.platform || '';
  return platform === 'devtools' || platform === 'windows' || platform === 'mac';
}

/**
 * 判断是否可以显示充值入口
 * iOS 使用虚拟支付，Android 使用标准支付
 * 两者都可以显示充值入口
 * @returns {boolean}
 */
function canShowRecharge() {
  // 所有平台都显示充值入口
  // iOS 走虚拟支付，Android 走标准微信支付
  return true;
}

/**
 * 判断是否应使用虚拟支付
 * iOS 必须使用虚拟支付
 * Android 使用标准微信支付
 * 开发者工具走标准微信支付流程
 * @returns {boolean}
 */
function shouldUseVirtualPayment() {
  // 开发者工具走标准微信支付流程（需要配置商户号）
  // 只有 iOS 真机才使用虚拟支付
  if (isDevtools()) {
    return false;  // 开发工具走标准微信支付
  }
  // iOS 使用虚拟支付
  return isIOS();
}

/**
 * 获取支付方式
 * @returns {'virtual' | 'normal'}
 */
function getPaymentMethod() {
  return shouldUseVirtualPayment() ? 'virtual' : 'normal';
}

/**
 * 获取当前平台名称
 * @returns {string} 'ios' | 'android' | 'devtools' | 'unknown'
 */
function getPlatform() {
  const systemInfo = getSystemInfo();
  return systemInfo.platform || 'unknown';
}

/**
 * 获取平台相关提示信息
 * @returns {object}
 */
function getPlatformTips() {
  if (isIOS()) {
    return {
      rechargeDisabled: false,  // iOS 现在支持虚拟支付，不再禁用
      rechargeTip: '',
      rechargeTipEn: '',
      freeWays: []
    };
  }
  return {
    rechargeDisabled: false,
    rechargeTip: '',
    freeWays: []
  };
}

module.exports = {
  getSystemInfo,
  isIOS,
  isAndroid,
  isDevtools,
  canShowRecharge,
  shouldUseVirtualPayment,
  getPaymentMethod,
  getPlatform,
  getPlatformTips
};
