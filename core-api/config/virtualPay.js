/**
 * 微信虚拟支付配置 (core-api)
 */

const ENV = process.env.VIRTUAL_PAY_ENV || 'sandbox';

const config = {
  appId: process.env.WX_APPID || '',
  offerId: process.env.VIRTUAL_PAY_OFFER_ID || '',
  env: ENV === 'production' ? 0 : 1,
  appKey: ENV === 'production'
    ? (process.env.VIRTUAL_PAY_APPKEY_PROD || '')
    : (process.env.VIRTUAL_PAY_APPKEY_SANDBOX || ''),
  coinToFen: 10,
  yuanToPoints: 10,
  envName: ENV
};

console.log(`[VirtualPay] 环境: ${config.envName}, env=${config.env}`);

module.exports = config;
