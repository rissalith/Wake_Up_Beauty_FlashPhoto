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
// 支持三种存储结构:
// 1. 旧版层级: users/{userId}/{type}/{filename}
// 2. 旧版带场景: users/{userId}/{scene}/{type}/{filename}
// 3. 新版扁平: {userId}_{type}_{timestamp}_{random}.jpg 或 {userId}_{scene}_{type}_{timestamp}_{random}.jpg
async function getAllUserPhotos(scene = '') {
  const photos = [];
  let marker = '';
  let isTruncated = true;

  // 扫描整个存储桶根目录
  while (isTruncated) {
    try {
      const data = await listObjects('', marker);

      for (const item of data.Contents || []) {
        const key = item.Key;

        // 跳过目录标记
        if (key.endsWith('/')) continue;

        // 只处理图片文件
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(key)) continue;

        let userId, photoScene, type, fileName;

        // 判断是层级结构还是扁平结构
        if (key.startsWith('users/')) {
          // 旧版层级结构
          const parts = key.split('/');
          if (parts.length >= 4) {
            userId = parts[1];
            photoScene = 'default';
            type = parts[2];
            fileName = parts[3];

            // 检测是否为带场景的目录结构（5层）
            if (parts.length >= 5) {
              photoScene = parts[2];
              type = parts[3];
              fileName = parts[4];
            }
          } else {
            continue;
          }
        } else if (key.startsWith('id-photo/') || key.startsWith('banner')) {
          // 跳过模板和素材目录
          continue;
        } else {
          // 新版扁平结构: {userId}_{scene}_{type}_{timestamp}_{random}.jpg
          // 或: {userId}_{type}_{timestamp}_{random}.jpg
          const parts = key.replace(/\.[^.]+$/, '').split('_');

          if (parts.length >= 4) {
            // 检查是否是用户照片（userId 以 user_ 或 u_ 开头）
            if (parts[0] === 'user' || parts[0] === 'u') {
              // userId 格式: user_timestamp_random 或 u_timestamp_random
              // 完整格式: user_xxx_xxx_type_timestamp_random.jpg
              // 或: user_xxx_xxx_scene_type_timestamp_random.jpg

              // 找到 userId 的结束位置（userId 通常是 user_数字_字母数字）
              let userIdEndIndex = 2; // 默认 user_xxx_xxx
              if (parts[0] === 'u') {
                userIdEndIndex = 2; // u_xxx_xxx
              }

              userId = parts.slice(0, userIdEndIndex + 1).join('_');
              const remaining = parts.slice(userIdEndIndex + 1);

              if (remaining.length >= 3) {
                // 判断是否有场景: scene_type_timestamp_random 或 type_timestamp_random
                const possibleType = remaining[0];
                if (['temp', 'output', 'avatar', 'feedback'].includes(possibleType)) {
                  // 没有场景: type_timestamp_random
                  type = possibleType;
                  photoScene = 'default';
                } else if (remaining.length >= 4 && ['temp', 'output', 'avatar', 'feedback'].includes(remaining[1])) {
                  // 有场景: scene_type_timestamp_random
                  photoScene = remaining[0];
                  type = remaining[1];
                } else {
                  // 无法识别的格式，跳过
                  continue;
                }
              } else {
                continue;
              }
            } else {
              // 不是用户照片格式，跳过
              continue;
            }
          } else {
            continue;
          }

          fileName = key;
        }

        // 场景筛选
        if (scene && scene !== 'default' && scene !== photoScene) {
          continue;
        }

        photos.push({
          key: key,
          userId: userId,
          type: type,
          scene: photoScene || 'default',
          fileName: fileName,
          url: `${COS_CONFIG.baseUrl}/${key}`,
          size: item.Size,
          lastModified: item.LastModified
        });
      }

      isTruncated = data.IsTruncated === 'true' || data.IsTruncated === true;
      marker = data.NextMarker || (data.Contents && data.Contents.length > 0 ? data.Contents[data.Contents.length - 1].Key : '');
    } catch (e) {
      console.log('[COS] 扫描完成或出错:', e.message);
      break;
    }
  }

  return photos;
}

