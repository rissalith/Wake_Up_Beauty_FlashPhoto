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
 * 在开发者工具中，通过 system 字段判断模拟的机型
 * @returns {boolean}
 */
function isIOS() {
  const systemInfo = getSystemInfo();
  // 真机直接判断 platform
  if (systemInfo.platform === 'ios') {
    return true;
  }
  // 开发者工具中，通过 system 字段判断模拟的机型
  // system 字段示例: "iOS 15.0" 或 "Android 12"
  if (isDevtools()) {
    const system = (systemInfo.system || '').toLowerCase();
    return system.includes('ios');
  }
  return false;
}

/**
 * 判断是否为 Android 平台
 * @returns {boolean}
 */
function isAndroid() {
  const systemInfo = getSystemInfo();
  if (systemInfo.platform === 'android') {
    return true;
  }
  // 开发者工具中，通过 system 字段判断
  if (isDevtools()) {
    const system = (systemInfo.system || '').toLowerCase();
    return system.includes('android');
  }
  return false;
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
 * iOS 端隐藏充值入口，符合微信审核要求
 * Android 使用标准支付，可以显示
 * @returns {boolean}
 */
function canShowRecharge() {
  // iOS 端隐藏充值入口，符合微信审核要求
  if (isIOS()) {
    return false;
  }
  return true;
}

/**
 * 判断是否应使用虚拟支付
 * iOS 必须使用虚拟支付
 * Android 使用标准微信支付
 * 开发者工具模拟 iOS 时也走虚拟支付逻辑
 * @returns {boolean}
 */
function shouldUseVirtualPayment() {
  // iOS（包括开发者工具模拟 iOS）使用虚拟支付
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
