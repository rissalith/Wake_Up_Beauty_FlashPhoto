/**
 * 时间工具模块 - 统一处理北京时间（UTC+8）
 */

/**
 * 获取北京时间的 ISO 格式字符串
 * @returns {string} 格式: 2026-01-28T20:00:00+08:00
 */
function getBeijingISOString() {
  const now = new Date();
  const offset = 8 * 60; // 北京时间 UTC+8
  const beijingTime = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60000);

  const year = beijingTime.getFullYear();
  const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getDate()).padStart(2, '0');
  const hour = String(beijingTime.getHours()).padStart(2, '0');
  const minute = String(beijingTime.getMinutes()).padStart(2, '0');
  const second = String(beijingTime.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`;
}

/**
 * 获取北京时间的日期字符串
 * @returns {string} 格式: 2026-01-28
 */
function getBeijingDateString() {
  const now = new Date();
  const offset = 8 * 60;
  const beijingTime = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60000);

  const year = beijingTime.getFullYear();
  const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * 格式化时间戳为北京时间显示
 * @param {number|string} timestamp - 时间戳或日期字符串
 * @param {string} format - 格式: 'full' | 'date' | 'time' | 'short'
 * @returns {string}
 */
function formatBeijingTime(timestamp, format = 'full') {
  if (!timestamp) {
    return '';
  }

  let date;
  if (typeof timestamp === 'string') {
    // iOS 兼容：先将日期字符串转换为 iOS 支持的格式
    // iOS 支持: "yyyy/MM/dd"、"yyyy/MM/dd HH:mm:ss"、"yyyy-MM-dd"、"yyyy-MM-ddTHH:mm:ss"
    let normalizedStr = timestamp
      .replace(/-/g, '/')  // 将 - 替换为 /
      .replace('T', ' ')   // 将 T 替换为空格
      .replace(/\+.*$/, ''); // 移除时区信息

    date = new Date(normalizedStr);
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) {
    return '';
  }

  // 转换为北京时间
  const offset = 8 * 60;
  const beijingTime = new Date(date.getTime() + (offset + date.getTimezoneOffset()) * 60000);

  const year = beijingTime.getFullYear();
  const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getDate()).padStart(2, '0');
  const hour = String(beijingTime.getHours()).padStart(2, '0');
  const minute = String(beijingTime.getMinutes()).padStart(2, '0');
  const second = String(beijingTime.getSeconds()).padStart(2, '0');

  switch (format) {
    case 'date':
      return `${year}-${month}-${day}`;
    case 'time':
      return `${hour}:${minute}:${second}`;
    case 'short':
      return `${month}-${day} ${hour}:${minute}`;
    case 'full':
    default:
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }
}

module.exports = {
  getBeijingISOString,
  getBeijingDateString,
  formatBeijingTime
};
