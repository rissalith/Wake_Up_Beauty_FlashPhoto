// 腾讯云COS工具类 - 用于存储用户照片
// 存储桶: xingmeishantu2-1310044729
// 地域: ap-shanghai

// API 基础地址（从 app.js 获取或使用默认值）
const getApiBaseUrl = () => {
  const app = getApp();
  return (app && app.globalData && app.globalData.apiBaseUrl) || 'https://pop-pub.com';
};

const COS_CONFIG = {
  bucket: 'xingmeishantu2-1310044729',
  region: 'ap-shanghai',
  // COS访问域名
  baseUrl: 'https://xingmeishantu2-1310044729.cos.ap-shanghai.myqcloud.com'
};

// 获取用户唯一标识（使用微信openid或本地生成的ID）
function getUserId() {
  let userId = wx.getStorageSync('cosUserId');
  if (!userId) {
    // 如果没有，生成一个唯一ID
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
    wx.setStorageSync('cosUserId', userId);
  }
  return userId;
}

// 获取用户的COS路径前缀（已废弃，保留兼容）
function getUserPath() {
  return getUserId();
}

// 生成扁平化的 COS key
// 格式: {userId}_{type}_{timestamp}_{random}.jpg
function generateFlatKey(userId, type, scene = '') {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 11);
  const scenePrefix = scene ? `${scene}_` : '';
  return `${userId}_${scenePrefix}${type}_${timestamp}_${randomStr}.jpg`;
}

// ========== 安全上传方式（推荐）==========
// 从服务端获取预签名上传 URL，然后直接 PUT 上传
// 这种方式不需要在小程序端存储密钥，更安全

