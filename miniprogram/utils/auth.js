/**
 * LICENSE 配置
 * 请参考 https://cloud.tencent.com/document/product/616/71364
 * 从服务器获取或配置环境变量
 */
const LICENSE_KEY = wx.getStorageSync('LICENSE_KEY') || '';
const APP_ID = wx.getStorageSync('APP_ID') || '';

async function authFunc() {
  // 正式 LICENSE 需提供此函数
}

module.exports = {
  LICENSE_KEY,
  APP_ID,
  authFunc,
};