// 获取指定用户的照片
// 支持旧版层级结构和新版扁平结构
async function getUserPhotos(userId) {
  const photos = [];
  let marker = '';
  let isTruncated = true;

  // 同时扫描旧版层级目录和新版扁平文件
  // 1. 先扫描旧版层级目录
  const oldPrefix = `users/${userId}/`;
  while (isTruncated) {
    try {
      const data = await listObjects(oldPrefix, marker);

      for (const item of data.Contents || []) {
        const parts = item.Key.split('/');
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
    } catch (e) {
      break;
    }
  }

  // 2. 扫描新版扁平结构（以 userId_ 开头的文件）
  marker = '';
  isTruncated = true;
  const flatPrefix = `${userId}_`;

  while (isTruncated) {
    try {
      const data = await listObjects(flatPrefix, marker);

      for (const item of data.Contents || []) {
        const key = item.Key;
        if (key.endsWith('/')) continue;
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(key)) continue;

        // 解析扁平文件名: {userId}_{type}_{timestamp}_{random}.jpg
        // 或: {userId}_{scene}_{type}_{timestamp}_{random}.jpg
        const nameParts = key.replace(/\.[^.]+$/, '').split('_');
        const userIdParts = userId.split('_');
        const remaining = nameParts.slice(userIdParts.length);

        let type, scene = 'default';
        if (remaining.length >= 3) {
          if (['temp', 'output', 'avatar', 'feedback'].includes(remaining[0])) {
            type = remaining[0];
          } else if (remaining.length >= 4 && ['temp', 'output', 'avatar', 'feedback'].includes(remaining[1])) {
            scene = remaining[0];
            type = remaining[1];
          } else {
            continue;
          }
        } else {
          continue;
        }

        photos.push({
          key: key,
          userId: userId,
          type: type,
          scene: scene,
          fileName: key,
          url: `${COS_CONFIG.baseUrl}/${key}`,
          size: item.Size,
          lastModified: item.LastModified
        });
      }

      isTruncated = data.IsTruncated === 'true' || data.IsTruncated === true;
      marker = data.NextMarker || (data.Contents && data.Contents.length > 0 ? data.Contents[data.Contents.length - 1].Key : '');
    } catch (e) {
      break;
    }
  }

  return photos;
}

// 获取所有用户ID列表
// 支持旧版层级结构和新版扁平结构
async function getAllUserIds() {
  const userIds = new Set();
  let marker = '';
  let isTruncated = true;

  // 1. 扫描旧版层级目录 users/
  while (isTruncated) {
    try {
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
    } catch (e) {
      break;
    }
  }

  // 2. 扫描新版扁平结构（以 user_ 或 u_ 开头的文件）
  marker = '';
  isTruncated = true;

  while (isTruncated) {
    try {
      const data = await listObjects('', marker, 1000);

      for (const item of data.Contents || []) {
        const key = item.Key;
        // 跳过目录和非图片文件
        if (key.endsWith('/')) continue;
        if (key.startsWith('users/') || key.startsWith('id-photo/') || key.startsWith('banner')) continue;
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(key)) continue;

        // 解析扁平文件名提取 userId
        const parts = key.replace(/\.[^.]+$/, '').split('_');
        if (parts.length >= 4) {
          if (parts[0] === 'user' && parts.length >= 3) {
            // user_timestamp_random_type_... -> userId = user_timestamp_random
            const userId = `${parts[0]}_${parts[1]}_${parts[2]}`;
            userIds.add(userId);
          } else if (parts[0] === 'u' && parts.length >= 3) {
            // u_timestamp_random_type_... -> userId = u_timestamp_random
            const userId = `${parts[0]}_${parts[1]}_${parts[2]}`;
            userIds.add(userId);
          }
        }
      }

      isTruncated = data.IsTruncated === 'true' || data.IsTruncated === true;
      marker = data.NextMarker || (data.Contents && data.Contents.length > 0 ? data.Contents[data.Contents.length - 1].Key : '');
    } catch (e) {
      break;
    }
  }

  return Array.from(userIds);
}

// ==================== 素材桶操作函数 ====================