// 从服务端获取上传凭证
async function getUploadCredential(type = 'temp', scene = '', fileName = null) {
  const userId = getUserId();
  const apiBaseUrl = getApiBaseUrl();

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBaseUrl}/api/config/cos/upload-credential`,
      method: 'POST',
      data: {
        userId,
        type,
        scene,
        fileName
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data.code === 0) {
          resolve(res.data.data);
        } else {
          reject(new Error(res.data.msg || '获取上传凭证失败'));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

// 使用预签名 URL 上传 base64 图片（安全方式）
async function uploadWithCredential(base64Data, type = 'temp', scene = '') {
  // 1. 获取上传凭证
  const credential = await getUploadCredential(type, scene);

  // 2. 将 base64 转为 ArrayBuffer
  const binary = wx.base64ToArrayBuffer(base64Data);

  // 3. 使用预签名 URL 上传
  return new Promise((resolve, reject) => {
    wx.request({
      url: credential.url,
      method: 'PUT',
      data: binary,
      header: {
        'Content-Type': 'image/jpeg'
      },
      success: (res) => {
        if (res.statusCode === 200 || res.statusCode === 204) {
          // 上传成功，返回最终的 COS URL
          const cosUrl = `${COS_CONFIG.baseUrl}/${credential.key}`;
          resolve({
            url: cosUrl,
            cosUrl: cosUrl,
            key: credential.key,
            fileName: credential.fileName,
            scene: scene || 'default'
          });
        } else {
          reject(new Error('上传失败: ' + res.statusCode));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

// 使用预签名 URL 上传微信临时文件（安全方式）
async function uploadTempFileWithCredential(tempFilePath, type = 'temp', scene = '', options = {}) {
  const { compress = true, quality = 80, maxWidth = 400 } = options;

  // 1. 压缩图片（如果启用）
  let uploadPath = tempFilePath;
  if (compress) {
    try {
      uploadPath = await compressImage(tempFilePath, { quality, maxWidth });
    } catch (e) {
      uploadPath = tempFilePath;
    }
  }

  // 2. 获取上传凭证
  const credential = await getUploadCredential(type, scene);

  // 3. 读取文件并上传
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: uploadPath,
      success: (readRes) => {
        wx.request({
          url: credential.url,
          method: 'PUT',
          data: readRes.data,
          header: {
            'Content-Type': 'image/jpeg'
          },
          success: (res) => {
            if (res.statusCode === 200 || res.statusCode === 204) {
              const cosUrl = `${COS_CONFIG.baseUrl}/${credential.key}`;
              resolve({
                url: cosUrl,
                cosUrl: cosUrl,
                key: credential.key,
                fileName: credential.fileName
              });
            } else {
              reject(new Error('上传失败: ' + res.statusCode));
            }
          },
          fail: reject
        });
      },
      fail: reject
    });
  });
}

// ========== 兼容旧版上传方式（匿名上传）==========

// 上传图片到COS
// type: 'temp' 或 'output'
// base64Data: 图片的base64数据（不含前缀）
// 返回: Promise<string> 图片的完整URL
function uploadImage(base64Data, type = 'temp', fileName = null) {
  return new Promise((resolve, reject) => {
    const userId = getUserId();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const ext = 'jpg'; // 默认jpg格式
    const finalFileName = fileName || `${timestamp}_${randomStr}.${ext}`;
    // 扁平化路径: {userId}_{type}_{filename}
    const key = `${userId}_${type}_${finalFileName}`;

    // 先将base64保存为临时文件
    const tempFilePath = `${wx.env.USER_DATA_PATH}/temp_upload_${timestamp}.${ext}`;

    wx.getFileSystemManager().writeFile({
      filePath: tempFilePath,
      data: base64Data,
      encoding: 'base64',
      success: () => {
        // 使用微信小程序的上传API
        wx.uploadFile({
          url: `${COS_CONFIG.baseUrl}/${key}`,
          filePath: tempFilePath,
          name: 'file',
          header: {
            'Content-Type': 'image/jpeg'
          },
          success: (res) => {
            if (res.statusCode === 200 || res.statusCode === 204) {
              const imageUrl = `${COS_CONFIG.baseUrl}/${key}`;
              // 删除临时文件
              wx.getFileSystemManager().unlink({
                filePath: tempFilePath,
                fail: () => {} // 忽略删除失败
              });
              resolve(imageUrl);
            } else {
              reject(new Error('上传失败: ' + res.statusCode));
            }
          },
          fail: (err) => {
          // 静默处理
          reject(err);
        }
      });
    },
    fail: (err) => {
      // 静默处理
      reject(err);
    }
  });
});
}

// 使用PUT方式直接上传（更简单的方式）
function uploadImageDirect(base64Data, type = 'temp') {
  return new Promise((resolve, reject) => {
    const userId = getUserId();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const fileName = `${timestamp}_${randomStr}.jpg`;
    // 扁平化路径: {userId}_{type}_{filename}
    const key = `${userId}_${type}_${fileName}`;
    const imageUrl = `${COS_CONFIG.baseUrl}/${key}`;

    // 先保存为本地临时文件
    const tempFilePath = `${wx.env.USER_DATA_PATH}/temp_upload_${timestamp}.jpg`;

    wx.getFileSystemManager().writeFile({
      filePath: tempFilePath,
      data: base64Data,
      encoding: 'base64',
      success: () => {
        // 使用wx.uploadFile上传到COS（需要COS开启匿名上传或使用签名）
        // 由于COS默认不支持匿名上传，我们需要使用签名URL或者服务端代理
        // 这里提供一个备选方案：保存URL到历史记录，实际图片保留在本地

        // 方案1: 如果COS开启了匿名写入权限
        wx.request({
          url: imageUrl,
          method: 'PUT',
          data: wx.getFileSystemManager().readFileSync(tempFilePath),
          header: {
            'Content-Type': 'image/jpeg'
          },
          success: (res) => {
            if (res.statusCode === 200 || res.statusCode === 204) {
              // 删除本地临时文件
              try {
                wx.getFileSystemManager().unlinkSync(tempFilePath);
              } catch (e) {}
              resolve(imageUrl);
            } else {
              // 上传失败，返回本地路径作为备选
              resolve(tempFilePath);
            }
          },
          fail: () => {
            // 上传失败，返回本地路径作为备选
            resolve(tempFilePath);
          }
        });
      },
      fail: reject
    });
  });
}

// 简化版：保存图片并返回可用的路径
// 优先尝试上传到COS，失败则保存在本地持久化目录
function saveImage(base64Data, type = 'temp') {
  return new Promise((resolve, reject) => {
    const userId = getUserId();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const fileName = `${timestamp}_${randomStr}.jpg`;

    // 本地持久化路径（不会被自动清理）
    const localPath = `${wx.env.USER_DATA_PATH}/${type}_${fileName}`;

    // 保存到本地
    wx.getFileSystemManager().writeFile({
      filePath: localPath,
      data: base64Data,
      encoding: 'base64',
      success: () => {
        // 尝试上传到COS（异步，不阻塞）
        // 扁平化路径: {userId}_{type}_{filename}
        const key = `${userId}_${type}_${fileName}`;
        const cosUrl = `${COS_CONFIG.baseUrl}/${key}`;

        // 异步上传到COS作为备份
        uploadToCOS(localPath, key).then(url => {
          // COS上传成功
        }).catch(err => {
          // 静默处理
        });

        // 立即返回本地路径，不等待COS上传
        resolve({
          localPath: localPath,
          cosUrl: cosUrl,
          fileName: fileName
        });
      },
      fail: (err) => {
        // 静默处理
        reject(err);
      }
    });
  });
}

// 只上传到COS，不保存本地文件
// 返回COS URL，上传失败直接reject
// scene: 场景类型 'idphoto'(证件照), 'professional'(职业照), 'avatar'(头像), 'feedback'(反馈)
// type: 图片类型 'temp'(原图), 'output'(结果图)
// 优先使用预签名方式（安全），失败时回退到匿名上传
function saveImageToCOS(base64Data, type = 'output', scene = '') {
  return new Promise(async (resolve, reject) => {
    // 优先尝试使用预签名方式上传（安全）
    try {
      const result = await uploadWithCredential(base64Data, type, scene);
      resolve(result);
      return;
    } catch (credentialErr) {
      console.log('[COS] 预签名上传失败，尝试匿名上传:', credentialErr.message);
    }

    // 回退到匿名上传方式（需要 COS 开启匿名写入权限）
    const userId = getUserId();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 11);
    const fileName = `${timestamp}_${randomStr}.jpg`;

    // 扁平化路径: {userId}_{scene}_{type}_{filename} 或 {userId}_{type}_{filename}
    let key;
    if (scene) {
      key = `${userId}_${scene}_${type}_${fileName}`;
    } else {
      key = `${userId}_${type}_${fileName}`;
    }
    const cosUrl = `${COS_CONFIG.baseUrl}/${key}`;

    // 直接使用base64上传到COS，不保存本地
    uploadBase64ToCOS(base64Data, key)
      .then(url => {
        resolve({
          url: url,
          cosUrl: url,
          localPath: null,
          fileName: fileName,
          scene: scene || 'default'
        });
      })
      .catch(err => {
        reject(new Error('COS上传失败: ' + (err.message || err)));
      });
  });
}

// 直接将base64数据上传到COS（不经过本地文件）
function uploadBase64ToCOS(base64Data, key) {
  return new Promise((resolve, reject) => {
    const cosUrl = `${COS_CONFIG.baseUrl}/${key}`;

    // 将base64转为ArrayBuffer
    const binary = wx.base64ToArrayBuffer(base64Data);

    wx.request({
      url: cosUrl,
      method: 'PUT',
      data: binary,
      header: {
        'Content-Type': 'image/jpeg'
      },
      success: (res) => {
        if (res.statusCode === 200 || res.statusCode === 204) {
          resolve(cosUrl);
        } else {
          reject(new Error('COS上传失败: ' + res.statusCode));
        }
      },
      fail: (err) => {
        // 静默处理
        reject(err);
      }
    });
  });
}

// 上传本地文件到COS（使用PUT方式，需要COS开启匿名写入权限）
function uploadToCOS(localFilePath, key) {
  return new Promise((resolve, reject) => {
    const cosUrl = `${COS_CONFIG.baseUrl}/${key}`;

    // 读取本地文件内容
    try {
      const fileData = wx.getFileSystemManager().readFileSync(localFilePath);

      // 使用PUT方式上传到COS
      wx.request({
        url: cosUrl,
        method: 'PUT',
        data: fileData,
        header: {
          'Content-Type': 'image/jpeg'
        },
        success: (res) => {
          if (res.statusCode === 200 || res.statusCode === 204) {
            resolve(cosUrl);
          } else {
            reject(new Error('上传状态码: ' + res.statusCode + ', 响应: ' + JSON.stringify(res.data)));
          }
        },
        fail: (err) => {
          // 静默处理
          reject(err);
        }
      });
    } catch (e) {
      // 静默处理
      reject(e);
    }
  });
}

// 从URL或本地路径读取图片为base64
function readImageAsBase64(imagePath) {
  return new Promise((resolve, reject) => {
    // 判断是网络图片还是本地文件
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      // 网络图片，先下载
      wx.downloadFile({
        url: imagePath,
        success: (res) => {
          if (res.statusCode === 200) {
            wx.getFileSystemManager().readFile({
              filePath: res.tempFilePath,
              encoding: 'base64',
              success: (readRes) => resolve(readRes.data),
              fail: reject
            });
          } else {
            reject(new Error('下载失败: ' + res.statusCode));
          }
        },
        fail: reject
      });
    } else {
      // 本地文件
      wx.getFileSystemManager().readFile({
        filePath: imagePath,
        encoding: 'base64',
        success: (res) => resolve(res.data),
        fail: reject
      });
    }
  });
}

// 初始化用户目录（首次使用时调用）
function initUserDirectory() {
  const userId = getUserId();
  // COS会自动创建目录，无需手动创建
  return userId;
}

// 压缩图片（用于头像等场景）
function compressImage(tempFilePath, options = {}) {
  return new Promise((resolve, reject) => {
    const { quality = 80, maxWidth = 400 } = options;

    // 先获取图片信息
    wx.getImageInfo({
      src: tempFilePath,
      success: (info) => {
        // 计算压缩后的尺寸
        let targetWidth = info.width;
        let targetHeight = info.height;

        if (info.width > maxWidth) {
          targetWidth = maxWidth;
          targetHeight = Math.round(info.height * (maxWidth / info.width));
        }

        // 使用 canvas 压缩
        wx.compressImage({
          src: tempFilePath,
          quality: quality,
          success: (compressRes) => {
            resolve(compressRes.tempFilePath);
          },
          fail: (err) => {
            // 压缩失败时使用原图
            resolve(tempFilePath);
          }
        });
      },
      fail: (err) => {
        resolve(tempFilePath);
      }
    });
  });
}

// 上传微信临时文件到COS（适用于头像等微信API返回的临时路径）
// options: { compress: true, quality: 80, maxWidth: 400 }
// 优先使用预签名方式（安全），失败时回退到匿名上传
function uploadWxTempFile(tempFilePath, key, options = {}) {
  return new Promise(async (resolve, reject) => {
    const { compress = true, quality = 80, maxWidth = 400 } = options;

    // 解析 key 获取 type 和 scene
    const parts = key.split('/');
    let type = 'temp';
    let scene = '';
    if (parts.length >= 4 && parts[0] === 'users') {
      // key 格式: users/{userId}/{scene}/{type}/{fileName} 或 users/{userId}/{type}/{fileName}
      if (parts.length >= 5) {
        scene = parts[2];
        type = parts[3];
      } else {
        type = parts[2];
      }
    }

    // 优先尝试使用预签名方式上传
    try {
      const result = await uploadTempFileWithCredential(tempFilePath, type, scene, options);
      resolve(result.url);
      return;
    } catch (credentialErr) {
      console.log('[COS] 预签名上传失败，尝试匿名上传:', credentialErr.message);
    }

    // 回退到匿名上传方式
    const cosUrl = `${COS_CONFIG.baseUrl}/${key}`;

    let uploadPath = tempFilePath;

    // 如果启用压缩（默认启用）
    if (compress) {
      try {
        uploadPath = await compressImage(tempFilePath, { quality, maxWidth });
      } catch (e) {
        uploadPath = tempFilePath;
      }
    }

    // 直接用 PUT 方式上传（COS 不支持 multipart/form-data）
    wx.getFileSystemManager().readFile({
      filePath: uploadPath,
      success: (readRes) => {
        wx.request({
          url: cosUrl,
          method: 'PUT',
          data: readRes.data,
          header: {
            'Content-Type': 'image/jpeg'
          },
          success: (res) => {
            if (res.statusCode === 200 || res.statusCode === 204) {
              resolve(cosUrl);
            } else {
              reject(new Error('上传失败: ' + res.statusCode));
            }
          },
          fail: (err) => {
            reject(err);
          }
        });
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

module.exports = {
  COS_CONFIG,
  getUserId,
  getUserPath,
  // 安全上传方式（推荐）
  getUploadCredential,
  uploadWithCredential,
  uploadTempFileWithCredential,
  // 兼容旧版
  uploadImage,
  uploadImageDirect,
  saveImage,
  saveImageToCOS,
  uploadBase64ToCOS,
  uploadToCOS,
  uploadWxTempFile,
  compressImage,
  readImageAsBase64,
  initUserDirectory
};
