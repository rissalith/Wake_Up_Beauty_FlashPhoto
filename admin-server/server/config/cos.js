// 腾讯云COS配置
const COS = require('cos-nodejs-sdk-v5');

// 主存储桶（用户照片）
const COS_CONFIG = {
  bucket: 'xingmeishantu2-1310044729',
  region: 'ap-shanghai',
  baseUrl: 'https://xingmeishantu2-1310044729.cos.ap-shanghai.myqcloud.com',
  // 从环境变量读取密钥，或在.env文件中配置
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
// 2. 新版扁平: {userId}_{type}_{timestamp}_{random}.jpg 或 {userId}_{scene}_{type}_{timestamp}_{random}.jpg
// 3. 模板: id-photo/{gender}/{filename}
async function getAllUserPhotos() {
  const photos = [];
  let marker = '';
  let isTruncated = true;

  // 扫描整个存储桶
  while (isTruncated) {
    try {
      const data = await listObjects('', marker);

      for (const item of data.Contents || []) {
        const key = item.Key;

        // 跳过目录标记
        if (key.endsWith('/')) continue;

        // 只处理图片文件
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(key)) continue;

        let userId, type, fileName, scene = 'default', gender = null;

        if (key.startsWith('users/')) {
          // 旧版层级结构: users/{userId}/{type}/{filename}
          const parts = key.split('/');
          if (parts.length >= 4) {
            userId = parts[1];
            type = parts[2];
            fileName = parts[3];
          } else {
            continue;
          }
        } else if (key.startsWith('id-photo/')) {
          // 模板结构: id-photo/{gender}/{filename}
          const parts = key.split('/');
          if (parts.length >= 3) {
            gender = parts[1];
            userId = gender;
            type = 'template';
            fileName = parts[2];
          } else {
            continue;
          }
        } else if (key.startsWith('banner') || key.startsWith('feature') || key.startsWith('title') || key.startsWith('tab-') || key.startsWith('icon/')) {
          // 跳过素材文件
          continue;
        } else {
          // 新版扁平结构: {userId}_{type}_{timestamp}_{random}.jpg
          // 或: {userId}_{scene}_{type}_{timestamp}_{random}.jpg
          const nameParts = key.replace(/\.[^.]+$/, '').split('_');

          if (nameParts.length >= 4) {
            // 检查是否是用户照片（userId 以 user_ 或 u_ 开头）
            if (nameParts[0] === 'user' || nameParts[0] === 'u') {
              // userId 格式: user_timestamp_random 或 u_timestamp_random
              let userIdEndIndex = 2;
              userId = nameParts.slice(0, userIdEndIndex + 1).join('_');
              const remaining = nameParts.slice(userIdEndIndex + 1);

              if (remaining.length >= 3) {
                const possibleType = remaining[0];
                if (['temp', 'output', 'avatar', 'feedback'].includes(possibleType)) {
                  type = possibleType;
                  scene = 'default';
                } else if (remaining.length >= 4 && ['temp', 'output', 'avatar', 'feedback'].includes(remaining[1])) {
                  scene = remaining[0];
                  type = remaining[1];
                } else {
                  continue;
                }
              } else {
                continue;
              }
              fileName = key;
            } else {
              continue;
            }
          } else {
            continue;
          }
        }

        const photoObj = {
          key: key,
          userId: userId,
          type: type,
          scene: scene,
          fileName: fileName,
          url: `${COS_CONFIG.baseUrl}/${key}`,
          size: item.Size,
          lastModified: item.LastModified
        };

        if (gender) {
          photoObj.gender = gender;
        }

        photos.push(photoObj);
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

  // 1. 扫描旧版层级目录
  const oldPrefix = `users/${userId}/`;
  while (isTruncated) {
    try {
      const data = await listObjects(oldPrefix, marker);

      for (const item of data.Contents || []) {
        const parts = item.Key.split('/');
        if (parts.length >= 4) {
          const type = parts[2];
          const fileName = parts[3];

          if (fileName && /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
            photos.push({
              key: item.Key,
              userId: userId,
              type: type,
              scene: 'default',
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

  // 2. 扫描新版扁平结构
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

  // 1. 扫描旧版层级目录
  while (isTruncated) {
    try {
      const data = await listObjects('users/', marker, 1000);

      for (const item of data.Contents || []) {
        const parts = item.Key.split('/');
        if (parts.length >= 2 && parts[1]) {
          userIds.add(parts[1]);
        }
      }

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

  // 2. 扫描新版扁平结构
  marker = '';
  isTruncated = true;

  while (isTruncated) {
    try {
      const data = await listObjects('', marker, 1000);

      for (const item of data.Contents || []) {
        const key = item.Key;
        if (key.endsWith('/')) continue;
        if (key.startsWith('users/') || key.startsWith('id-photo/') || key.startsWith('banner')) continue;
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(key)) continue;

        const parts = key.replace(/\.[^.]+$/, '').split('_');
        if (parts.length >= 4) {
          if (parts[0] === 'user' && parts.length >= 3) {
            const userId = `${parts[0]}_${parts[1]}_${parts[2]}`;
            userIds.add(userId);
          } else if (parts[0] === 'u' && parts.length >= 3) {
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

// 检查COS是否已配置
function isCOSConfigured() {
  return !!(COS_CONFIG.secretId && COS_CONFIG.secretKey && cosClient);
}

// 上传Base64图片到COS
async function uploadBase64ToCOS(base64Data, key) {
  if (!cosClient) {
    throw new Error('COS客户端未初始化，请配置COS密钥');
  }

  // 移除base64前缀
  let pureBase64 = base64Data;
  if (base64Data.includes(',')) {
    pureBase64 = base64Data.split(',')[1];
  }

  // 将base64转为Buffer
  const buffer = Buffer.from(pureBase64, 'base64');

  return new Promise((resolve, reject) => {
    cosClient.putObject({
      Bucket: COS_CONFIG.bucket,
      Region: COS_CONFIG.region,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg'
    }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          key: key,
          url: `${COS_CONFIG.baseUrl}/${key}`,
          etag: data.ETag
        });
      }
    });
  });
}

// 上传Buffer到COS（文件上传方式）
async function uploadBufferToCOS(buffer, key, contentType = 'image/png') {
  if (!cosClient) {
    throw new Error('COS客户端未初始化，请配置COS密钥');
  }

  return new Promise((resolve, reject) => {
    cosClient.putObject({
      Bucket: COS_CONFIG.bucket,
      Region: COS_CONFIG.region,
      Key: key,
      Body: buffer,
      ContentType: contentType
    }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          key: key,
          url: `${COS_CONFIG.baseUrl}/${key}`,
          etag: data.ETag
        });
      }
    });
  });
}

// 获取素材图片列表（用于后台管理选择）
// 从素材桶 xingmeishantu-1310044729 获取所有图片资源
// 包括：根目录、banner、icon、场景目录等所有图片
async function getAssetImages() {
  if (!cosClient) {
    throw new Error('COS客户端未初始化，请配置COS密钥');
  }

  const images = [];
  const folders = new Set(); // 收集所有文件夹

  // 扫描整个素材桶
  let marker = '';
  let isTruncated = true;

  while (isTruncated) {
    try {
      const data = await new Promise((resolve, reject) => {
        cosClient.getBucket({
          Bucket: ASSET_COS_CONFIG.bucket,
          Region: ASSET_COS_CONFIG.region,
          Prefix: '', // 空前缀，扫描整个桶
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
          // 解析文件夹路径
          const folderPath = parts.slice(0, -1).join('/') || '根目录';
          folders.add(folderPath);

          // 智能解析分类信息
          let folder = parts[0] || '';        // 一级目录: id-photo, profession, banner, icon 等
          let subFolder1 = parts[1] || '';    // 二级目录: male, female 或其他
          let subFolder2 = parts[2] || '';    // 三级目录: dress, hair, posture 等

          // 文件夹名称映射
          const folderNames = {
            'id-photo': '证件照',
            'profession': '职业照',
            'portrait': '艺术照',
            'banner': '横幅',
            'icon': '图标',
            'icons': '图标',
            'ui': 'UI素材',
            'background': '背景',
            'backgrounds': '背景',
            'template': '模板',
            'templates': '模板',
            'scene': '场景',
            'scenes': '场景',
            'avatar': '头像',
            'avatars': '头像',
            'logo': 'Logo',
            'common': '通用',
            '': '根目录'
          };

          // 类型名称映射
          const typeNames = {
            'dress': '穿着',
            'hair': '发型',
            'expression': '表情',
            'posture': '姿势',
            'framing': '构图',
            'male': '男',
            'female': '女'
          };

          images.push({
            key: key,
            url: `${ASSET_COS_CONFIG.baseUrl}/${key}`,
            fileName: fileName,
            folder: folder,                                    // 一级文件夹
            folderName: folderNames[folder] || folder,         // 一级文件夹中文名
            folderPath: folderPath,                            // 完整文件夹路径
            subFolder1: subFolder1,                            // 二级目录
            subFolder2: subFolder2,                            // 三级目录
            // 兼容旧字段
            scene: folder,
            sceneName: folderNames[folder] || folder,
            category: subFolder1,                              // 性别或子分类
            subCategory: subFolder2,                           // 类型
            size: item.Size,
            lastModified: item.LastModified
          });
        }
      }

      isTruncated = data.IsTruncated === 'true' || data.IsTruncated === true;
      marker = data.NextMarker || (data.Contents && data.Contents.length > 0 ? data.Contents[data.Contents.length - 1].Key : '');
    } catch (e) {
      console.error('[COS] 扫描素材桶失败:', e.message);
      break;
    }
  }

  console.log(`[COS] 素材图片扫描完成，共 ${images.length} 张，${folders.size} 个文件夹`);
  return { images, folders: Array.from(folders).sort() };
}

// 获取COS客户端实例
function getCosClient() {
  return cosClient;
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

// 清理过期的临时文件
// 默认清理 24 小时前的 temp 目录文件
async function cleanupExpiredTempFiles(maxAgeHours = 24) {
  if (!cosClient) {
    console.warn('[COS] COS客户端未初始化，跳过清理');
    return { scanned: 0, deleted: 0, errors: [] };
  }

  const expiredKeys = [];
  const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  let marker = '';
  let isTruncated = true;
  let scannedCount = 0;

  console.log(`[COS] 开始清理临时文件，过期时间: ${cutoffTime.toISOString()}`);

  // 扫描所有用户的 temp 目录
  while (isTruncated) {
    try {
      const data = await listObjects('users/', marker);

      for (const item of data.Contents || []) {
        scannedCount++;
        const parts = item.Key.split('/');
        // 只处理 temp 目录下的文件: users/{userId}/temp/{filename}
        if (parts.length >= 4 && parts[2] === 'temp') {
          const lastModified = new Date(item.LastModified);
          if (lastModified < cutoffTime) {
            expiredKeys.push(item.Key);
          }
        }
      }

      isTruncated = data.IsTruncated === 'true' || data.IsTruncated === true;
      marker = data.NextMarker || (data.Contents && data.Contents.length > 0 ? data.Contents[data.Contents.length - 1].Key : '');
    } catch (e) {
      console.error('[COS] 扫描临时文件失败:', e.message);
      break;
    }
  }

  console.log(`[COS] 扫描完成，共 ${scannedCount} 个文件，${expiredKeys.length} 个过期文件待删除`);

  // 批量删除过期文件（每次最多 1000 个）
  const errors = [];
  let deletedCount = 0;

  for (let i = 0; i < expiredKeys.length; i += 1000) {
    const batch = expiredKeys.slice(i, i + 1000);
    try {
      const result = await deleteObjects(batch);
      deletedCount += result.deleted.length;
      if (result.errors.length > 0) {
        errors.push(...result.errors);
      }
    } catch (e) {
      console.error('[COS] 批量删除失败:', e.message);
      errors.push({ batch: i, error: e.message });
    }
  }

  console.log(`[COS] 清理完成，删除 ${deletedCount} 个文件，${errors.length} 个错误`);

  return {
    scanned: scannedCount,
    deleted: deletedCount,
    expiredCount: expiredKeys.length,
    errors
  };
}

// 获取存储统计信息
async function getStorageStats() {
  if (!cosClient) {
    return { configured: false };
  }

  const stats = {
    configured: true,
    users: { count: 0, tempFiles: 0, outputFiles: 0, totalSize: 0 },
    templates: { count: 0, totalSize: 0 }
  };

  let marker = '';
  let isTruncated = true;

  // 统计用户照片
  while (isTruncated) {
    try {
      const data = await listObjects('users/', marker);

      for (const item of data.Contents || []) {
        const parts = item.Key.split('/');
        if (parts.length >= 4) {
          const type = parts[2];
          stats.users.totalSize += item.Size;
          if (type === 'temp') {
            stats.users.tempFiles++;
          } else if (type === 'output') {
            stats.users.outputFiles++;
          }
        }
      }

      isTruncated = data.IsTruncated === 'true' || data.IsTruncated === true;
      marker = data.NextMarker || (data.Contents && data.Contents.length > 0 ? data.Contents[data.Contents.length - 1].Key : '');
    } catch (e) {
      break;
    }
  }

  // 统计模板
  marker = '';
  isTruncated = true;
  while (isTruncated) {
    try {
      const data = await listObjects('id-photo/', marker);

      for (const item of data.Contents || []) {
        stats.templates.count++;
        stats.templates.totalSize += item.Size;
      }

      isTruncated = data.IsTruncated === 'true' || data.IsTruncated === true;
      marker = data.NextMarker || (data.Contents && data.Contents.length > 0 ? data.Contents[data.Contents.length - 1].Key : '');
    } catch (e) {
      break;
    }
  }

  // 获取用户数
  const userIds = await getAllUserIds();
  stats.users.count = userIds.length;

  // 转换大小为 MB
  stats.users.totalSizeMB = (stats.users.totalSize / 1024 / 1024).toFixed(2);
  stats.templates.totalSizeMB = (stats.templates.totalSize / 1024 / 1024).toFixed(2);

  return stats;
}

module.exports = {
  COS_CONFIG,
  ASSET_COS_CONFIG,
  initCOS,
  listObjects,
  getAllUserPhotos,
  getUserPhotos,
  getAllUserIds,
  isCOSConfigured,
  uploadBase64ToCOS,
  uploadBufferToCOS,
  getCosClient,
  getAssetImages,
  extractKeyFromUrl,
  deleteObject,
  deleteObjects,
  cleanupExpiredTempFiles,
  getStorageStats
};
