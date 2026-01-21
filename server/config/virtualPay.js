/**
 * 微信虚拟支付配置
 * 文档: https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/industry/virtual-payment.html
 */

const ENV = process.env.VIRTUAL_PAY_ENV || 'sandbox';

const config = {
  // 小程序 AppID
  appId: process.env.WX_APPID || '',

  // 虚拟支付 OfferID
  offerId: process.env.VIRTUAL_PAY_OFFER_ID || '',

  // 环境: 0=现网, 1=沙箱
  env: ENV === 'production' ? 0 : 1,

  // AppKey (根据环境选择)
  appKey: ENV === 'production'
    ? (process.env.VIRTUAL_PAY_APPKEY_PROD || '')
    : (process.env.VIRTUAL_PAY_APPKEY_SANDBOX || ''),

  // 代币与人民币的换算 (1代币 = 10分 = 0.1元)
  coinToFen: 10,

  // 人民币与醒币的换算 (1元 = 10醒币)
  yuanToPoints: 10,

  // 当前环境名称
  envName: ENV
};

console.log(`[VirtualPay] 环境: ${config.envName}, env=${config.env}`);

module.exports = config;
