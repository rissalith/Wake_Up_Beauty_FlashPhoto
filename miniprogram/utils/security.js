/**
 * 图片安全审核工具
 * 使用微信内容安全接口进行图片审核
 */

const { API_BASE } = require('../config/api.js');

/**
 * 检查图片是否安全（本地临时文件）
 * @param {string} filePath - 本地图片临时路径
 * @returns {Promise<{safe: boolean, message: string}>}
 */
function checkImageSecurity(filePath) {
  return new Promise((resolve, reject) => {
    // 先压缩图片，减少上传大小
    wx.compressImage({
      src: filePath,
      quality: 50,
      success: (compressRes) => {
        doSecurityCheck(compressRes.tempFilePath, resolve, reject);
      },
      fail: (err) => {
        // 压缩失败，使用原图
        doSecurityCheck(filePath, resolve, reject);
      }
    });
  });
}

/**
 * 执行安全检查
 * 重要：审核失败时应拒绝，不能默认放行
 */
function doSecurityCheck(filePath, resolve, reject) {
  const url = `${API_BASE}/security/image-check`;

  wx.uploadFile({
    url: url,
    filePath: filePath,
    name: 'image',
    timeout: 30000,
    success: (res) => {
      try {
        const data = JSON.parse(res.data);
        if (data.code === 0 || data.code === 200) {
          if (data.data && data.data.safe === false) {
            resolve({
              safe: false,
              message: data.data.message || '图片包含敏感内容，请更换'
            });
          } else {
            resolve({
              safe: true,
              message: '图片安全'
            });
          }
        } else {
          // 接口返回错误，拒绝上传（安全优先）
          resolve({
            safe: false,
            message: '图片审核失败，请重试'
          });
        }
      } catch (e) {
        // 解析失败，拒绝上传（安全优先）
        resolve({
          safe: false,
          message: '图片审核异常，请重试'
        });
      }
    },
    fail: (err) => {
      // 网络错误，拒绝上传（安全优先，防止敏感图片绕过审核）
      resolve({
        safe: false,
        message: '网络异常，请检查网络后重试'
      });
    }
  });
}

/**
 * 批量检查图片安全性
 * @param {Array<string>} filePaths - 图片路径数组
 * @returns {Promise<{allSafe: boolean, results: Array}>}
 */
async function checkImagesSecurity(filePaths) {
  const results = [];
  let allSafe = true;

  for (const filePath of filePaths) {
    try {
      const result = await checkImageSecurity(filePath);
      results.push({
        filePath,
        ...result
      });
      if (!result.safe) {
        allSafe = false;
      }
    } catch (err) {
      // 异常时拒绝，不默认放行
      results.push({
        filePath,
        safe: false,
        message: '审核异常，请重试'
      });
      allSafe = false;
    }
  }

  return {
    allSafe,
    results
  };
}

/**
 * 显示安全提示弹窗
 * @param {string} message - 提示内容
 */
function showSecurityAlert(message) {
  wx.showModal({
    title: '图片审核未通过',
    content: message || '您上传的图片可能包含敏感内容，请更换其他图片',
    showCancel: false,
    confirmText: '我知道了'
  });
}

/**
 * 检查文本是否安全（调用后端微信 msg_sec_check）
 * @param {string} content - 要审核的文本内容
 * @param {string} openid - 用户openid（可选）
 * @param {number} scene - 场景值（1 资料；2 评论；3 论坛；4 社交日志）
 * @returns {Promise<{safe: boolean, message: string}>}
 */
function checkTextSecurity(content, openid = '', scene = 2) {
  return new Promise((resolve) => {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      resolve({ safe: true, message: '空内容' });
      return;
    }

    wx.request({
      url: `${API_BASE}/security/text-check`,
      method: 'POST',
      timeout: 10000,
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        content: content.trim(),
        openid: openid,
        scene: scene
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data.code === 200) {
          if (res.data.data && res.data.data.safe === false) {
            resolve({
              safe: false,
              message: res.data.data.message || '文本包含敏感内容，请修改'
            });
          } else {
            resolve({
              safe: true,
              message: '文本安全'
            });
          }
        } else {
          // 接口返回错误，拒绝提交（安全优先）
          resolve({
            safe: false,
            message: '文本审核失败，请重试'
          });
        }
      },
      fail: (err) => {
        // 网络错误，拒绝提交（安全优先）
        resolve({
          safe: false,
          message: '网络异常，请检查网络后重试'
        });
      }
    });
  });
}

/**
 * 显示文本安全提示弹窗
 * @param {string} message - 提示内容
 */
function showTextSecurityAlert(message) {
  wx.showModal({
    title: '内容审核未通过',
    content: message || '您输入的内容可能包含敏感信息，请修改后重试',
    showCancel: false,
    confirmText: '我知道了'
  });
}

module.exports = {
  checkImageSecurity,
  checkImagesSecurity,
  showSecurityAlert,
  checkTextSecurity,
  showTextSecurityAlert
};
