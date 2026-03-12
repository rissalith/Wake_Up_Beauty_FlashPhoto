// 协议和政策相关的 API 调用

const { api } = require('../config/api');

/**
 * 获取隐私政策内容
 */
async function getPrivacyPolicy() {
  try {
    const res = await api.getSystemConfig();
    return res.data?.privacy_policy || '隐私政策加载中...';
  } catch (error) {
    console.error('[Policy API] 获取隐私政策失败:', error);
    return '隐私政策加载失败，请稍后重试';
  }
}

/**
 * 获取用户协议内容
 */
async function getUserAgreement() {
  try {
    const res = await api.getSystemConfig();
    return res.data?.user_agreement || '用户协议加载中...';
  } catch (error) {
    console.error('[Policy API] 获取用户协议失败:', error);
    return '用户协议加载失败，请稍后重试';
  }
}

/**
 * 记录用户同意协议
 */
async function recordAgreement(type) {
  try {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      console.warn('[Policy API] 未登录，无法记录协议同意');
      return;
    }
    await api.signAgreement(userId, type);
  } catch (error) {
    console.error('[Policy API] 记录协议同意失败:', error);
  }
}

module.exports = {
  getPrivacyPolicy,
  getUserAgreement,
  recordAgreement
};
