/**
 * 上传步骤图标到 COS 素材库
 * 用于场景配置中的步骤图标（如新春坐骑、题词等）
 *
 * 使用方法: node scripts/upload-step-icons.js
 */

const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 素材存储桶配置
const ASSET_COS_CONFIG = {
  bucket: 'xingmeishantu-1310044729',
  region: 'ap-shanghai',
  baseUrl: 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com'
};

// 初始化 COS 客户端
const cosClient = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY
});

// 要上传的图标列表
const icons = [
  {
    localPath: path.join(__dirname, '../miniprogram/images/icon-horse.svg'),
    cosKey: 'icon/icon-horse.svg',
    description: '新春坐骑图标'
  },
  {
    localPath: path.join(__dirname, '../miniprogram/images/icon-phrase.svg'),
    cosKey: 'icon/icon-phrase.svg',
    description: '题词图标'
  }
];

async function uploadIcon(icon) {
  return new Promise((resolve, reject) => {
    const buffer = fs.readFileSync(icon.localPath);

    cosClient.putObject({
      Bucket: ASSET_COS_CONFIG.bucket,
      Region: ASSET_COS_CONFIG.region,
      Key: icon.cosKey,
      Body: buffer,
      ContentType: 'image/svg+xml'
    }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          key: icon.cosKey,
          url: `${ASSET_COS_CONFIG.baseUrl}/${icon.cosKey}`,
          etag: data.ETag
        });
      }
    });
  });
}

async function main() {
  console.log('开始上传步骤图标到 COS 素材库...\n');

  if (!process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY) {
    console.error('错误: 请配置 COS_SECRET_ID 和 COS_SECRET_KEY 环境变量');
    process.exit(1);
  }

  for (const icon of icons) {
    try {
      // 检查本地文件是否存在
      if (!fs.existsSync(icon.localPath)) {
        console.log(`跳过: ${icon.description} - 本地文件不存在: ${icon.localPath}`);
        continue;
      }

      console.log(`上传: ${icon.description}`);
      console.log(`  本地路径: ${icon.localPath}`);
      console.log(`  COS Key: ${icon.cosKey}`);

      const result = await uploadIcon(icon);

      console.log(`  成功! URL: ${result.url}\n`);
    } catch (error) {
      console.error(`  失败: ${error.message}\n`);
    }
  }

  console.log('上传完成!');
  console.log('\n图标 URL 列表:');
  for (const icon of icons) {
    console.log(`  ${icon.description}: ${ASSET_COS_CONFIG.baseUrl}/${icon.cosKey}`);
  }
}

main().catch(console.error);
