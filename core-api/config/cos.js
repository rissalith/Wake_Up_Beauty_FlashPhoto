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

// 列出指定前缀下的所有对象
async function listObjects(prefix = '', marker = '', maxKeys = 1000) {
  if (!cosClient) {
    throw new Error('COS客户端未初始化，请配置COS密钥');
  }

  return new Promise((resolve, reject) => {
    cosClient.getBucket({
      Bucket: COS_CONFIG.bucket,
      Region: COS_CONFIG.region,
      Prefix: prefix,
      Marker: marker,
      MaxKeys: maxKeys
    }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

// 获取所有用户的照片
async function getAllUserPhotos(scene = '') {
  const photos = [];
  let marker = '';
  let isTruncated = true;

  // 根据场景确定扫描前缀
  let prefix = 'users/';
  if (scene && scene !== 'default') {
    // 新版目录结构: users/{userId}/{scene}/{type}/{filename}
    // 但我们仍然需要扫描整个 users/ 目录，然后按场景筛选
  }

  while (isTruncated) {
    try {
      const data = await listObjects(prefix, marker);

      for (const item of data.Contents || []) {
        const parts = item.Key.split('/');
        // 支持两种目录结构:
        // 旧版: users/{userId}/{type}/{filename} (type = temp/output)
        // 新版: users/{userId}/{scene}/{type}/{filename}

        if (parts.length >= 4) {
          const userId = parts[1];
          let photoScene = 'default';
          let type = parts[2];
          let fileName = parts[3];

          // 检测是否为新版目录结构（5层）
          if (parts.length >= 5) {
            photoScene = parts[2];
            type = parts[3];
            fileName = parts[4];
          }

          // 场景筛选
          if (scene && scene !== photoScene) {
            continue;
          }

          // 只处理图片文件
          if (fileName && /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
            photos.push({
              key: item.Key,
              userId: userId,
              type: type,
              scene: photoScene,
              fileName: fileName,
              url: `${COS_CONFIG.baseUrl}/${item.Key}`,
              size: item.Size,
              lastModified: item.LastModified
            });
          }
        }
      }

      isTruncated = data.IsTruncated === 'true' || data.IsTruncated === true;
      marker = data.NextMarker || (data.Contents && data.Contents.length > 0 ? data.Contents[data.Contents.length - 1].Key : '');
    } catch (e) {
      console.log('[COS] users/ 目录扫描完成或不存在');
      break;
    }
  }

  return photos;
}

// 获取指定用户的照片
async function getUserPhotos(userId) {
  const photos = [];
  let marker = '';
  let isTruncated = true;
  const prefix = `users/${userId}/`;

  while (isTruncated) {
    const data = await listObjects(prefix, marker);

    for (const item of data.Contents || []) {
      const parts = item.Key.split('/');
      // 支持两种目录结构
      if (parts.length >= 4) {
        let scene = 'default';
        let type = parts[2];
        let fileName = parts[3];

        if (parts.length >= 5) {
          scene = parts[2];
          type = parts[3];
          fileName = parts[4];
        }

        if (fileName && /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
          photos.push({
            key: item.Key,
            userId: userId,
            type: type,
            scene: scene,
            fileName: fileName,
            url: `${COS_CONFIG.baseUrl}/${item.Key}`,
            size: item.Size,
            lastModified: item.LastModified
          });
        }
      }
    }

    isTruncated = data.IsTruncated === 'true' || data.IsTruncated === true;
    marker = data.NextMarker || (data.Contents && data.Contents.length > 0 ? data.Contents[data.Contents.length - 1].Key : '');
  }

  return photos;
}

// 获取所有用户ID列表
async function getAllUserIds() {
  const userIds = new Set();
  let marker = '';
  let isTruncated = true;

  while (isTruncated) {
    const data = await listObjects('users/', marker, 1000);

    for (const item of data.Contents || []) {
      const parts = item.Key.split('/');
      if (parts.length >= 2 && parts[1]) {
        userIds.add(parts[1]);
      }
    }

    // 也检查CommonPrefixes（目录）
    for (const prefix of data.CommonPrefixes || []) {
      const parts = prefix.Prefix.split('/');
      if (parts.length >= 2 && parts[1]) {
        userIds.add(parts[1]);
      }
    }

    isTruncated = data.IsTruncated === 'true' || data.IsTruncated === true;
    marker = data.NextMarker || (data.Contents && data.Contents.length > 0 ? data.Contents[data.Contents.length - 1].Key : '');
  }

  return Array.from(userIds);
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
  batchGetUploadCredentials,
  listObjects,
  getAllUserPhotos,
  getUserPhotos,
  getAllUserIds
};
