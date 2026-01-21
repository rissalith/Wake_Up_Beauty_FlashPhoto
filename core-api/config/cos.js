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

// 从URL中提取COS key
function extractKeyFromUrl(url) {
  if (!url) return null;

  // 处理用户照片桶URL
  if (url.includes(COS_CONFIG.baseUrl)) {
    return url.replace(COS_CONFIG.baseUrl + '/', '');
  }

  // 处理素材桶URL
  if (url.includes(ASSET_COS_CONFIG.baseUrl)) {
    return url.replace(ASSET_COS_CONFIG.baseUrl + '/', '');
  }

  // 如果URL不包含baseUrl，可能已经是key
  if (!url.startsWith('http')) {
    return url;
  }

  return null;
}

// 删除COS文件
async function deleteObject(key, bucket = 'user') {
  if (!cosClient) {
    throw new Error('COS客户端未初始化，请配置COS密钥');
  }

  if (!key) {
    throw new Error('文件key不能为空');
  }

  const config = bucket === 'asset' ? ASSET_COS_CONFIG : COS_CONFIG;

  return new Promise((resolve, reject) => {
    cosClient.deleteObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key
    }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        console.log(`[COS] 删除文件成功: ${key}`);
        resolve(data);
      }
    });
  });
}

// 批量删除COS文件
async function deleteObjects(keys, bucket = 'user') {
  if (!cosClient) {
    throw new Error('COS客户端未初始化，请配置COS密钥');
  }

  if (!keys || keys.length === 0) {
    return { deleted: [], errors: [] };
  }

  const config = bucket === 'asset' ? ASSET_COS_CONFIG : COS_CONFIG;
  const objects = keys.filter(k => k).map(key => ({ Key: key }));

  if (objects.length === 0) {
    return { deleted: [], errors: [] };
  }

  return new Promise((resolve, reject) => {
    cosClient.deleteMultipleObject({
      Bucket: config.bucket,
      Region: config.region,
      Objects: objects
    }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        console.log(`[COS] 批量删除完成: ${objects.length} 个文件`);
        resolve({
          deleted: data.Deleted || [],
          errors: data.Error || []
        });
      }
    });
  });
}

// 生成 COS 上传签名（用于小程序端安全上传）
// 返回签名信息，小程序端使用签名进行上传
function generateUploadSignature(key, expireSeconds = 900) {
  if (!COS_CONFIG.secretId || !COS_CONFIG.secretKey) {
    throw new Error('COS密钥未配置');
  }

  const now = Math.floor(Date.now() / 1000);
  const expireTime = now + expireSeconds;

  // 生成 KeyTime
  const keyTime = `${now};${expireTime}`;

  // 生成 SignKey
  const signKey = crypto.createHmac('sha1', COS_CONFIG.secretKey)
    .update(keyTime)
    .digest('hex');

  // 构建 HttpString (PUT 请求)
  const httpString = `put\n/${key}\n\nhost=${COS_CONFIG.bucket}.cos.${COS_CONFIG.region}.myqcloud.com\n`;

  // 生成 StringToSign
  const sha1HttpString = crypto.createHash('sha1').update(httpString).digest('hex');
  const stringToSign = `sha1\n${keyTime}\n${sha1HttpString}\n`;

  // 生成 Signature
  const signature = crypto.createHmac('sha1', signKey)
    .update(stringToSign)
    .digest('hex');

  // 构建 Authorization
  const authorization = `q-sign-algorithm=sha1&q-ak=${COS_CONFIG.secretId}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=host&q-url-param-list=&q-signature=${signature}`;

  return {
    authorization,
    securityToken: '', // 使用永久密钥时为空
    keyTime,
    expireTime,
    key,
    bucket: COS_CONFIG.bucket,
    region: COS_CONFIG.region,
    baseUrl: COS_CONFIG.baseUrl,
    url: `${COS_CONFIG.baseUrl}/${key}`
  };
}

// 生成预签名上传 URL（更简单的方式）
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

// 批量生成上传凭证（用于小程序一次性获取多个上传地址）
async function batchGetUploadCredentials(keys, expireSeconds = 900) {
  const credentials = [];
  for (const key of keys) {
    try {
      const cred = await getPresignedUploadUrl(key, expireSeconds);
      credentials.push(cred);
    } catch (err) {
      credentials.push({ key, error: err.message });
    }
  }
  return credentials;
}

module.exports = {
  COS_CONFIG,
  ASSET_COS_CONFIG,
  initCOS,
  isCOSConfigured,
  extractKeyFromUrl,
  deleteObject,
  deleteObjects,
  generateUploadSignature,
  getPresignedUploadUrl,
  batchGetUploadCredentials
};
