// 图片资源配置 - 使用腾讯云 COS
// 腾讯云 COS 存储桶: xingmeishantu-1310044729

// CDN 图片基础路径
const CDN_BASE = 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com';

// 图片资源映射（不带版本号，使用 COS 默认缓存策略）
const images = {
  // 通用资源
  logo: `${CDN_BASE}/logo.png`,
  shareCover: `${CDN_BASE}/share-cover.png`,
  scanCode: `${CDN_BASE}/scan-code.png`,

  // 主要大图
  titleZhCN: `${CDN_BASE}/title-zh-cn.png`,
  titleEn: `${CDN_BASE}/title-en.png`,
  camera: `${CDN_BASE}/share-cover.png`,
  featureZhCN: `${CDN_BASE}/feature-zh-cn.png`,
  featureEn: `${CDN_BASE}/feature-en.png`,

  // 场景图标
  idPhoto: `${CDN_BASE}/id-photo.png`,
  professional: `${CDN_BASE}/professional.png`,
  portrait: `${CDN_BASE}/portrait.png`,
  family: `${CDN_BASE}/family.png`,
  pet: `${CDN_BASE}/pet.png`,
  wedding: `${CDN_BASE}/wedding.png`,

  // TabBar图标
  tabHome: `${CDN_BASE}/tab-home.png`,
  tabHomeActive: `${CDN_BASE}/tab-home-active.png`,
  tabCreator: `${CDN_BASE}/tab-creator.png`,
  tabCreatorActive: `${CDN_BASE}/tab-creator-active.png`,
  tabHistory: `${CDN_BASE}/tab-history.png`,
  tabHistoryActive: `${CDN_BASE}/tab-history-active.png`,
  tabMine: `${CDN_BASE}/tab-mine.png`,
  tabMineActive: `${CDN_BASE}/tab-mine-active.png`,
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
    list.push(`${CDN_BASE}/${folder}/${i}.png`);
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
