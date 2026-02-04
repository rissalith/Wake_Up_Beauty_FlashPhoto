/**
 * 列出 COS icon/ 目录下的所有图标文件
 * 运行方式: node scripts/list-cos-icons.js
 */
const COS = require('cos-nodejs-sdk-v5');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY
});

const BUCKET = 'flashphoto-assets-1257018577';
const REGION = 'ap-guangzhou';
const BASE_URL = `https://${BUCKET}.cos.${REGION}.myqcloud.com`;

async function listIcons() {
  return new Promise((resolve, reject) => {
    cos.getBucket({
      Bucket: BUCKET,
      Region: REGION,
      Prefix: 'icon/',
      MaxKeys: 200
    }, (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      console.log('COS icon/ 目录下的图标文件:');
      console.log('='.repeat(60));

      if (data.Contents && data.Contents.length > 0) {
        const icons = data.Contents.filter(item => item.Key !== 'icon/');

        if (icons.length === 0) {
          console.log('(空目录，没有图标文件)');
          console.log('\n建议：上传图标到 COS 的 icon/ 目录');
        } else {
          icons.forEach((item, index) => {
            const fileName = item.Key.split('/').pop();
            console.log(`${index + 1}. ${fileName}`);
            console.log(`   URL: ${BASE_URL}/${item.Key}`);
          });
          console.log('');
          console.log(`共 ${icons.length} 个图标文件`);
        }
      } else {
        console.log('(空目录，没有图标文件)');
      }

      resolve();
    });
  });
}

listIcons().catch(err => {
  console.error('查询失败:', err.message);
  process.exit(1);
});