// 列出素材桶中的对象
async function listAssetObjects(prefix = '', maxKeys = 1000) {
  if (!cosClient) {
    throw new Error('COS客户端未初始化');
  }

  return new Promise((resolve, reject) => {
    cosClient.getBucket({
      Bucket: ASSET_COS_CONFIG.bucket,
      Region: ASSET_COS_CONFIG.region,
      Prefix: prefix,
      MaxKeys: maxKeys
    }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// 上传到素材桶
async function uploadToAssetBucket(buffer, key, contentType) {
  if (!cosClient) {
    throw new Error('COS客户端未初始化');
  }

  return new Promise((resolve, reject) => {
    cosClient.putObject({
      Bucket: ASSET_COS_CONFIG.bucket,
      Region: ASSET_COS_CONFIG.region,
      Key: key,
      Body: buffer,
      ContentType: contentType
    }, (err, data) => {
      if (err) reject(err);
      else resolve({
        key: key,
        url: `${ASSET_COS_CONFIG.baseUrl}/${key}`,
        etag: data.ETag
      });
    });
  });
}

// 从素材桶删除对象
async function deleteFromAssetBucket(key) {
  if (!cosClient) {
    throw new Error('COS客户端未初始化');
  }

  return new Promise((resolve, reject) => {
    cosClient.deleteObject({
      Bucket: ASSET_COS_CONFIG.bucket,
      Region: ASSET_COS_CONFIG.region,
      Key: key
    }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// 获取所有素材列表（分类整理）
async function getAllAssets() {
  const data = await listAssetObjects('', 1000);
  const contents = data.Contents || [];

  const result = {
    banners: {
      'zh-CN': [],
      'en': []
    },
    features: {
      'zh-CN': '',
      'en': ''
    },
    titles: {
      'zh-CN': '',
      'en': ''
    },
    tabbar: {
      home: { normal: '', active: '' },
      history: { normal: '', active: '' },
      mine: { normal: '', active: '' }
    },
    sceneIcons: [],
    uiIcons: []
  };

  contents.forEach(item => {
    const key = item.Key;
    const url = `${ASSET_COS_CONFIG.baseUrl}/${key}`;
    const fileName = key.split('/').pop();

    // Banner
    if (key.startsWith('banner/') && fileName) {
      result.banners['zh-CN'].push({ key, url, fileName });
    } else if (key.startsWith('banner-en/') && fileName) {
      result.banners['en'].push({ key, url, fileName });
    }

    // Feature图片
    else if (key === 'feature-zh-cn.png') {
      result.features['zh-CN'] = url;
    } else if (key === 'feature-en.png') {
      result.features['en'] = url;
    }

    // Title图片
    else if (key === 'title-zh-cn.png') {
      result.titles['zh-CN'] = url;
    } else if (key === 'title-en.png') {
      result.titles['en'] = url;
    }

    // TabBar图标
    else if (key === 'tab-home.png') {
      result.tabbar.home.normal = url;
    } else if (key === 'tab-home-active.png') {
      result.tabbar.home.active = url;
    } else if (key === 'tab-history.png') {
      result.tabbar.history.normal = url;
    } else if (key === 'tab-history-active.png') {
      result.tabbar.history.active = url;
    } else if (key === 'tab-mine.png') {
      result.tabbar.mine.normal = url;
    } else if (key === 'tab-mine-active.png') {
      result.tabbar.mine.active = url;
    }

    // 场景图标
    else if (!key.includes('/') && key.endsWith('.png') &&
      !key.startsWith('tab-') && !key.startsWith('feature-') && !key.startsWith('title-') && key !== 'logo.png') {
      result.sceneIcons.push({ key, url, fileName });
    }

    // UI图标
    else if (key.startsWith('icon/') && fileName && (fileName.endsWith('.svg') || fileName.endsWith('.png'))) {
      result.uiIcons.push({ key, url, fileName });
    }

    // Logo图片
    else if (key.startsWith('logo/') && fileName) {
      const logoKey = fileName.replace(/\.[^.]+$/, ''); // 去掉扩展名
      if (!result.logos) result.logos = {};
      result.logos[logoKey] = url;
    }

    // 关于页面图片
    else if (key.startsWith('about/') && fileName) {
      if (!result.aboutImages) result.aboutImages = [];
      result.aboutImages.push({ key, url, fileName });
    }

    // 一般素材
    else if (key.startsWith('general/') && fileName) {
      if (!result.generalAssets) result.generalAssets = [];
      result.generalAssets.push({ key, url, fileName });
    }

    // AI生成的图片
    else if (key.startsWith('ai-generated/') && fileName) {
      if (!result.generalAssets) result.generalAssets = [];
      result.generalAssets.push({ key, url, fileName, source: 'ai-generated' });
    }
  });

  // 按文件名排序Banner
  Object.keys(result.banners).forEach(lang => {
    result.banners[lang].sort((a, b) => a.fileName.localeCompare(b.fileName));
  });

  return result;
}

// 获取素材桶中的所有图片（用于后台管理图片选择器）
async function getAssetImages() {
  if (!cosClient) {
    throw new Error('COS客户端未初始化，请配置COS密钥');
  }

  const images = [];
  const folders = new Set();

  let marker = '';
  let isTruncated = true;

  while (isTruncated) {
    try {
      const data = await new Promise((resolve, reject) => {
        cosClient.getBucket({
          Bucket: ASSET_COS_CONFIG.bucket,
          Region: ASSET_COS_CONFIG.region,
          Prefix: '',
          Marker: marker,
          MaxKeys: 1000
        }, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      for (const item of data.Contents || []) {
        const key = item.Key;
        const parts = key.split('/');
        const fileName = parts[parts.length - 1];

        // 只处理图片文件
        if (fileName && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName)) {
          const folderPath = parts.slice(0, -1).join('/') || '根目录';
          folders.add(folderPath);

          images.push({
            key: key,
            fileName: fileName,
            folderPath: folderPath,
            url: `${ASSET_COS_CONFIG.baseUrl}/${key}`,
            size: item.Size,
            lastModified: item.LastModified
          });
        }
      }

      isTruncated = data.IsTruncated === 'true' || data.IsTruncated === true;
      marker = data.NextMarker || (data.Contents && data.Contents.length > 0 ? data.Contents[data.Contents.length - 1].Key : '');
    } catch (e) {
      console.log('[COS] 扫描素材桶完成或出错:', e.message);
      break;
    }
  }

  return {
    images,
    folders: Array.from(folders).sort()
  };
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
  getAllUserIds,
  listAssetObjects,
  uploadToAssetBucket,
  deleteFromAssetBucket,
  getAllAssets,
  getAssetImages
};
