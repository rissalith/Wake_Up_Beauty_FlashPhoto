/**
 * 敏感词过滤工具
 * 用于过滤用户输入中的敏感内容
 */

// 敏感词列表（基础版本，可根据需要扩展）
// 包含：政治敏感、色情低俗、暴力恐怖、广告骚扰等
const sensitiveWords = [
  // 政治敏感词（部分示例）
  '法轮功', '共产党', '国民党', '习近平', '毛泽东', '六四', '天安门', '台独', '藏独', '疆独',
  '反党', '反政府', '颠覆政权', '游行', '示威', '罢工', '暴动', '起义',

  // 色情低俗词
  '色情', '黄片', '成人片', '约炮', '一夜情', '援交', '卖淫', '嫖娼',
  '裸聊', '性交', '做爱', '口交', '肛交', '阴茎', '阴道', '乳房',

  // 暴力恐怖词
  '杀人', '砍人', '炸弹', '恐怖袭击', '枪杀', '绑架', '毒品', '吸毒',
  '自杀', '自残', '跳楼', '上吊',

  // 赌博相关
  '赌博', '赌场', '博彩', '彩票', '六合彩', '时时彩', '赌球',

  // 诈骗相关
  '传销', '诈骗', '骗钱', '刷单', '兼职赚钱', '日赚',

  // 广告骚扰
  '微信号', 'QQ号', '加我', '私聊', '代购', '代理',

  // 辱骂词汇
  '傻逼', '操你妈', '去死', '废物', '垃圾', '贱人', '婊子', '滚蛋',
  '你妈', '尼玛', 'nmsl', 'cnm', 'sb', 'tm', 'md'
];

// 构建正则表达式（不区分大小写）
const sensitiveRegex = new RegExp(sensitiveWords.join('|'), 'gi');

/**
 * 检查文本是否包含敏感词
 * @param {string} text - 要检查的文本
 * @returns {{hasSensitive: boolean, words: string[]}} - 是否包含敏感词及匹配到的词
 */
function checkSensitive(text) {
  if (!text || typeof text !== 'string') {
    return { hasSensitive: false, words: [] };
  }

  const matches = text.match(sensitiveRegex);
  const uniqueWords = matches ? [...new Set(matches)] : [];

  return {
    hasSensitive: uniqueWords.length > 0,
    words: uniqueWords
  };
}

/**
 * 过滤敏感词（替换为*）
 * @param {string} text - 要过滤的文本
 * @returns {string} - 过滤后的文本
 */
function filterSensitive(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  return text.replace(sensitiveRegex, (match) => '*'.repeat(match.length));
}

/**
 * 验证用户昵称
 * @param {string} nickname - 昵称
 * @returns {{valid: boolean, message: string}}
 */
function validateNickname(nickname) {
  if (!nickname || typeof nickname !== 'string') {
    return { valid: false, message: '昵称不能为空' };
  }

  const trimmed = nickname.trim();

  // 长度检查
  if (trimmed.length < 2) {
    return { valid: false, message: '昵称至少2个字符' };
  }
  if (trimmed.length > 20) {
    return { valid: false, message: '昵称最多20个字符' };
  }

  // 敏感词检查
  const sensitiveCheck = checkSensitive(trimmed);
  if (sensitiveCheck.hasSensitive) {
    return { valid: false, message: '昵称包含敏感词，请修改' };
  }

  // 特殊字符检查（只允许中文、英文、数字、下划线）
  const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9_\-\s]+$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, message: '昵称只能包含中英文、数字和下划线' };
  }

  return { valid: true, message: '' };
}

/**
 * 验证用户反馈内容
 * @param {string} content - 反馈内容
 * @returns {{valid: boolean, message: string, filtered: string}}
 */
function validateFeedback(content) {
  if (!content || typeof content !== 'string') {
    return { valid: false, message: '反馈内容不能为空', filtered: '' };
  }

  const trimmed = content.trim();

  // 长度检查
  if (trimmed.length < 5) {
    return { valid: false, message: '反馈内容至少5个字符', filtered: '' };
  }
  if (trimmed.length > 1000) {
    return { valid: false, message: '反馈内容最多1000个字符', filtered: '' };
  }

  // 敏感词检查
  const sensitiveCheck = checkSensitive(trimmed);
  if (sensitiveCheck.hasSensitive) {
    // 对于反馈，我们过滤敏感词而不是直接拒绝
    const filtered = filterSensitive(trimmed);
    return {
      valid: true,
      message: '反馈内容已过滤敏感词',
      filtered,
      hadSensitive: true
    };
  }

  return { valid: true, message: '', filtered: trimmed, hadSensitive: false };
}

module.exports = {
  checkSensitive,
  filterSensitive,
  validateNickname,
  validateFeedback
};
