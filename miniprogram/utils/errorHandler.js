/**
 * 统一错误处理工具
 * 提供友好的错误提示和日志记录
 */

const lang = require('./lang');

// 错误类型映射
const ERROR_TYPES = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  AUTH: 'auth',
  BALANCE: 'balance',
  IMAGE: 'image',
  SERVER: 'server',
  UNKNOWN: 'unknown'
};

// 根据错误信息判断错误类型
function getErrorType(error) {
  const message = (error.message || error.errMsg || String(error)).toLowerCase();
  
  if (message.includes('timeout') || message.includes('超时')) {
    return ERROR_TYPES.TIMEOUT;
  }
  if (message.includes('network') || message.includes('网络') || message.includes('request:fail')) {
    return ERROR_TYPES.NETWORK;
  }
  if (message.includes('auth') || message.includes('登录') || message.includes('unauthorized')) {
    return ERROR_TYPES.AUTH;
  }
  if (message.includes('balance') || message.includes('余额') || message.includes('醒币不足')) {
    return ERROR_TYPES.BALANCE;
  }
  if (message.includes('image') || message.includes('图片') || message.includes('photo')) {
    return ERROR_TYPES.IMAGE;
  }
  if (message.includes('server') || message.includes('服务') || message.includes('500')) {
    return ERROR_TYPES.SERVER;
  }
  return ERROR_TYPES.UNKNOWN;
}

// 获取用户友好的错误提示
function getUserFriendlyMessage(error) {
  const type = getErrorType(error);
  const t = lang.t.bind(lang);
  
  const messages = {
    [ERROR_TYPES.NETWORK]: t('error_network') || '网络连接失败，请检查网络设置',
    [ERROR_TYPES.TIMEOUT]: t('error_timeout') || '请求超时，请稍后重试',
    [ERROR_TYPES.AUTH]: t('error_auth') || '登录状态已过期，请重新登录',
    [ERROR_TYPES.BALANCE]: t('error_balance') || '醒币余额不足，请先充值',
    [ERROR_TYPES.IMAGE]: t('error_image') || '图片处理失败，请重新上传',
    [ERROR_TYPES.SERVER]: t('error_server') || '服务器繁忙，请稍后重试',
    [ERROR_TYPES.UNKNOWN]: t('error_unknown') || '操作失败，请稍后重试'
  };
  
  return messages[type] || messages[ERROR_TYPES.UNKNOWN];
}

// 获取错误解决建议
function getErrorSuggestion(error) {
  const type = getErrorType(error);
  const t = lang.t.bind(lang);
  
  const suggestions = {
    [ERROR_TYPES.NETWORK]: t('suggestion_network') || '请检查WiFi或移动网络是否正常',
    [ERROR_TYPES.TIMEOUT]: t('suggestion_timeout') || '网络繁忙，建议稍后重试或切换网络',
    [ERROR_TYPES.AUTH]: t('suggestion_auth') || '请返回首页重新登录',
    [ERROR_TYPES.BALANCE]: t('suggestion_balance') || '前往充值页面获取更多醒币',
    [ERROR_TYPES.IMAGE]: t('suggestion_image') || '请上传清晰的正面照片',
    [ERROR_TYPES.SERVER]: t('suggestion_server') || '服务正在维护中，请稍后重试',
    [ERROR_TYPES.UNKNOWN]: t('suggestion_unknown') || '如问题持续，请联系客服'
  };
  
  return suggestions[type] || suggestions[ERROR_TYPES.UNKNOWN];
}

// 是否可重试的错误
function isRetryableError(error) {
  const type = getErrorType(error);
  return [ERROR_TYPES.NETWORK, ERROR_TYPES.TIMEOUT, ERROR_TYPES.SERVER].includes(type);
}

// 是否是系统错误（用户无责，可免费重试）
function isSystemError(error) {
  const type = getErrorType(error);
  return [ERROR_TYPES.NETWORK, ERROR_TYPES.TIMEOUT, ERROR_TYPES.SERVER].includes(type);
}

/**
 * 统一错误处理
 * @param {Error|string} error - 错误对象或错误信息
 * @param {string} context - 错误发生的上下文（用于日志）
 * @param {Object} options - 配置选项
 * @param {boolean} options.showToast - 是否显示Toast提示，默认true
 * @param {boolean} options.showModal - 是否显示Modal弹窗，默认false
 * @param {boolean} options.showSuggestion - 是否显示解决建议，默认false
 * @param {Function} options.onRetry - 重试回调函数
 */
function handleError(error, context = '', options = {}) {
  const {
    showToast = true,
    showModal = false,
    showSuggestion = false,
    onRetry = null
  } = options;
  
  // 1. 记录日志
  console.error(`[ErrorHandler][${context}]`, error);
  
  // 2. 获取用户友好的提示信息
  const message = getUserFriendlyMessage(error);
  const suggestion = showSuggestion ? getErrorSuggestion(error) : '';
  
  // 3. 显示提示
  if (showModal) {
    const modalOptions = {
      title: '操作失败',
      content: suggestion ? `${message}\n\n${suggestion}` : message,
      showCancel: isRetryableError(error) && onRetry,
      confirmText: '确定',
      cancelText: '重试'
    };
    
    if (onRetry && isRetryableError(error)) {
      modalOptions.success = (res) => {
        if (res.cancel) {
          onRetry();
        }
      };
    }
    
    wx.showModal(modalOptions);
  } else if (showToast) {
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 2500
    });
  }
  
  // 4. 返回错误信息供调用方使用
  return {
    type: getErrorType(error),
    message,
    suggestion,
    isRetryable: isRetryableError(error),
    isSystemError: isSystemError(error),
    originalError: error
  };
}

/**
 * 包装异步函数，自动处理错误
 * @param {Function} fn - 异步函数
 * @param {string} context - 上下文名称
 * @param {Object} options - 错误处理选项
 */
function withErrorHandler(fn, context = '', options = {}) {
  return async function (...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      handleError(error, context, options);
      throw error;
    }
  };
}

/**
 * 安全执行函数（不抛出异常）
 * @param {Function} fn - 要执行的函数
 * @param {*} defaultValue - 出错时的默认返回值
 * @param {string} context - 上下文名称
 */
async function safeExecute(fn, defaultValue = null, context = '') {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[SafeExecute][${context}]`, error);
    return defaultValue;
  }
}

module.exports = {
  ERROR_TYPES,
  getErrorType,
  getUserFriendlyMessage,
  getErrorSuggestion,
  isRetryableError,
  isSystemError,
  handleError,
  withErrorHandler,
  safeExecute
};
