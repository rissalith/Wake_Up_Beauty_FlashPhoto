/**
 * 小红书文案配图批量生成脚本
 *
 * 功能：
 * 1. 从每天的文案中提取 AI 提示词
 * 2. 为每张图片创建单独的 prompt.md 文件
 * 3. 调用 Gemini API 生成图片
 * 4. 保存生成的图片到对应文件夹
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// API 配置
const AI_API_KEY = process.env.AI_API_KEY || 'sk-GtmTU7PTpPmWTVUrx2SPBdaRsJoDPaJDpkSgRIK8Xu6huLt8';
const AI_API_BASE = process.env.AI_API_BASE || 'https://api.vectorengine.ai';
const AI_MODEL = process.env.AI_MODEL || 'gemini-3-pro-image-preview';

// 文案目录
const DOCS_DIR = path.join(__dirname, '..', 'docs', '小红书文案');

// 延迟函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 从文案文件中提取 AI 提示词
 */
function extractPrompts(content, dayNum) {
  const prompts = [];
  const lines = content.split('\n');

  let currentImageName = '';
  let promptIndex = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 匹配图片标题行，如 **图1-封面图：对比冲击**
    const titleMatch = line.match(/\*\*图(\d+[-\d]*)[（(]?[可选]*[）)]?[：:]\s*(.+?)\*\*/);
    if (titleMatch) {
      currentImageName = titleMatch[2].trim();
    }

    // 匹配 AI 提示词行
    const promptMatch = line.match(/>\s*AI\s*提示词(\d*)[:：]\s*(.+)/);
    if (promptMatch) {
      const subIndex = promptMatch[1] || '';
      const promptText = promptMatch[2].trim();

      // 跳过截图类的提示
      if (promptText.includes('使用小程序真实截图') || promptText.includes('截图')) {
        continue;
      }

      prompts.push({
        day: dayNum,
        index: promptIndex,
        subIndex: subIndex,
        imageName: currentImageName,
        prompt: promptText,
        filename: `prompt_${String(promptIndex).padStart(2, '0')}${subIndex ? '_' + subIndex : ''}.md`
      });

      if (!subIndex || subIndex === '1') {
        promptIndex++;
      }
    }
  }

  return prompts;
}

/**
 * 调用 Gemini API 生成图片
 */
