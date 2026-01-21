// 证件照风格选项配置 - 穿着/发型/表情
// COS 路径: id-photo/{gender}/{category}/{filename}.png

const imageConfig = require('./images.js');
const CDN_BASE = imageConfig.CDN_BASE;
const IMG_VERSION = 'v3'; // 独立版本号，更新图片时修改此值

// 生成图片URL
function getStyleImageUrl(gender, category, filename) {
  return `${CDN_BASE}/id-photo/${gender}/${category}/${encodeURIComponent(filename)}.png?${IMG_VERSION}`;
}

// 男士风格选项
const maleStyles = {
  // 穿着
  dress: [
    { id: 'shirt-white', name: '白色衬衫', nameEn: 'White Shirt', nameTw: '白色襯衫', file: '衬衫-白色' },
    { id: 'shirt-blue', name: '蓝色衬衫', nameEn: 'Blue Shirt', nameTw: '藍色襯衫', file: '衬衫-蓝色' },
    { id: 'shirt-gray', name: '深灰色衬衫', nameEn: 'Dark Gray Shirt', nameTw: '深灰色襯衫', file: '衬衫-深灰色' },
    { id: 'shirt-black', name: '黑色衬衫', nameEn: 'Black Shirt', nameTw: '黑色襯衫', file: '衬衫-黑色' },
    { id: 'suit-blue', name: '蓝色西装', nameEn: 'Blue Suit', nameTw: '藍色西裝', file: '西装-蓝色' },
    { id: 'suit-blue-light', name: '蓝色西装+浅蓝衬衫', nameEn: 'Blue Suit + Light Blue Shirt', nameTw: '藍色西裝+淺藍襯衫', file: '西装-蓝色-浅蓝衬衫' },
    { id: 'suit-blue-beige', name: '蓝色西装+米白衬衫', nameEn: 'Blue Suit + Beige Shirt', nameTw: '藍色西裝+米白襯衫', file: '西装-蓝色外套-米白衬衫' },
    { id: 'suit-gray', name: '深灰色西装', nameEn: 'Dark Gray Suit', nameTw: '深灰色西裝', file: '西装-深灰色' },
    { id: 'suit-black', name: '深黑色西装', nameEn: 'Black Suit', nameTw: '深黑色西裝', file: '西装-深黑色' }
  ],
  // 发型
  hair: [
    { id: 'buzz', name: '寸头', nameEn: 'Buzz Cut', nameTw: '寸頭', file: '寸头' },
    { id: 'side-part', name: '微偏分', nameEn: 'Slight Side Part', nameTw: '微偏分', file: '微偏分' },
    { id: 'short-side', name: '短侧分', nameEn: 'Short Side Part', nameTw: '短側分', file: '短侧分' },
    { id: 'textured', name: '短碎发', nameEn: 'Textured Crop', nameTw: '短碎髮', file: '短碎发' }
  ],
  // 表情
  expression: [
    { id: 'smile', name: '不露齿微笑', nameEn: 'Closed Smile', nameTw: '不露齒微笑', file: '不漏齿微笑' },
    { id: 'slight-teeth', name: '轻微露齿笑', nameEn: 'Slight Teeth Smile', nameTw: '輕微露齒笑', file: '轻微漏齿笑' },
    { id: 'big-teeth', name: '大露齿笑', nameEn: 'Big Teeth Smile', nameTw: '大露齒笑', file: '大漏齿笑' }
  ]
};

