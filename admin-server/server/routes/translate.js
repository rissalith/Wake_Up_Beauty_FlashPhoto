/**
 * 腾讯云机器翻译 API 路由
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const https = require('https');

// 腾讯云 API 签名 (中间步骤返回 Buffer)
function signBuffer(secretKey, signStr) {
  return crypto.createHmac('sha256', secretKey).update(signStr).digest();
}

// 最终签名返回 hex
function signHex(secretKey, signStr) {
  return crypto.createHmac('sha256', secretKey).update(signStr).digest('hex');
}

function getHash(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

function getDate(timestamp) {
  const date = new Date(timestamp * 1000);
  const year = date.getUTCFullYear();
  const month = ('0' + (date.getUTCMonth() + 1)).slice(-2);
  const day = ('0' + date.getUTCDate()).slice(-2);
  return `${year}-${month}-${day}`;
}

// 调用腾讯云翻译 API
async function translateText(text, source = 'zh', target = 'en') {
  const secretId = process.env.COS_SECRET_ID;
  const secretKey = process.env.COS_SECRET_KEY;
  
  if (!secretId || !secretKey) {
    throw new Error('腾讯云密钥未配置');
  }

  const service = 'tmt';
  const host = 'tmt.tencentcloudapi.com';
  const action = 'TextTranslate';
  const version = '2018-03-21';
  const region = 'ap-guangzhou';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = getDate(timestamp);

  // 请求体
  const payload = JSON.stringify({
    SourceText: text,
    Source: source,
    Target: target,
    ProjectId: 0
  });

  // 签名过程
  const hashedRequestPayload = getHash(payload);
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload
  ].join('\n');

  const algorithm = 'TC3-HMAC-SHA256';
  const hashedCanonicalRequest = getHash(canonicalRequest);
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    hashedCanonicalRequest
  ].join('\n');

  // 计算签名 (中间步骤用 Buffer，最后一步用 hex)
  const secretDate = signBuffer('TC3' + secretKey, date);
  const secretService = signBuffer(secretDate, service);
  const secretSigning = signBuffer(secretService, 'tc3_request');
  const signature = signHex(secretSigning, stringToSign);

  const authorization = [
    `${algorithm} Credential=${secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(', ');

  // 发送请求
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Version': version,
        'X-TC-Region': region,
        'Authorization': authorization
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.Response && result.Response.TargetText) {
            resolve(result.Response.TargetText);
          } else if (result.Response && result.Response.Error) {
            reject(new Error(result.Response.Error.Message));
          } else {
            reject(new Error('翻译失败：未知错误'));
          }
        } catch (e) {
          reject(new Error('解析响应失败'));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// 简体转繁体的本地映射（保留作为备用）
const s2tMap = {
  '证': '證', '件': '件', '职': '職', '业': '業', '写': '寫', '真': '真',
  '全': '全', '家': '家', '福': '福', '宠': '寵', '物': '物', '婚': '婚', '纱': '紗',
  '选': '選', '择': '擇', '别': '別', '颜': '顏', '色': '色', '蓝': '藍', '红': '紅',
  '规': '規', '专': '專', '头': '頭', '风': '風', '简': '簡', '约': '約', '时': '時',
  '尚': '尚', '智': '智', '能': '能', '点': '點', '击': '擊', '图': '圖', '传': '傳',
  '发': '發', '型': '型', '装': '裝', '标': '標', '准': '準', '质': '質', '量': '量',
  '制': '製', '调': '調', '滤': '濾', '镜': '鏡', '经': '經', '现': '現', '户': '戶',
  '护': '護', '驾': '駛', '毕': '畢', '结': '結', '学': '學', '历': '歷', '签': '簽',
  '请': '請', '输': '輸', '确': '確', '认': '認', '开': '開', '继': '繼', '续': '續',
  '删': '刪', '查': '查', '详': '詳', '细': '細', '设': '設', '关': '關', '闭': '閉',
  '预': '預', '览': '覽', '导': '導', '热': '熱', '门': '門', '显': '顯', '隐': '隱',
  '启': '啟', '审': '審', '过': '過', '绝': '絕', '处': '處', '进': '進', '订': '訂',
  '单': '單', '付': '付', '费': '費', '会': '會', '员': '員', '积': '積', '兑': '兌',
  '优': '優', '惠': '惠', '满': '滿', '减': '減', '参': '參', '与': '與', '领': '領',
  '奖': '獎', '礼': '禮', '购': '購', '买': '買', '车': '車', '数': '數', '总': '總',
  '计': '計', '统': '統', '报': '報', '线': '線', '饼': '餅', '趋': '趨', '势': '勢',
  '长': '長', '环': '環', '额': '額', '笔': '筆', '价': '價', '访': '訪', '问': '問',
  '浏': '瀏', '转': '轉', '响': '響', '应': '應', '间': '間', '负': '負', '载': '載',
  '并': '並', '连': '連', '断': '斷', '异': '異', '错': '錯', '误': '誤', '严': '嚴',
  '紧': '緊', '级': '級', '状': '狀', '态': '態', '维': '維', '升': '級', '滚': '滾',
  '备': '備', '恢': '恢', '复': '復', '迁': '遷', '扩': '擴', '缩': '縮', '缓': '緩',
  '页': '頁', '顶': '頂', '边': '邊', '宽': '寬', '体': '體', '划': '劃', '链': '鏈',
  '题': '題', '马': '馬', '龙': '龍', '华': '華', '国': '國', '电': '電', '话': '話',
  '网': '網', '络': '絡', '邮': '郵', '联': '聯', '码': '碼', '验': '驗', '账': '賬',
  '号': '號', '称': '稱', '绍': '紹', '机': '機', '构': '構', '组': '組', '织': '織',
  '权': '權', '游': '遊', '录': '錄', '册': '冊', '记': '記', '语': '語', '韩': '韓',
  '亚': '亞', '欧': '歐', '岛': '島', '云': '雲', '节': '節', '庆': '慶', '诞': '誕',
  '侣': '侶', '亲': '親', '爱': '愛', '丽': '麗', '帅': '帥', '气': '氣', '范': '範',
  '儿': '兒', '宝': '寶', '贝': '貝', '妈': '媽', '爷': '爺', '孙': '孫', '谱': '譜',
  '辈': '輩', '猫': '貓', '鸟': '鳥', '鱼': '魚', '虫': '蟲', '兽': '獸', '鸡': '雞',
  '鸭': '鴨', '鹅': '鵝', '猪': '豬', '驴': '驢', '骆': '駱', '驼': '駝', '狮': '獅',
  '鹿': '鹿', '龟': '龜', '蚂': '螞', '蚁': '蟻', '蝴': '蝴', '萤': '螢', '树': '樹',
  '兰': '蘭', '枣': '棗', '苹': '蘋', '柠': '檸', '个': '個', '来': '來', '闲': '閒',
  '动': '動'
};

function simplifiedToTraditional(text) {
  if (!text) return '';
  let result = '';
  for (const char of text) {
    result += s2tMap[char] || char;
  }
  return result;
}

// 翻译接口 - 简体转英文
router.post('/to-english', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.json({ code: 400, message: '请提供要翻译的文本' });
    }

    if (text.length > 2000) {
      return res.json({ code: 400, message: '文本长度不能超过2000字符' });
    }

    const translatedText = await translateText(text, 'zh', 'en');
    
    res.json({
      code: 200,
      data: {
        original: text,
        translated: translatedText
      }
    });
  } catch (error) {
    console.error('翻译失败:', error.message);
    res.json({ code: 500, message: '翻译失败: ' + error.message });
  }
});

// 翻译接口 - 简体转繁体（本地转换）
router.post('/to-traditional', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.json({ code: 400, message: '请提供要翻译的文本' });
    }

    const translatedText = simplifiedToTraditional(text);
    
    res.json({
      code: 200,
      data: {
        original: text,
        translated: translatedText
      }
    });
  } catch (error) {
    console.error('转换失败:', error.message);
    res.json({ code: 500, message: '转换失败: ' + error.message });
  }
});

// 批量翻译接口
router.post('/batch', async (req, res) => {
  try {
    const { texts, target = 'en' } = req.body;
    
    if (!Array.isArray(texts) || texts.length === 0) {
      return res.json({ code: 400, message: '请提供要翻译的文本数组' });
    }

    if (texts.length > 20) {
      return res.json({ code: 400, message: '单次最多翻译20条' });
    }

    const results = [];
    for (const text of texts) {
      if (text && typeof text === 'string') {
        try {
          const translated = target === 'zh-TW' 
            ? simplifiedToTraditional(text)
            : await translateText(text, 'zh', 'en');
          results.push({ original: text, translated });
        } catch (e) {
          results.push({ original: text, translated: text, error: e.message });
        }
      } else {
        results.push({ original: text, translated: text });
      }
    }
    
    res.json({
      code: 200,
      data: results
    });
  } catch (error) {
    console.error('批量翻译失败:', error.message);
    res.json({ code: 500, message: '批量翻译失败: ' + error.message });
  }
});

module.exports = router;
