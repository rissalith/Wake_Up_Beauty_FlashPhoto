// API 配置文件
const logger = require('../utils/logger');

// 服务器地址
// 开发环境建议指向本地：http://localhost:3000/api
// 体验版和正式版必须使用 HTTPS
// const API_BASE = 'http://localhost:3000/api';
const API_BASE = 'https://pop-pub.com/api';

// 是否为测试模式 - 正式环境必须设为 false
const IS_TEST_MODE = false;

// 测试模式下的配置（仅在 IS_TEST_MODE = true 时生效）
const TEST_CONFIG = {
  // 跳过真实支付，直接模拟成功
  skipPayment: false,
  // 测试用的openid前缀
  openidPrefix: 'test_',
  // 生成图片时跳过真实AI调用，使用模拟数据
  skipAIGenerate: false
};

// API 请求封装
const API_VERSION = 'V1.0.2_' + Math.random().toString(36).substring(7);

// 延迟函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 判断是否可重试的错误
const isRetryableError = (error) => {
  if (!error) return false;
  const message = (error.msg || error.message || error.errMsg || '').toLowerCase();
  const statusCode = error.statusCode;
  
  // 网络错误、超时、服务器错误可重试
  return message.includes('network') || 
         message.includes('timeout') || 
         message.includes('网络') ||
         message.includes('超时') ||
         statusCode === 502 || 
         statusCode === 503 || 
         statusCode === 504;
};

// 基础请求函数
function baseRequest(options) {
  const fullUrl = API_BASE + options.url;
  const requestId = Date.now().toString(36);

  logger.log(`[API ${requestId}] 发起请求:`, fullUrl);

  return new Promise((resolve, reject) => {
    wx.request({
      url: fullUrl,
      method: options.method || 'GET',
      data: options.data,
      timeout: options.timeout || 15000,
      header: {
        'Content-Type': 'application/json',
        ...options.header
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // 兼容 code: 0 和 code: 200 两种成功状态
          if (res.data.code === 0 || res.data.code === 200 || (typeof res.data === 'object' && !res.data.code)) {
            resolve(res.data);
          } else {
            reject(res.data);
          }
        } else {
          reject({ code: -1, msg: '请求失败', statusCode: res.statusCode });
        }
      },
      fail: (err) => {
        reject({ code: -1, msg: '网络错误', error: err });
      }
    });
  });
}

/**
 * 带重试机制的请求函数
 * @param {Object} options - 请求选项
 * @param {number} maxRetries - 最大重试次数，默认3
 * @param {number} retryDelay - 重试延迟基数(ms)，默认1000
 */
async function request(options, maxRetries = 3, retryDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await baseRequest(options);
    } catch (error) {
      lastError = error;
      
      // 如果不是可重试的错误，或已是最后一次尝试，直接抛出
      if (!isRetryableError(error) || attempt === maxRetries - 1) {
        throw error;
      }
      
      // 递增延迟重试
      const waitTime = retryDelay * (attempt + 1);
      await delay(waitTime);
    }
  }
  
  throw lastError;
}

/**
 * 不带重试的请求（用于特殊场景）
 */
function requestNoRetry(options) {
  return baseRequest(options);
}