// 女士风格选项
const femaleStyles = {
  // 穿着
  dress: [
    { id: 'shirt-white', name: '白衬衫', nameEn: 'White Shirt', nameTw: '白襯衫', file: '白衬衫' },
    { id: 'shirt-beige', name: '米白衬衫', nameEn: 'Beige Shirt', nameTw: '米白襯衫', file: '米白衬衫' },
    { id: 'shirt-light-blue', name: '浅蓝衬衫', nameEn: 'Light Blue Shirt', nameTw: '淺藍襯衫', file: '浅蓝衬衫' },
    { id: 'shirt-dark-blue', name: '深蓝色衬衫', nameEn: 'Dark Blue Shirt', nameTw: '深藍色襯衫', file: '深蓝色衬衫' },
    { id: 'shirt-dark-gray', name: '深灰色衬衫', nameEn: 'Dark Gray Shirt', nameTw: '深灰色襯衫', file: '深灰色衬衫' },
    { id: 'shirt-black', name: '黑色衬衫', nameEn: 'Black Shirt', nameTw: '黑色襯衫', file: '黑色衬衫' },
    { id: 'suit-black-scarf', name: '黑西装+白衬衫+丝巾', nameEn: 'Black Suit + White Shirt + Scarf', nameTw: '黑西裝+白襯衫+絲巾', file: '黑西装+白衬衫+丝巾' },
    { id: 'suit-black-tie', name: '黑西装+白衬衫+领带', nameEn: 'Black Suit + White Shirt + Tie', nameTw: '黑西裝+白襯衫+領帶', file: '黑西装+白衬衫+领带' },
    { id: 'suit-gray-scarf', name: '深灰西装+白衬衫+丝巾', nameEn: 'Dark Gray Suit + Scarf', nameTw: '深灰西裝+白襯衫+絲巾', file: '深灰色西装+白衬衫+丝巾' },
    { id: 'suit-gray-tie', name: '深灰西装+白衬衫+领带', nameEn: 'Dark Gray Suit + Tie', nameTw: '深灰西裝+白襯衫+領帶', file: '深灰色西装+白衬衫+领带' },
    { id: 'suit-blue-scarf', name: '深蓝西装+白衬衫+丝巾', nameEn: 'Navy Suit + Scarf', nameTw: '深藍西裝+白襯衫+絲巾', file: '深蓝色西装+白衬衫+丝巾' },
    { id: 'suit-blue-tie', name: '深蓝西装+白衬衫+领带', nameEn: 'Navy Suit + Tie', nameTw: '深藍西裝+白襯衫+領帶', file: '深蓝色西装+白衬衫+领带' }
  ],
  // 发型
  hair: [
    { id: 'center-part', name: '中分', nameEn: 'Center Part', nameTw: '中分', file: '中分' },
    { id: 'low-bun', name: '低丸子头', nameEn: 'Low Bun', nameTw: '低丸子頭', file: '低丸子头' },
    { id: 'low-pony', name: '低马尾低盘发', nameEn: 'Low Ponytail', nameTw: '低馬尾低盤髮', file: '低马尾低盘发' },
    { id: 'natural', name: '自然披发', nameEn: 'Natural Long Hair', nameTw: '自然披髮', file: '自然披发' },
    { id: 'layered', name: '轻碎发微层次', nameEn: 'Light Layers', nameTw: '輕碎髮微層次', file: '轻碎发微层次' },
    { id: 'bob', name: '齐耳波波头', nameEn: 'Ear-length Bob', nameTw: '齊耳波波頭', file: '齐耳波波头' }
  ],
  // 表情
  expression: [
    { id: 'smile', name: '不露齿微笑', nameEn: 'Closed Smile', nameTw: '不露齒微笑', file: '不漏齿微笑' },
    { id: 'slight-teeth', name: '轻微露齿笑', nameEn: 'Slight Teeth Smile', nameTw: '輕微露齒笑', file: '轻微漏齿笑' }
  ]
};

// 获取指定性别的风格选项（带图片URL和翻译）
function getStyleOptions(gender, lang = 'zh-CN') {
  const styles = gender === 'male' ? maleStyles : femaleStyles;
  const result = {};

  for (const category of ['dress', 'hair', 'expression']) {
    result[category] = styles[category].map(item => {
      // 根据语言选择名称
      let name = item.name;
      if (lang === 'en') {
        name = item.nameEn;
      }

      return {
        id: item.id,
        name: name,
        image: getStyleImageUrl(gender, category, item.file),
        promptText: item.name // AI提示词始终使用中文
      };
    });
  }

  return result;
}

// 获取分类标题的多语言文本
function getCategoryTitle(category, lang = 'zh-CN') {
  const titles = {
    dress: { 'zh-CN': '穿着', 'en': 'Outfit' },
    hair: { 'zh-CN': '发型', 'en': 'Hairstyle' },
    expression: { 'zh-CN': '表情', 'en': 'Expression' }
  };
  return titles[category]?.[lang] || titles[category]?.['zh-CN'] || category;
}

module.exports = {
  getStyleOptions,
  getCategoryTitle,
  maleStyles,
  femaleStyles
};
