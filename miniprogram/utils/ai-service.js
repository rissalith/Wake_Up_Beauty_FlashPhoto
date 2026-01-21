/**
 * AI 服务封装
 * 通过后端代理调用 AI 接口，避免前端暴露密钥
 */

const { API_BASE } = require('../config/api.js');

/**
 * 调用 AI 生成图片
 * @param {string} prompt - 提示词
 * @param {string} imageBase64 - 图片 base64 数据（可选）
 * @param {string} mimeType - 图片 MIME 类型（可选，默认 image/jpeg）
 * @returns {Promise<{imageData: string, mimeType: string}>}
 */
function generateImage(prompt, imageBase64, mimeType = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    const requestData = {
      prompt,
      imageBase64,
      mimeType
    };

    // 计算请求大小
    const requestStr = JSON.stringify(requestData);
    const requestSizeKB = Math.round(requestStr.length / 1024);

    if (requestSizeKB > 30000) {
      reject(new Error('图片过大，请上传更小的照片'));
      return;
    }

    wx.request({
      url: `${API_BASE}/ai/generate-image`,
      method: 'POST',
      timeout: 120000, // 2分钟超时
      header: {
        'Content-Type': 'application/json'
      },
      data: requestData,
      success: (res) => {
        if (res.statusCode === 200 && res.data.code === 200) {
          const { imageData, mimeType: resMimeType } = res.data.data;
          if (imageData) {
            resolve({ imageData, mimeType: resMimeType });
          } else {
            reject(new Error('未获取到图片'));
          }
        } else {
          // 提取错误信息
          let errorMsg = '服务器错误';
          if (res.data && res.data.message) {
            errorMsg = res.data.message;
          } else if (res.data && res.data.error) {
            errorMsg = res.data.error;
          }
          reject(new Error(errorMsg));
        }
      },
      fail: (err) => {
        reject(new Error('网络请求失败: ' + (err.errMsg || '')));
      }
    });
  });
}

module.exports = {
  generateImage
};
