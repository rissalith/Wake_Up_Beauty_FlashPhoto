/**
 * 微信虚拟支付签名服务 (admin-server)
 *
 * 根据微信官方文档：
 * - paySig = HMAC-SHA256(appKey, "requestVirtualPayment" + "&" + signData)
 * - signature = HMAC-SHA256(sessionKey, signData)
 *
 * 注意：HMAC的key是appKey/sessionKey，data是要签名的内容
 * uri 固定为 "requestVirtualPayment"（不是完整路径）
 *
 * 代币模式(short_series_coin)的signData字段：
 * offerId, buyQuantity, env, currencyType, outTradeNo, attach
 */

const crypto = require('crypto');
const virtualPayConfig = require('../config/virtualPay');

// HMAC-SHA256：key作为密钥，data作为数据
function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

// paySig 计算：根据文档，uri 应该是 API 路径
// 尝试使用 /wxa/game/pay 作为 uri
function calculatePaySig(signDataStr, appKey = virtualPayConfig.appKey) {
  const uri = '/wxa/game/pay';
  const dataToSign = uri + '&' + signDataStr;
  console.log('[signService] paySig 签名: hmac_sha256(appKey, "' + uri + '&" + signData)');
  console.log('[signService] paySig 数据:', dataToSign.substring(0, 100) + '...');
  return hmacSha256(appKey, dataToSign);
}

// signature 计算：用 sessionKey 对 signData 签名
function calculateSignature(signDataStr, sessionKey) {
  console.log('[signService] signature 签名: hmac_sha256(sessionKey, signData)');
  return hmacSha256(sessionKey, signDataStr);
}

function generateOrderId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return 'VP' + timestamp + random;
}

// 构建 signData - 代币模式
function buildSignDataForCoin(params) {
  const {
    outTradeNo,
    buyQuantity,
    platform = 'ios',  // 必填：平台 ios/android
    attach = ''
  } = params;

  // 代币模式(short_series_coin)的signData字段
  // 必须包含 platform 字段
  return {
    offerId: virtualPayConfig.offerId,
    buyQuantity: buyQuantity,
    env: virtualPayConfig.env,
    currencyType: 'CNY',
    platform: platform,  // 关键：必须包含平台字段
    outTradeNo: outTradeNo,
    attach: attach
  };
}

function generatePaymentParams(options) {
  const {
    orderId,
    amount,
    points,
    userId,
    sessionKey,
    platform = 'ios'  // 从前端传入的平台参数
  } = options;

  // 1元 = 10醒币 = 10个代币
  // buyQuantity 是购买的代币数量
  const buyQuantity = amount * 10;

  const attach = JSON.stringify({
    userId: userId,
    points: points,
    orderId: orderId
  });

  // 代币模式 - 必须包含 platform 字段
  const signData = buildSignDataForCoin({
    outTradeNo: orderId,
    buyQuantity: buyQuantity,
    platform: platform,
    attach: attach
  });

  const signDataStr = JSON.stringify(signData);

  // 调试日志
  console.log('[signService] 生成签名参数:');
  console.log('[signService] - signDataStr:', signDataStr);
  console.log('[signService] - sessionKey:', sessionKey ? sessionKey.substring(0, 8) + '...' : 'NULL');
  console.log('[signService] - appKey:', virtualPayConfig.appKey.substring(0, 8) + '...');
  console.log('[signService] - env:', virtualPayConfig.env, '(0=生产, 1=沙箱)');

  const paySig = calculatePaySig(signDataStr);
  const signature = calculateSignature(signDataStr, sessionKey);

  console.log('[signService] - paySig:', paySig.substring(0, 16) + '...');
  console.log('[signService] - signature:', signature.substring(0, 16) + '...');

  return {
    signData: signData,
    paySig: paySig,
    signature: signature,
    sigMethod: 'hmac_sha256',
    mode: 'short_series_coin'
  };
}

module.exports = {
  hmacSha256,
  calculatePaySig,
  calculateSignature,
  buildSignDataForCoin,
  generateOrderId,
  generatePaymentParams
};
