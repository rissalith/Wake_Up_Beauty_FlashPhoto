/**
 * 证件照示意图生成脚本
 * 调用 Gemini Pro 为6种规格生成示意图，上传到 COS
 *
 * 运行: node scripts/generate-id-photo-samples.js
 * 需要在 core-api 目录下有 node_modules
 */
const path = require('path');
const fs = require('fs');
const axios = require(path.resolve(__dirname, '../core-api/node_modules/axios'));
try { require(path.resolve(__dirname, '../core-api/node_modules/dotenv')).config({ path: path.resolve(__dirname, '../.env') }); } catch(e) {}

// AI 配置（图片生成专用，不从 env 读取避免被占位值覆盖）
const AI_API_KEY = 'sk-VXmbflYaVILyrsmDb9b4QlOssQUSfasOOndal2c2Ew4aNFwy';
const AI_API_BASE = 'https://api.vectorengine.ai';
const AI_MODEL = 'gemini-3.1-flash-image-preview';

// COS 配置（素材桶）
const COS_CONFIG = {
  bucket: 'xingmeishantu-1310044729',
  region: 'ap-shanghai',
  baseUrl: 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com'
};

// 6种证件照规格
const SPECS = [
  { id: 'one-inch', name: '一寸照', w: 295, h: 413, bg: '#438EDB' },
  { id: 'two-inch', name: '二寸照', w: 413, h: 579, bg: '#FFFFFF' },
  { id: 'passport', name: '护照照', w: 390, h: 567, bg: '#FFFFFF' },
  { id: 'visa', name: '签证照', w: 413, h: 531, bg: '#FFFFFF' },
  { id: 'id-card', name: '身份证照', w: 307, h: 378, bg: '#FFFFFF' },
  { id: 'driver', name: '驾照照', w: 248, h: 307, bg: '#C1392B' }
];

async function generateImage(prompt) {
  const res = await axios.post(
    `${AI_API_BASE}/v1/chat/completions`,
    {
      model: AI_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`
      },
      timeout: 120000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }
  );

  const content = res.data?.choices?.[0]?.message?.content || '';
  // 返回格式: ![image](data:image/png;base64,xxxx)
  const match = content.match(/data:image\/\w+;base64,([A-Za-z0-9+/=]+)/);
  if (match) return Buffer.from(match[1], 'base64');
  throw new Error('No image in response: ' + content.slice(0, 200));
}

async function uploadToCOS(key, buffer) {
  const url = `${COS_CONFIG.baseUrl}/${key}`;
  await axios.put(url, buffer, {
    headers: { 'Content-Type': 'image/png' },
    maxBodyLength: Infinity
  });
  return url;
}

async function main() {
  const outDir = path.resolve(__dirname, '../temp-samples');
  fs.mkdirSync(outDir, { recursive: true });

  for (const spec of SPECS) {
    console.log(`\n[${spec.id}] 生成 ${spec.name} (${spec.w}x${spec.h})...`);

    const prompt = `Generate a professional ID photo sample image. Create a realistic portrait of a young Asian professional (male or female) with a clean ${spec.bg === '#438EDB' ? 'blue' : spec.bg === '#C1392B' ? 'red' : 'white'} background. The person should be wearing formal business attire, looking directly at the camera with a neutral expression. Standard ${spec.name} format, ${spec.w}x${spec.h} pixels. Professional studio lighting, sharp focus. This is a sample/demo image for an ID photo app.`;

    try {
      const imgBuf = await generateImage(prompt);
      // 保存本地
      const localPath = path.join(outDir, `${spec.id}.png`);
      fs.writeFileSync(localPath, imgBuf);
      console.log(`  本地保存: ${localPath} (${Math.round(imgBuf.length / 1024)}KB)`);

      // 上传 COS
      const cosKey = `id-photo-samples/${spec.id}.png`;
      const url = await uploadToCOS(cosKey, imgBuf);
      console.log(`  COS上传: ${url}`);
    } catch (err) {
      console.error(`  失败: ${err.message}`);
    }
  }

  console.log('\n完成！');
}

main().catch(console.error);