async function generateImage(prompt) {
  return new Promise((resolve) => {
    try {
      // 添加中文要求，避免生成英文文字
      const enhancedPrompt = prompt + '。重要要求：图片中不要包含任何英文文字，如果需要文字请使用简体中文。';

      const requestData = JSON.stringify({
        contents: [{
          parts: [{ text: enhancedPrompt }]
        }],
        generationConfig: {
          responseModalities: ['image', 'text']
        }
      });

      const url = new URL(`${AI_API_BASE}/v1beta/models/${AI_MODEL}:generateContent`);

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`,
          'Content-Length': Buffer.byteLength(requestData)
        },
        timeout: 180000
      };

      console.log(`  调用 API 生成图片...`);

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);

            if (response.error) {
              resolve({ success: false, error: response.error.message });
              return;
            }

            const candidates = response.candidates;
            if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
              for (const part of candidates[0].content.parts) {
                if (part.inlineData) {
                  resolve({
                    success: true,
                    imageData: part.inlineData.data,
                    mimeType: part.inlineData.mimeType || 'image/png'
                  });
                  return;
                }
              }
            }

            resolve({ success: false, error: '响应中没有图片数据' });
          } catch (e) {
            resolve({ success: false, error: '解析响应失败: ' + e.message });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ success: false, error: e.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: '请求超时' });
      });

      req.write(requestData);
      req.end();
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * 保存 prompt 到单独的 md 文件
 */
function savePromptFile(dayDir, promptInfo) {
  const promptDir = path.join(dayDir, 'prompts');
  if (!fs.existsSync(promptDir)) {
    fs.mkdirSync(promptDir, { recursive: true });
  }

  const content = `# ${promptInfo.imageName}

## 图片编号
Day ${String(promptInfo.day).padStart(2, '0')} - 图${promptInfo.index}${promptInfo.subIndex ? '-' + promptInfo.subIndex : ''}

## AI 提示词
${promptInfo.prompt}

## 生成参数
- 比例: 3:4 竖图
- 风格: 写实/摄影风格
`;

  const filePath = path.join(promptDir, promptInfo.filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * 保存生成的图片（直接保存到当天根目录）
 */
function saveImage(dayDir, promptInfo, imageData, mimeType) {
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const filename = `图${String(promptInfo.index).padStart(2, '0')}${promptInfo.subIndex ? '_' + promptInfo.subIndex : ''}.${ext}`;
  const filePath = path.join(dayDir, filename);

  const buffer = Buffer.from(imageData, 'base64');
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

/**
 * 处理单个 Day 文件夹
 */
async function processDay(dayNum, generateImages = false) {
  const dayDir = path.join(DOCS_DIR, `Day${String(dayNum).padStart(2, '0')}`);
  const contentFile = path.join(dayDir, '文案.md');

  if (!fs.existsSync(contentFile)) {
    console.log(`Day ${dayNum}: 文案文件不存在，跳过`);
    return { day: dayNum, prompts: 0, images: 0, errors: [] };
  }

  console.log(`\n处理 Day ${String(dayNum).padStart(2, '0')}...`);

  const content = fs.readFileSync(contentFile, 'utf-8');
  const prompts = extractPrompts(content, dayNum);

  console.log(`  提取到 ${prompts.length} 个提示词`);

  const result = { day: dayNum, prompts: prompts.length, images: 0, errors: [] };

  for (const promptInfo of prompts) {
    // 保存 prompt 文件
    const promptFile = savePromptFile(dayDir, promptInfo);
    console.log(`  保存: ${path.basename(promptFile)}`);

    // 如果需要生成图片
    if (generateImages) {
      console.log(`  生成图片: ${promptInfo.imageName}`);

      const imageResult = await generateImage(promptInfo.prompt);

      if (imageResult.success) {
        const imagePath = saveImage(dayDir, promptInfo, imageResult.imageData, imageResult.mimeType);
        console.log(`  ✓ 保存图片: ${path.basename(imagePath)}`);
        result.images++;
      } else {
        console.log(`  ✗ 生成失败: ${imageResult.error}`);
        result.errors.push({
          prompt: promptInfo.imageName,
          error: imageResult.error
        });
      }

      // 延迟避免 API 限流
      await delay(3000);
    }
  }

  return result;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const generateImages = args.includes('--generate') || args.includes('-g');
  const startDay = parseInt(args.find(a => a.startsWith('--start='))?.split('=')[1]) || 1;
  const endDay = parseInt(args.find(a => a.startsWith('--end='))?.split('=')[1]) || 30;

  console.log('='.repeat(50));
  console.log('小红书文案配图批量处理脚本');
  console.log('='.repeat(50));
  console.log(`处理范围: Day ${startDay} - Day ${endDay}`);
  console.log(`生成图片: ${generateImages ? '是' : '否'}`);
  console.log('='.repeat(50));

  const results = [];

  for (let day = startDay; day <= endDay; day++) {
    const result = await processDay(day, generateImages);
    results.push(result);
  }

  // 输出统计
  console.log('\n' + '='.repeat(50));
  console.log('处理完成！统计信息：');
  console.log('='.repeat(50));

  let totalPrompts = 0;
  let totalImages = 0;
  let totalErrors = 0;

  for (const r of results) {
    totalPrompts += r.prompts;
    totalImages += r.images;
    totalErrors += r.errors.length;
  }

  console.log(`总提示词数: ${totalPrompts}`);
  if (generateImages) {
    console.log(`成功生成图片: ${totalImages}`);
    console.log(`失败数: ${totalErrors}`);
  }

  // 保存错误日志
  if (totalErrors > 0) {
    const errorLog = results
      .filter(r => r.errors.length > 0)
      .map(r => `Day ${r.day}:\n${r.errors.map(e => `  - ${e.prompt}: ${e.error}`).join('\n')}`)
      .join('\n\n');

    fs.writeFileSync(path.join(DOCS_DIR, 'generate_errors.log'), errorLog, 'utf-8');
    console.log(`\n错误日志已保存到: generate_errors.log`);
  }
}

// 运行
main().catch(console.error);
