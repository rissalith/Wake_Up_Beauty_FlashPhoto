/**
 * 资源预加载器
 * 预加载场景配置和图片资源，提升页面加载速度
 *
 * 策略：
 * 1. 小程序启动时只预加载当前语言的图片（节省流量）
 * 2. 登录后预加载场景详情配置
 */

const configManager = require('./configManager');
const { images, getBannerList, CDN_BASE } = require('../config/images');

// 预加载状态
const preloadState = {
  scenesLoaded: false,
  imagesLoaded: false,
  sceneDetailsCache: {},  // 场景详情缓存
  loading: false,
  imagePreloadStarted: false,
  currentLang: null  // 已预加载的语言
};

/**
 * 立即预加载当前语言图片（小程序启动时调用）
 */
function preloadAllImages() {
  if (preloadState.imagePreloadStarted) {
    return;
  }
  preloadState.imagePreloadStarted = true;
  preloadState.currentLang = wx.getStorageSync('language') || 'zh-CN';

  // 异步执行，不阻塞启动
  Promise.all([
    preloadImages(),
    preloadBanners()
  ]).then(() => {
    preloadState.imagesLoaded = true;
  }).catch(() => {});
}

/**
 * 预加载所有资源（登录后调用）
 */
async function preloadAll() {
  if (preloadState.loading) {
    return;
  }

  preloadState.loading = true;

  try {
    // 场景详情预加载
    await preloadSceneDetails();

    // 如果图片还没预加载，也一起加载
    if (!preloadState.imagesLoaded) {
      await Promise.all([
        preloadImages(),
        preloadBanners()
      ]);
    }
  } catch (error) {
    // 静默处理
  } finally {
    preloadState.loading = false;
  }
}

/**
 * 预加载所有场景详情配置
 */
async function preloadSceneDetails() {
  try {
    // 确保配置已加载
    await configManager.init();
    const scenes = configManager.getActiveScenes();

    if (!scenes || scenes.length === 0) {
      return;
    }

    // 预加载场景图标
    preloadSceneIcons(scenes);

    // 获取当前语言
    const currentLang = wx.getStorageSync('language') || 'zh-CN';

    // 并行加载所有场景详情（两种语言都加载）
    const languages = ['zh-CN', 'en'];
    const loadPromises = [];

    for (const langCode of languages) {
      for (const scene of scenes) {
        const sceneId = scene.scene_key || scene.id;
        const cacheKey = `${sceneId}_${langCode}`;

        // 如果已缓存，跳过
        if (preloadState.sceneDetailsCache[cacheKey]) {
          continue;
        }

        loadPromises.push((async () => {
          try {
            // 使用指定语言获取对应语言的配置
            const res = await configManager.getSceneDetail(sceneId, langCode);
            if (res) {
              preloadState.sceneDetailsCache[cacheKey] = res;
            }
          } catch (e) {
            // 静默失败
          }
        })());
      }
    }

    await Promise.all(loadPromises);
    preloadState.scenesLoaded = true;
  } catch (error) {
    // 静默处理
  }
}

/**
 * 预加载场景图标
 */
function preloadSceneIcons(scenes) {
  const iconUrls = scenes
    .map(s => s.icon)
    .filter(Boolean);

  if (iconUrls.length === 0) return;

  iconUrls.forEach(url => preloadSingleImage(url));
}

/**
 * 预加载核心图片资源（只加载当前语言版本）
 */
