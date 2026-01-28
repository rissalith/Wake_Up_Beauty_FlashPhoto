/**
 * 时间工具模块 - 统一处理北京时间（UTC+8）
 * 服务器端使用，与前端 miniprogram/utils/timeUtil.js 保持一致
 */

/**
 * 获取北京时间的日期字符串
 * @returns {string} 格式: 2026-01-28
 */
function getBeijingDateString() {
  const now = new Date();
  const offset = 8 * 60; // 北京时间 UTC+8
  const beijingTime = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60000);

  const year = beijingTime.getFullYear();
  const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * 获取北京时间的 ISO 格式字符串
 * @returns {string} 格式: 2026-01-28T20:00:00+08:00
 */
function getBeijingISOString() {
  const now = new Date();
  const offset = 8 * 60;
  const beijingTime = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60000);

  const year = beijingTime.getFullYear();
  const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getDate()).padStart(2, '0');
  const hour = String(beijingTime.getHours()).padStart(2, '0');
  const minute = String(beijingTime.getMinutes()).padStart(2, '0');
  const second = String(beijingTime.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`;
}

module.exports = {
  getBeijingDateString,
  getBeijingISOString
};
