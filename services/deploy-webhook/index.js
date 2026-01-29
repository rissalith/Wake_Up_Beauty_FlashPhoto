/**
 * Deploy Webhook Service
 * 接收 GitHub Actions 的 webhook 请求，触发本地部署
 *
 * 优化版：
 * - 支持增量部署（只重建有变化的服务）
 * - 部署锁防止并发部署
 * - 健康检查确保服务正常
 */

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');

const PORT = process.env.WEBHOOK_PORT || 3004;
const SECRET = process.env.WEBHOOK_SECRET;
const DEPLOY_PATH = process.env.DEPLOY_PATH || '/www/wwwroot/pop-pub.com';
const LOG_FILE = '/app/logs/deploy.log';
const LOCK_FILE = '/app/logs/deploy.lock';

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

// 检查是否有部署正在进行
function isDeploying() {
  if (!fs.existsSync(LOCK_FILE)) {
    return false;
  }
  try {
    const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    const lockAge = Date.now() - lockData.timestamp;
    // 锁超过 10 分钟视为过期
    if (lockAge > 10 * 60 * 1000) {
      log('发现过期的部署锁，清理中...');
      fs.unlinkSync(LOCK_FILE);
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

// 创建部署锁
function createLock() {
  fs.writeFileSync(LOCK_FILE, JSON.stringify({
    timestamp: Date.now(),
    pid: process.pid
  }));
}

// 释放部署锁
function releaseLock() {
  if (fs.existsSync(LOCK_FILE)) {
    fs.unlinkSync(LOCK_FILE);
  }
}

// 检测哪些服务需要重建
function detectChangedServices(changedFiles) {
  const services = [];

  if (!changedFiles || changedFiles.length === 0) {
    // 如果没有文件变化信息，默认重建所有后端服务
    return ['core-api', 'ai-service', 'pay-service'];
  }

  for (const file of changedFiles) {
    if (file.startsWith('core-api/') || file.startsWith('server/')) {
      if (!services.includes('core-api')) services.push('core-api');
    }
    if (file.startsWith('services/ai-service/')) {
      if (!services.includes('ai-service')) services.push('ai-service');
    }
    if (file.startsWith('services/pay-service/')) {
      if (!services.includes('pay-service')) services.push('pay-service');
    }
    if (file.startsWith('admin-server/admin-web/')) {
      // 前端变化，需要重建 core-api（因为前端构建产物在 core-api 中）
      if (!services.includes('frontend')) services.push('frontend');
    }
    if (file.startsWith('docker/nginx/')) {
      if (!services.includes('nginx')) services.push('nginx');
    }
  }

  return services;
}

function runDeploy(branch, changedFiles, callback) {
  // 检查部署锁
  if (isDeploying()) {
    log('另一个部署正在进行中，跳过本次部署');
    callback(null, { success: false, message: '部署正在进行中，请稍后重试' });
    return;
  }

  createLock();

  const services = detectChangedServices(changedFiles);
  log(`检测到需要更新的服务: ${services.join(', ') || '无'}`);

  // 构建部署命令
  let deployCommands = [];

  // 1. 拉取代码
  deployCommands.push(`cd ${DEPLOY_PATH} && git fetch origin && git reset --hard origin/${branch}`);

  // 2. 根据变化的服务决定重建哪些
  if (services.includes('frontend')) {
    // 前端变化：构建前端
    deployCommands.push(`cd ${DEPLOY_PATH}/admin-server/admin-web && npm run build && rm -rf ${DEPLOY_PATH}/core-api/public/admin/* && cp -r dist/* ${DEPLOY_PATH}/core-api/public/admin/`);
  }

  // 3. 重建后端服务（只重建有变化的）
  const backendServices = services.filter(s => ['core-api', 'ai-service', 'pay-service', 'nginx'].includes(s));
  if (backendServices.length > 0) {
    deployCommands.push(`cd ${DEPLOY_PATH} && docker compose -f docker-compose.optimized.yml up -d --build --no-deps ${backendServices.join(' ')}`);
  }

  // 4. 如果没有检测到任何变化，执行完整更新（保守策略）
  if (services.length === 0) {
    log('未检测到具体变化，执行完整更新');
    deployCommands.push(`cd ${DEPLOY_PATH} && docker compose -f docker-compose.optimized.yml up -d --build core-api ai-service pay-service`);
  }

  // 5. 等待服务启动并 reload nginx（解决 upstream DNS 缓存问题）
  deployCommands.push(`sleep 10 && docker exec flashphoto-nginx nginx -s reload`);

  // 6. 健康检查
  deployCommands.push(`sleep 3 && curl -sf http://localhost/api/health || echo "健康检查失败"`);

  const fullCommand = `nsenter -t 1 -m -u -n -i bash -c '${deployCommands.join(' && ')}'`;

  log(`开始部署，分支: ${branch}`);
  log(`执行命令: ${fullCommand}`);

  const child = exec(fullCommand, {
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
    releaseLock();

    if (code === 0) {
      log('部署成功');
      callback(null, { success: true, message: '部署成功' });
    } else {
      log(`部署失败，退出码: ${code}`);
      // 部署失败时尝试恢复服务
      log('尝试恢复服务...');
      exec(`nsenter -t 1 -m -u -n -i bash -c 'cd ${DEPLOY_PATH} && docker compose -f docker-compose.optimized.yml up -d'`, (err) => {
        if (err) {
          log(`恢复服务失败: ${err.message}`);
        } else {
          log('服务已恢复');
        }
      });

      callback(new Error(`部署失败，退出码: ${code}`), {
        success: false,
        message: '部署失败',
        stdout: stdout.slice(-2000),
        stderr: stderr.slice(-2000)
      });
    }
  });

  child.on('error', (err) => {
    releaseLock();
    log(`部署执行错误: ${err.message}`);
    callback(err, { success: false, message: err.message });
  });
}

const server = http.createServer((req, res) => {
  // 健康检查
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'deploy-webhook',
      deploying: isDeploying()
    }));
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

  // 查看部署状态
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      deploying: isDeploying(),
      lockFile: fs.existsSync(LOCK_FILE) ? JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')) : null
    }));
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

      // 提取变化的文件列表（GitHub webhook 格式）
      let changedFiles = [];
      if (payload.commits) {
        for (const commit of payload.commits) {
          changedFiles = changedFiles.concat(commit.added || [], commit.modified || [], commit.removed || []);
        }
        changedFiles = [...new Set(changedFiles)]; // 去重
      }

      // 只允许 main/master 分支
      if (!['main', 'master'].includes(branch)) {
        log(`忽略非主分支部署请求: ${branch}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: `忽略分支 ${branch}` }));
        return;
      }

      // 检查是否正在部署
      if (isDeploying()) {
        log('部署正在进行中，拒绝新请求');
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: '部署正在进行中',
          message: '请等待当前部署完成后重试'
        }));
        return;
      }

      log(`收到部署请求，分支: ${branch}, 变化文件数: ${changedFiles.length}`);

      // 立即返回响应，后台执行部署
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: '部署已触发',
        branch: branch,
        changedFiles: changedFiles.slice(0, 10), // 只返回前 10 个
        timestamp: new Date().toISOString()
      }));

      // 异步执行部署
      runDeploy(branch, changedFiles, (err, result) => {
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
  log(`部署状态: GET /status`);
  log(`查看日志: GET /logs`);
  if (!SECRET) {
    log('警告: WEBHOOK_SECRET 未设置，建议在生产环境中配置');
  }
});
