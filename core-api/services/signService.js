/**
 * 微信虚拟支付签名服务 (core-api)
 *
 * 根据微信官方文档：
 * - paySig = HMAC-SHA256(appKey, uri + "&" + signData)
 * - signature = HMAC-SHA256(sessionKey, signData)
 *
 * 代币模式(short_series_coin)的signData字段：
 * offerId, buyQuantity, env, currencyType, platform, outTradeNo, attach
 */

const crypto = require('crypto');
const virtualPayConfig = require('../config/virtualPay');

// HMAC-SHA256：key作为密钥，data作为数据
function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

// paySig 计算
function calculatePaySig(signDataStr, appKey = virtualPayConfig.appKey) {
  const uri = '/wxa/game/pay';
  const dataToSign = uri + '&' + signDataStr;
  console.log('[signService] paySig 签名数据:', dataToSign.substring(0, 100) + '...');
  return hmacSha256(appKey, dataToSign);
}

// signature 计算：用 sessionKey 对 signData 签名
function calculateSignature(signDataStr, sessionKey) {
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
    platform = 'ios',
    attach = ''
  } = params;

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

function generatePaymentParams(options) {
  const {
    orderId,
    amount,
    points,
    userId,
    sessionKey,
    platform = 'ios'
  } = options;

  // 1元 = 10醒币 = 10个代币
  const buyQuantity = amount * 10;

  const attach = JSON.stringify({
    userId: userId,
    points: points,
    orderId: orderId
  });

  const signData = buildSignDataForCoin({
    outTradeNo: orderId,
    buyQuantity: buyQuantity,
    platform: platform,
    attach: attach
  });

  const signDataStr = JSON.stringify(signData);

  console.log('[signService] 生成签名参数:');
  console.log('[signService] - signDataStr:', signDataStr);
  console.log('[signService] - sessionKey:', sessionKey ? sessionKey.substring(0, 8) + '...' : 'NULL');
  console.log('[signService] - appKey:', virtualPayConfig.appKey ? virtualPayConfig.appKey.substring(0, 8) + '...' : 'NULL');
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
