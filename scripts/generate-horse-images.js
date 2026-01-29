/**
 * 生成4种马的图片并上传到COS
 * 在服务器 core-api 目录运行: node ../scripts/generate-horse-images.js
 */

const https = require('https');
const http = require('http');
const COS = require('cos-nodejs-sdk-v5');
require('dotenv').config();

// COS配置
const cosClient = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY
});

const ASSET_BUCKET = process.env.COS_ASSET_BUCKET || 'xingmeishantu-1310044729';
const ASSET_REGION = process.env.COS_ASSET_REGION || 'ap-shanghai';
const ASSET_BASE_URL = `https://${ASSET_BUCKET}.cos.${ASSET_REGION}.myqcloud.com`;

// AI服务地址 (Docker内部网络)
const AI_SERVICE_HOST = 'flashphoto-ai-service';
const AI_SERVICE_PORT = 3002;

// 4种马的配置
const horses = [
  {
    name: 'common_horse',
    prompt: '生成一匹写实风格的棕色骏马图片，毛色油亮，精神抖擞，朴实可靠。背景简洁，突出马的形象。高清写实摄影风格，4K画质。'
  },
  {
    name: 'silver_horse',
    prompt: '生成一匹写实风格的银色骏马图片，鬃毛闪耀着银光，气质高贵优雅。背景简洁，突出马的形象。高清写实摄影风格，4K画质。'
  },
  {
    name: 'golden_horse',
    prompt: '生成一匹写实风格的金色骏马图片，全身金色毛发，华贵非凡，象征财富与荣耀。背景简洁，突出马的形象。高清写实摄影风格，4K画质。'
  },
  {
    name: 'divine_horse',
    prompt: '生成一匹神圣的白色天马图片，周身环绕祥云，散发神圣金光，仙气飘飘。写实与奇幻结合的风格，高清4K画质。'
  }
];

// 上传到COS
async function uploadToCOS(buffer, key) {
  return new Promise((resolve, reject) => {
    cosClient.putObject({
      Bucket: ASSET_BUCKET,
      Region: ASSET_REGION,
      Key: key,
      Body: buffer,
      ContentType: 'image/png'
    }, (err, data) => {
      if (err) reject(err);
      else resolve({
        key: key,
        url: `${ASSET_BASE_URL}/${key}`,
        etag: data.ETag
      });
    });
  });
}

// HTTP请求封装
function httpRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (postData) req.write(postData);
    req.end();
  });
}

// 生成单张图片
async function generateImage(horse) {
  console.log(`\n正在生成: ${horse.name}`);
  console.log(`Prompt: ${horse.prompt}`);

  try {
    const postData = JSON.stringify({ prompt: horse.prompt });

    const options = {
      hostname: AI_SERVICE_HOST,
      port: AI_SERVICE_PORT,
      path: '/api/ai/generate-image',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const response = await httpRequest(options, postData);

    if (response.code === 0 && response.data?.imageBase64) {
      console.log(`✓ 图片生成成功`);

      // 转换base64为buffer
      const imageBuffer = Buffer.from(response.data.imageBase64, 'base64');

      // 上传到COS
      const key = `horses/${horse.name}.png`;
      const result = await uploadToCOS(imageBuffer, key);

      console.log(`✓ 上传成功: ${result.url}`);
      return result;
    } else {
      console.error(`✗ 生成失败:`, response.message || '未知错误');
      return null;
    }
  } catch (error) {
    console.error(`✗ 请求失败:`, error.message);
    return null;
  }
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('开始生成4种马的图片');
  console.log('========================================');

  const results = [];

  for (const horse of horses) {
    const result = await generateImage(horse);
    if (result) {
      results.push({ name: horse.name, ...result });
    }

    // 等待2秒避免请求过快
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n========================================');
  console.log('生成完成！结果汇总:');
  console.log('========================================');

  results.forEach(r => {
    console.log(`${r.name}: ${r.url}`);
  });

  console.log('\n可以在后台管理的词条编辑中选择这些图片了。');
}

main().catch(console.error);
