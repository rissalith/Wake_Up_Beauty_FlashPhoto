/**
 * Deploy Webhook Service
 * 接收 GitHub Actions 的 webhook 请求，触发本地部署
 */

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');

const PORT = process.env.WEBHOOK_PORT || 3004;
const SECRET = process.env.WEBHOOK_SECRET;
const DEPLOY_PATH = process.env.DEPLOY_PATH || '/www/wwwroot/pop-pub.com';
const LOG_FILE = '/app/logs/deploy.log';

// 确保日志目录存在
const logDir = '/app/logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(LOG_FILE, logMessage);
}

function verifySignature(payload, signature) {
  if (!SECRET) {
    log('警告: WEBHOOK_SECRET 未设置，跳过签名验证');
    return true;
  }
  if (!signature) {
    return false;
  }
  const hmac = crypto.createHmac('sha256', SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

function runDeploy(branch, callback) {
  const commands = [
    `cd ${DEPLOY_PATH}`,
    'git fetch origin',
    `git reset --hard origin/${branch}`,
    'bash docker/deploy-optimized.sh update'
  ].join(' && ');

  log(`开始部署，分支: ${branch}`);
  log(`执行命令: ${commands}`);

  const child = exec(commands, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30 * 60 * 1000 // 30 分钟超时
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data;
    log(`[stdout] ${data.trim()}`);
  });

  child.stderr.on('data', (data) => {
    stderr += data;
    log(`[stderr] ${data.trim()}`);
  });

  child.on('close', (code) => {
    if (code === 0) {
      log('部署成功');
      callback(null, { success: true, message: '部署成功' });
    } else {
      log(`部署失败，退出码: ${code}`);
      callback(new Error(`部署失败，退出码: ${code}`), {
        success: false,
        message: '部署失败',
        stdout: stdout.slice(-2000),
        stderr: stderr.slice(-2000)
      });
    }
  });

  child.on('error', (err) => {
    log(`部署执行错误: ${err.message}`);
    callback(err, { success: false, message: err.message });
  });
}

const server = http.createServer((req, res) => {
  // 健康检查
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'deploy-webhook' }));
    return;
  }

  // 查看最近日志
  if (req.method === 'GET' && req.url === '/logs') {
    try {
      const logs = fs.existsSync(LOG_FILE)
        ? fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-100).join('\n')
        : '暂无日志';
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(logs);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Webhook 触发部署
  if (req.method === 'POST' && req.url === '/deploy') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      // 验证签名
      const signature = req.headers['x-webhook-signature'] || req.headers['x-hub-signature-256'];
      if (!verifySignature(body, signature)) {
        log('签名验证失败');
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '签名验证失败' }));
        return;
      }

      let payload;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        // 如果不是 JSON，尝试作为简单请求处理
        payload = { branch: 'main' };
      }

      const branch = payload.branch || payload.ref?.replace('refs/heads/', '') || 'main';

      // 只允许 main/master 分支
      if (!['main', 'master'].includes(branch)) {
        log(`忽略非主分支部署请求: ${branch}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: `忽略分支 ${branch}` }));
        return;
      }

      log(`收到部署请求，分支: ${branch}`);

      // 立即返回响应，后台执行部署
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: '部署已触发',
        branch: branch,
        timestamp: new Date().toISOString()
      }));

      // 异步执行部署
      runDeploy(branch, (err, result) => {
        if (err) {
          log(`部署完成但有错误: ${err.message}`);
        } else {
          log('部署流程完成');
        }
      });
    });

    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  log(`Deploy Webhook 服务启动，端口: ${PORT}`);
  log(`健康检查: GET /health`);
  log(`部署触发: POST /deploy`);
  log(`查看日志: GET /logs`);
  if (!SECRET) {
    log('警告: WEBHOOK_SECRET 未设置，建议在生产环境中配置');
  }
});
