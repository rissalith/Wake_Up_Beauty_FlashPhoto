/**
 * 图标配置文件
 * 统一管理图标路径，方便从本地切换到 CDN
 *
 * 注意：微信小程序真机对本地 SVG 支持有限，建议使用 CDN 路径
 */

// CDN 基础路径 - 将 SVG 图标上传到 COS 后使用
const COS_BASE = 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com/icon';

// 是否使用 CDN（设为 true 时使用 CDN 路径，设为 false 时使用本地路径）
const USE_CDN = true;

// 本地图标基础路径
const LOCAL_BASE = '/pages/flashphoto/icons';

/**
 * 获取图标路径
 * @param {string} name - 图标名称（不含扩展名）
 * @param {string} ext - 扩展名，默认 'svg'
 * @returns {string} 图标完整路径
 */
function getIconPath(name, ext = 'svg') {
  if (USE_CDN) {
    return `${COS_BASE}/${name}.${ext}`;
  }
  return `${LOCAL_BASE}/${name}.${ext}`;
}

// 预定义的图标路径（便于在 WXML 中使用）
const ICONS = {
  // 通用
  add: getIconPath('add'),
  close: getIconPath('close'),
  check: getIconPath('check'),
  checkWhite: getIconPath('check-white'),
  success: getIconPath('success'),
  error: getIconPath('error'),

  // 功能
  camera: getIconPath('camera'),
  beauty: getIconPath('beauty'),
  palette: getIconPath('palette'),
  clothing: getIconPath('clothing'),
  scene: getIconPath('scene'),
  eye: getIconPath('eye'),

  // 性别
  male: getIconPath('male'),
  female: getIconPath('female'),

  // 操作
  minus: getIconPath('minus'),
  plus: getIconPath('plus'),
  download: getIconPath('download'),
  delete: getIconPath('delete'),
  trash: getIconPath('trash'),
  share: getIconPath('share'),

  // 其他
  arrowRight: getIconPath('arrow-right'),
};

module.exports = {
  USE_CDN,
  COS_BASE,
  LOCAL_BASE,
  getIconPath,
  ICONS
};