// API 接口封装
const api = {
  // ========== 用户相关 ==========
  // 微信登录（用code换取openid）- 不重试，快速失败
  wxLogin(data) {
    return requestNoRetry({
      url: '/user/wx-login',
      method: 'POST',
      data,
      timeout: 10000
    });
  },

  // 用户登录/注册 - 不重试，快速失败
  login(data) {
    return requestNoRetry({
      url: '/user/login',
      method: 'POST',
      data,
      timeout: 10000
    });
  },

  // 获取用户信息
  getUserInfo(userId) {
    return request({
      url: `/user/${userId}`
    });
  },

  // 获取用户统计数据
  getUserStats(userId) {
    return request({
      url: `/user/stats/${userId}`
    });
  },

  // 更新用户信息
  updateUserInfo(userId, data) {
    return request({
      url: `/user/${userId}`,
      method: 'PUT',
      data: {
        nickname: data.nickname || null,
        avatarUrl: data.avatarUrl || null
      }
    });
  },

  // ========== 醒币相关 ==========
  // 获取醒币余额
  getPointsBalance(userId) {
    return request({
      url: `/points/balance/${userId}`
    });
  },

  // 消费醒币
  consumePoints(data) {
    return request({
      url: '/points/consume',
      method: 'POST',
      data
    });
  },

  // 充值醒币
  rechargePoints(data) {
    return request({
      url: '/points/recharge',
      method: 'POST',
      data
    });
  },

  // 模拟支付成功（测试模式）
  mockPay(data) {
    return request({
      url: '/recharge/mock-pay',
      method: 'POST',
      data
    });
  },

  // 退还醒币
  refundPoints(data) {
    return request({
      url: '/points/refund',
      method: 'POST',
      data
    });
  },

  // 获取醒币记录
  getPointsRecords(userId, page = 1, pageSize = 20) {
    return request({
      url: `/points/records/${userId}?page=${page}&pageSize=${pageSize}`
    });
  },

  // 迁移本地消费记录到数据库
  migrateLocalOrders(userId, orders) {
    return request({
      url: '/points/migrate-local-orders',
      method: 'POST',
      data: { userId, orders }
    });
  },

  // 发放醒币奖励（分享、邀请等）
  grantPoints(userId, type, relatedId = null) {
    return request({
      url: '/points/grant',
      method: 'POST',
      data: { userId, type, relatedId }
    });
  },

  // ========== 协议相关 ==========
  // 记录协议签署 - 不重试，快速失败
  signAgreement(userId, agreementType) {
    return requestNoRetry({
      url: '/user/sign-agreement',
      method: 'POST',
      data: {
        userId,
        agreementType: agreementType || 'all'
      },
      timeout: 10000
    });
  },

  // ========== 邀请相关 ==========
  // 获取邀请统计
  getInviteStats(userId) {
    return request({
      url: `/invite/stats/${userId}`
    });
  },

  // 获取邀请记录
  getInviteRecords(userId) {
    return request({
      url: `/invite/records/${userId}`
    });
  },

  // ========== 照片相关 ==========
  // 创建照片任务
  createPhoto(data) {
    return request({
      url: '/photo/create',
      method: 'POST',
      data
    });
  },

  // 更新照片状态
  updatePhoto(photoId, data) {
    return request({
      url: `/photo/${photoId}`,
      method: 'PUT',
      data
    });
  },

  // 获取照片历史（从服务器恢复）
  getPhotoHistory(userId, options = {}) {
    const { status, page = 1, pageSize = 100 } = options;
    let url = `/photo/history/${userId}?page=${page}&pageSize=${pageSize}`;
    if (status) {
      url += `&status=${status}`;
    }
    return request({ url });
  },

  // 删除照片
  deletePhoto(photoId) {
    return request({
      url: `/photo/${photoId}`,
      method: 'DELETE'
    });
  },

  // 批量删除照片
  batchDeletePhotos(photoIds) {
    return request({
      url: '/photo/batch-delete',
      method: 'POST',
      data: { photoIds }
    });
  },

  // 同步照片到服务器（照片生成完成后调用）
  syncPhoto(data) {
    return request({
      url: '/sync/photo',
      method: 'POST',
      data
    });
  },

  // 同步用户信息到后台管理系统
  syncUser(data) {
    return request({
      url: '/sync/user',
      method: 'POST',
      data
    });
  },

  // ========== 健康检查 ==========
  healthCheck() {
    return request({
      url: '/health'
    });
  },

  // ========== 图片上传 ==========
  // 上传图片到COS（Base64方式）
  uploadImage(data) {
    return request({
      url: '/upload/image',
      method: 'POST',
      data
    });
  },

  // 获取COS上传凭证
  getCosCredentials(userId, type = 'feedback') {
    return request({
      url: `/upload/cos-credentials?userId=${userId}&type=${type}`
    });
  },

  // ========== 反馈相关 ==========
  // 提交反馈
  submitFeedback(data) {
    return request({
      url: '/feedback/submit',
      method: 'POST',
      data
    });
  },

  // 获取用户反馈列表
  getUserFeedbacks(userId) {
    return request({
      url: `/feedback/user/${userId}`
    });
  },

  // 更新反馈
  updateFeedback(feedbackId, data) {
    return request({
      url: `/feedback/${feedbackId}`,
      method: 'PUT',
      data
    });
  },

  // 删除反馈
  deleteFeedback(feedbackId) {
    return request({
      url: `/feedback/${feedbackId}`,
      method: 'DELETE'
    });
  },

  // ========== 账户管理 ==========
  // 注销账户
  deleteAccount(data) {
    return request({
      url: '/user/delete-account',
      method: 'POST',
      data
    });
  },

  // ========== 支付相关 ==========
  // 创建支付订单（获取微信支付参数）
  createPayOrder(data) {
    return request({
      url: '/pay/create-order',
      method: 'POST',
      data
    });
  },

  // 查询订单状态
  queryOrderStatus(orderId) {
    return request({
      url: `/pay/order/${orderId}`
    });
  },

  // 获取充值套餐列表
  getRechargePackages() {
    return request({
      url: '/pay/packages'
    });
  },

  // ========== 虚拟支付相关 ==========
  // 创建虚拟支付订单
  createVirtualPayOrder(data) {
    return request({
      url: '/virtual-pay/create-order',
      method: 'POST',
      data
    });
  },

  // 查询虚拟支付订单状态
  queryVirtualPayOrder(orderId) {
    return request({
      url: `/virtual-pay/order/${orderId}`
    });
  },

  // 查询微信代币余额
  queryWxCoinBalance(openid) {
    return request({
      url: '/virtual-pay/coin-balance',
      data: { openid }
    });
  },

  // 主动发货（支付成功后调用）
  deliverVirtualPayOrder(orderId) {
    return request({
      url: `/virtual-pay/deliver/${orderId}`,
      method: 'POST'
    });
  },

  // 取消订单（支付失败或用户取消时调用）
  cancelVirtualPayOrder(orderId, reason) {
    return request({
      url: `/virtual-pay/cancel/${orderId}`,
      method: 'POST',
      data: { reason }
    });
  },

  // ========== 中台配置相关 ==========
  // 获取配置版本号
  getConfigVersion() {
    return request({
      url: '/config/version'
    });
  },

  // 获取完整初始化配置
  getConfig(lang = 'zh-CN') {
    return request({
      url: '/config/init',
      data: { lang }
    });
  },

  // 获取场景列表
  getScenes(reviewMode = false) {
    return request({
      url: '/config/scenes',
      data: { review_mode: reviewMode }
    });
  },

  // 获取单个场景完整配置
  getSceneConfig(sceneId, lang = 'zh-CN') {
    return request({
      url: `/config/scene/${sceneId}`,
      data: { lang }
    });
  },

  // 获取系统配置
  getSystemConfig() {
    return request({
      url: '/config/system'
    });
  }
};

module.exports = {
  API_BASE,
  IS_TEST_MODE,
  TEST_CONFIG,
  request,
  requestNoRetry,
  api
};