async function preloadImages() {
  try {
    const lang = wx.getStorageSync('language') || 'zh-CN';
    const isZh = lang.includes('zh');

    // 核心图片列表 - 只加载当前语言版本
    const coreImages = [
      // 通用
      images.logo,
      images.shareCover,
      // 当前语言版本
      isZh ? images.titleZhCN : images.titleEn,
      isZh ? images.featureZhCN : images.featureEn,
      // 场景图标
      images.idPhoto,
      images.professional,
      images.portrait,
      images.family,
      images.pet,
      images.wedding,
      // TabBar 图标
      images.tabHome,
      images.tabHomeActive,
      images.tabHistory,
      images.tabHistoryActive,
      images.tabMine,
      images.tabMineActive
    ].filter(Boolean);

    // 使用 wx.getImageInfo 预加载图片到缓存
    const loadPromises = coreImages.map(url => preloadSingleImage(url));
    await Promise.all(loadPromises);
  } catch (error) {
    // 静默处理
  }
}

/**
 * 预加载Banner图片（只加载当前语言版本）
 */
async function preloadBanners() {
  try {
    const lang = wx.getStorageSync('language') || 'zh-CN';
    const banners = getBannerList(lang);

    const loadPromises = banners.map(url => preloadSingleImage(url));
    await Promise.all(loadPromises);
  } catch (error) {
    // 静默处理
  }
}

/**
 * 预加载单张图片
 */
function preloadSingleImage(url) {
  return new Promise((resolve) => {
    wx.getImageInfo({
      src: url,
      success: () => resolve(true),
      fail: () => resolve(false)  // 失败也resolve，不阻塞其他图片
    });
  });
}

/**
 * 预加载场景选项图片（如服装、发型等）
 * @param {string} sceneId 场景ID
 */
async function preloadSceneOptionImages(sceneId) {
  try {
    const currentLang = wx.getStorageSync('language') || 'zh-CN';
    const cacheKey = `${sceneId}_${currentLang}`;
    const sceneDetail = preloadState.sceneDetailsCache[cacheKey];

    if (!sceneDetail || !sceneDetail.steps) {
      return;
    }

    const imageUrls = [];

    // 收集所有选项图片
    sceneDetail.steps.forEach(step => {
      if (step.options) {
        step.options.forEach(opt => {
          if (opt.image) {
            imageUrls.push(opt.image);
          }
        });
      }
    });

    if (imageUrls.length === 0) {
      return;
    }

    const loadPromises = imageUrls.map(url => preloadSingleImage(url));
    await Promise.all(loadPromises);
  } catch (error) {
    // 静默处理
  }
}

/**
 * 获取缓存的场景详情
 * @param {string} sceneId 场景ID
 * @param {string} lang 语言
 * @returns {Object|null} 场景详情
 */
function getCachedSceneDetail(sceneId, lang = 'zh-CN') {
  const cacheKey = `${sceneId}_${lang}`;
  return preloadState.sceneDetailsCache[cacheKey] || null;
}

/**
 * 清除场景详情缓存（语言切换时调用）
 */
function clearSceneCache() {
  preloadState.sceneDetailsCache = {};
  preloadState.scenesLoaded = false;
}

/**
 * 语言切换后的处理
 * 注意：图片已经预加载了所有语言版本，不需要重新加载
 * 场景详情也已经预加载了两种语言，直接使用缓存即可
 */
async function onLanguageChange() {
  const newLang = wx.getStorageSync('language') || 'zh-CN';

  // 检查新语言的场景详情是否已缓存
  const scenes = configManager.getActiveScenes();
  if (scenes && scenes.length > 0) {
    const firstSceneId = scenes[0].scene_key || scenes[0].id;
    const cacheKey = `${firstSceneId}_${newLang}`;

    if (!preloadState.sceneDetailsCache[cacheKey]) {
      // 新语言的缓存不存在，需要预加载
      await preloadSceneDetails();
    }
  }
}

/**
 * 检查预加载状态
 */
function isPreloaded() {
  return preloadState.scenesLoaded && preloadState.imagesLoaded;
}

module.exports = {
  preloadAllImages,  // 启动时立即调用
  preloadAll,        // 登录后调用
  preloadSceneDetails,
  preloadImages,
  preloadBanners,
  preloadSceneOptionImages,
  getCachedSceneDetail,
  clearSceneCache,
  onLanguageChange,
  isPreloaded
};
