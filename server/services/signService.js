/**
 * 微信虚拟支付签名服务
 * 实现支付签名(pay_sig)和用户态签名(signature)的计算
 */

const crypto = require('crypto');
const virtualPayConfig = require('../config/virtualPay');

/**
 * HMAC-SHA256 签名
 */
function hmacSha256(data, key) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

/**
 * 计算支付签名 (pay_sig)
 * 用于 wx.requestVirtualPayment 的 paySig 参数
 *
 * 签名算法: paySig = to_hex(hmac_sha256(appKey, uri + '&' + signData))
 *
 * @param {string} uri - 请求路径，如 'requestVirtualPayment' 或 '/xpay/query_user_balance'
 * @param {string} postBody - POST 请求体的 JSON 字符串
 * @param {string} appKey - AppKey (可选，默认使用配置)
 * @returns {string} 支付签名
 */
function calculatePaySig(uri, postBody, appKey = virtualPayConfig.appKey) {
  const signData = typeof postBody === 'string' ? postBody : JSON.stringify(postBody);
  const stringToSign = uri + '&' + signData;
  return hmacSha256(stringToSign, appKey);
}

/**
 * 计算用户态签名 (signature)
 * 用于 wx.requestVirtualPayment 的 signature 参数
 *
 * 签名算法: signature = to_hex(hmac_sha256(sessionKey, signData))
 *
 * @param {string} postBody - POST 请求体的 JSON 字符串
 * @param {string} sessionKey - 用户的 session_key
 * @returns {string} 用户态签名
 */
function calculateSignature(postBody, sessionKey) {
  const signData = typeof postBody === 'string' ? postBody : JSON.stringify(postBody);
  return hmacSha256(signData, sessionKey);
}

/**
 * 构建 wx.requestVirtualPayment 的 signData
 * 代币模式(short_series_coin)只需要7个字段，字段顺序必须与签名时一致
 *
 * @param {Object} params - 支付参数
 * @param {string} params.outTradeNo - 业务订单号
 * @param {number} params.buyQuantity - 购买代币数量
 * @param {string} params.attach - 透传参数
 * @param {string} params.platform - 平台 'ios' | 'android'
 * @returns {Object} signData 对象
 */
function buildSignData(params) {
  const {
    outTradeNo,
    buyQuantity,
    attach = '',
    platform = 'ios'
  } = params;

  // 代币模式(short_series_coin)的字段，顺序很重要
  return {
    offerId: virtualPayConfig.offerId,
    buyQuantity: buyQuantity,
    env: virtualPayConfig.env,
    currencyType: 'CNY',
    platform: platform,
    outTradeNo: outTradeNo,
    attach: attach
  };
}

/**
 * 生成虚拟支付订单号
 * @returns {string} 订单号 (格式: VP + 时间戳 + 随机字符)
 */
function generateOrderId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return 'VP' + timestamp + random;
}

/**
 * 为 wx.requestVirtualPayment 生成完整的支付参数
 *
 * @param {Object} options - 选项
 * @param {string} options.orderId - 订单号
 * @param {number} options.amount - 金额(元)
 * @param {number} options.points - 获得的醒币数
 * @param {string} options.userId - 用户ID
 * @param {string} options.sessionKey - 用户 session_key
 * @param {string} options.platform - 平台
 * @returns {Object} 支付参数
 */
function generatePaymentParams(options) {
  const {
    orderId,
    amount,
    points,
    userId,
    sessionKey,
    platform = 'ios'
  } = options;

  // 计算代币数量
  // 代币数量 = 金额(元) * 10 (1元 = 10代币)
  const buyQuantity = amount * 10;

  // 构建透传参数
  const attach = JSON.stringify({
    userId: userId,
    points: points,
    orderId: orderId
  });

  // 构建 signData (代币模式只需7个字段)
  const signData = buildSignData({
    outTradeNo: orderId,
    buyQuantity: buyQuantity,
    attach: attach,
    platform: platform
  });

  // 将 signData 转为 JSON 字符串用于签名
  const signDataStr = JSON.stringify(signData);

  // 计算签名
  const paySig = calculatePaySig('requestVirtualPayment', signDataStr);
  const signature = calculateSignature(signDataStr, sessionKey);

  return {
    signData: signData,
    paySig: paySig,
    signature: signature,
    sigMethod: 'hmac_sha256',
    mode: 'short_series_coin'  // 代币模式
  };
}

/**
 * 验证微信回调签名 (简化版，生产环境需要更完整的验证)
 *
 * @param {Object} headers - 请求头
 * @param {string} body - 请求体
 * @returns {boolean} 验证结果
 */
function verifyWebhookSignature(headers, body) {
  // 注意：这是简化版本，生产环境需要使用微信平台证书验证
  // 参考文档进行完整的 RSA-SHA256 验签

  const timestamp = headers['wechatpay-timestamp'];
  const nonce = headers['wechatpay-nonce'];

  // 验证时间戳，防止重放攻击 (5分钟内有效)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    console.error('[SignService] 时间戳过期');
    return false;
  }

  // TODO: 实现完整的签名验证
  // 需要获取微信平台证书，使用 RSA-SHA256 验签

  return true; // 开发阶段暂时返回 true
}

module.exports = {
  hmacSha256,
  calculatePaySig,
  calculateSignature,
  buildSignData,
  generateOrderId,
  generatePaymentParams,
  verifyWebhookSignature
};
