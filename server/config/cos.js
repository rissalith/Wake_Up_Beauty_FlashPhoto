// 腾讯云COS配置
const COS = require('cos-nodejs-sdk-v5');
const crypto = require('crypto');

// 主存储桶（用户照片）
const COS_CONFIG = {
  bucket: 'xingmeishantu2-1310044729',
  region: 'ap-shanghai',
  baseUrl: 'https://xingmeishantu2-1310044729.cos.ap-shanghai.myqcloud.com',
  secretId: process.env.COS_SECRET_ID || '',
  secretKey: process.env.COS_SECRET_KEY || ''
};

// 素材存储桶（预置素材图片）
const ASSET_COS_CONFIG = {
  bucket: 'xingmeishantu-1310044729',
  region: 'ap-shanghai',
  baseUrl: 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com'
};

let cosClient = null;

// 初始化COS客户端
function initCOS() {
  if (!COS_CONFIG.secretId || !COS_CONFIG.secretKey) {
    console.warn('[COS] 警告: COS密钥未配置，将使用公开访问模式');
    return null;
  }

  cosClient = new COS({
    SecretId: COS_CONFIG.secretId,
    SecretKey: COS_CONFIG.secretKey
  });

  console.log('[COS] COS客户端初始化成功');
  return cosClient;
}

// 检查COS是否已配置
function isCOSConfigured() {
  return !!(COS_CONFIG.secretId && COS_CONFIG.secretKey && cosClient);
}

// 生成预签名上传 URL
function getPresignedUploadUrl(key, expireSeconds = 900) {
  if (!cosClient) {
    throw new Error('COS客户端未初始化');
  }

  return new Promise((resolve, reject) => {
    cosClient.getObjectUrl({
      Bucket: COS_CONFIG.bucket,
      Region: COS_CONFIG.region,
      Key: key,
      Method: 'PUT',
      Expires: expireSeconds,
      Sign: true
    }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          url: data.Url,
          key,
          bucket: COS_CONFIG.bucket,
          region: COS_CONFIG.region,
          baseUrl: COS_CONFIG.baseUrl,
          expireTime: Math.floor(Date.now() / 1000) + expireSeconds
        });
      }
    });
  });
}

module.exports = {
  COS_CONFIG,
  ASSET_COS_CONFIG,
  initCOS,
  isCOSConfigured,
  getPresignedUploadUrl
};
