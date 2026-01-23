/**
 * 翻译工具 - 调用腾讯云翻译 API
 */
import request from '@/api'

/**
 * 简体中文转英文（调用腾讯云翻译API）
 * @param {string} text 简体中文文本
 * @returns {Promise<string>} 英文翻译结果
 */
export async function translateToEnglish(text) {
  if (!text) return ''
  
  try {
    const res = await request.post('/translate/to-english', { text })
    if (res.code === 0 && res.data) {
      return res.data.translated
    }
    console.warn('翻译失败:', res.message)
    return text
  } catch (error) {
    console.error('翻译API调用失败:', error)
    return text
  }
}

/**
 * 批量翻译简体中文到英文
 * @param {string[]} texts 文本数组
 * @returns {Promise<{original: string, translated: string}[]>} 翻译结果数组
 */
export async function batchTranslateToEnglish(texts) {
  if (!texts || texts.length === 0) return []
  
  try {
    const res = await request.post('/translate/batch', { texts, target: 'en' })
    if (res.code === 0 && res.data) {
      return res.data
    }
    console.warn('批量翻译失败:', res.message)
    return texts.map(t => ({ original: t, translated: t }))
  } catch (error) {
    console.error('批量翻译API调用失败:', error)
    return texts.map(t => ({ original: t, translated: t }))
  }
}

export default {
  translateToEnglish,
  batchTranslateToEnglish
}
