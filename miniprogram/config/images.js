// 图片资源配置 - 使用腾讯云 COS
// 腾讯云 COS 存储桶: xingmeishantu-1310044729

// CDN 图片基础路径
const CDN_BASE = 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com';

// 版本号 - 更新此值可强制刷新图片缓存
const IMG_VERSION = 'v8';

// 图片资源映射
const images = {
  // 通用资源
  logo: `${CDN_BASE}/logo.png?${IMG_VERSION}`,                           // 应用Logo
  shareCover: `${CDN_BASE}/share-cover.png?${IMG_VERSION}`,              // 分享封面图
  scanCode: `${CDN_BASE}/scan-code.png?${IMG_VERSION}`,                  // 小程序码/二维码(海报用)

  // 主要大图
  titleZhCN: `${CDN_BASE}/title-zh-cn.png?${IMG_VERSION}`,            // 导航栏标题图-简体
  titleEn: `${CDN_BASE}/title-en.png?${IMG_VERSION}`,                  // 导航栏标题图-英文
  camera: `${CDN_BASE}/share-cover.png?${IMG_VERSION}`,              // Banner背景图(使用分享封面替代)
  featureZhCN: `${CDN_BASE}/feature-zh-cn.png?${IMG_VERSION}`,       // 特色功能图-简体
  featureEn: `${CDN_BASE}/feature-en.png?${IMG_VERSION}`,            // 特色功能图-英文

  // 场景图标
  idPhoto: `${CDN_BASE}/id-photo.png?${IMG_VERSION}`,                // 证件照图标
  professional: `${CDN_BASE}/professional.png?${IMG_VERSION}`,      // 职业照图标
  portrait: `${CDN_BASE}/portrait.png?${IMG_VERSION}`,               // 写真照图标
  family: `${CDN_BASE}/family.png?${IMG_VERSION}`,                   // 全家福图标
  pet: `${CDN_BASE}/pet.png?${IMG_VERSION}`,                         // 宠物写真图标
  wedding: `${CDN_BASE}/wedding.png?${IMG_VERSION}`,                 // 婚纱照图标

  // TabBar图标
  tabHome: `${CDN_BASE}/tab-home.png?${IMG_VERSION}`,                // 首页图标
  tabHomeActive: `${CDN_BASE}/tab-home-active.png?${IMG_VERSION}`,   // 首页图标(选中)
  tabHistory: `${CDN_BASE}/tab-history.png?${IMG_VERSION}`,          // 记录图标
  tabHistoryActive: `${CDN_BASE}/tab-history-active.png?${IMG_VERSION}`, // 记录图标(选中)
  tabMine: `${CDN_BASE}/tab-mine.png?${IMG_VERSION}`,                // 我的图标
  tabMineActive: `${CDN_BASE}/tab-mine-active.png?${IMG_VERSION}`,   // 我的图标(选中)
};

// Banner轮播图配置
const BANNER_COUNT = 3; // 每个语言版本的Banner图片数量

// 根据语言获取对应的Banner文件夹
function getBannerFolder(lang) {
  const folderMap = {
    'zh-CN': 'banner',      // 简体中文
    'en': 'banner-en'       // 英文
  };
  return folderMap[lang] || 'banner';
}

// 获取指定语言的Banner列表
function getBannerList(lang = 'zh-CN') {
  const folder = getBannerFolder(lang);
  const list = [];
  for (let i = 1; i <= BANNER_COUNT; i++) {
    list.push(`${CDN_BASE}/${folder}/${i}.png?${IMG_VERSION}`);
  }
  return list;
}

// 默认Banner列表（简体中文）
const bannerList = getBannerList('zh-CN');

// 获取图片URL
function getImage(key) {
  return images[key] || '';
}

// 获取所有图片配置
function getAllImages() {
  return images;
}

module.exports = {
  CDN_BASE,
  images,
  bannerList,
  getBannerList,
  getImage,
  getAllImages
};
