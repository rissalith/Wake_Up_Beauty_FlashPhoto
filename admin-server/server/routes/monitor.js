const express = require('express');
const router = express.Router();
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getDb, getAll, getOne } = require('../config/database');

// 服务启动时间
const startTime = Date.now();

// 格式化运行时间
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

// 检查远程服务健康状态
function checkServiceHealth(port, timeout = 3000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/health',
      method: 'GET',
      timeout: timeout
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        try {
          const json = JSON.parse(data);
          resolve({
            status: 'online',
            responseTime,
            data: json
          });
        } catch (e) {
          resolve({
            status: 'online',
            responseTime,
            data: null
          });
        }
      });
    });
    
    req.on('error', (err) => {
      resolve({
        status: 'offline',
        error: err.message,
        responseTime: Date.now() - startTime
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 'timeout',
        responseTime: timeout
      });
    });
    
    req.end();
  });
}

// 获取 PM2 进程状态
function getPM2Status() {
  return new Promise((resolve) => {
    exec('pm2 jlist', (error, stdout, stderr) => {
      if (error) {
        resolve({ error: error.message });
        return;
      }
      try {
        const processes = JSON.parse(stdout);
        resolve(processes.map(p => ({
          name: p.name,
          pid: p.pid,
          status: p.pm2_env.status,
          uptime: p.pm2_env.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0,
          restarts: p.pm2_env.restart_time,
          memory: p.monit ? Math.round(p.monit.memory / 1024 / 1024) : 0,
          cpu: p.monit ? p.monit.cpu : 0
        })));
      } catch (e) {
        resolve({ error: 'Failed to parse PM2 output' });
      }
    });
  });
}

// 获取系统资源信息
function getSystemInfo() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  // 计算 CPU 使用率（简化版）
  let cpuUsage = 0;
  cpus.forEach(cpu => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    const idle = cpu.times.idle;
    cpuUsage += ((total - idle) / total) * 100;
  });
  cpuUsage = Math.round(cpuUsage / cpus.length);
  
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      usage: cpuUsage
    },
    memory: {
      total: Math.round(totalMem / 1024 / 1024),
      used: Math.round(usedMem / 1024 / 1024),
      free: Math.round(freeMem / 1024 / 1024),
      usagePercent: Math.round((usedMem / totalMem) * 100)
    },
    uptime: os.uptime(),
    uptimeFormatted: formatUptime(os.uptime())
  };
}

// 获取数据库信息
function getDatabaseInfo() {
  try {
    const dbPath = process.env.SHARED_DB_PATH || path.join(__dirname, '../database/flashphoto.db');
    let dbSize = 0;
    
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      dbSize = Math.round(stats.size / 1024 / 1024 * 100) / 100;
    }
    
    // 获取一些统计数据
    const userCount = getOne('SELECT COUNT(*) as count FROM users')?.count || 0;
    const photoCount = getOne('SELECT COUNT(*) as count FROM photo_history')?.count || 0;
    const orderCount = getOne('SELECT COUNT(*) as count FROM virtual_pay_orders')?.count || 0;
    
    return {
      status: 'connected',
      path: dbPath,
      size: `${dbSize}MB`,
      stats: {
        users: userCount,
        photos: photoCount,
        orders: orderCount
      }
    };
  } catch (e) {
    return {
      status: 'error',
      error: e.message
    };
  }
}

// 获取 Nginx 状态
function getNginxStatus() {
  return new Promise((resolve) => {
    exec('nginx -t 2>&1', (error, stdout, stderr) => {
      const output = stdout + stderr;
      if (output.includes('syntax is ok') && output.includes('test is successful')) {
        // 获取 Nginx 连接数
        exec('nginx -v 2>&1', (err, out, serr) => {
          const version = (out + serr).match(/nginx\/[\d.]+/)?.[0] || 'unknown';
          resolve({
            status: 'running',
            version: version,
            configValid: true
          });
        });
      } else {
        resolve({
          status: 'error',
          configValid: false,
          error: output
        });
      }
    });
  });
}

// ==================== 路由 ====================

// 健康检查端点
router.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  // 检查数据库连接
  let dbStatus = 'unknown';
  try {
    const db = getDb();
    db.exec('SELECT 1');
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'error';
  }

  res.json({
    code: 0,
    status: 'online',
    service: 'flashphoto-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: uptime,
    uptimeFormatted: formatUptime(uptime),
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024)
    },
    database: {
      status: dbStatus
    }
  });
});

// 监控聚合端点 - 获取所有服务状态
router.get('/status', async (req, res) => {
  try {
    // 并行获取各项状态
    const [miniprogramHealth, pm2Status, nginxStatus] = await Promise.all([
      checkServiceHealth(3001),
      getPM2Status(),
      getNginxStatus()
    ]);

    // 获取本服务状态
    const memUsage = process.memoryUsage();
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    const adminHealth = {
      status: 'online',
      service: 'flashphoto-api',
      port: 3000,
      uptime: uptime,
      uptimeFormatted: formatUptime(uptime),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      }
    };

    // 构建服务列表
    const services = [
      {
        name: 'flashphoto-api',
        displayName: '后台管理服务',
        port: 3000,
        ...adminHealth
      },
      {
        name: 'miniprogram-api',
        displayName: '小程序服务',
        port: 3001,
        status: miniprogramHealth.status,
        responseTime: miniprogramHealth.responseTime,
        uptime: miniprogramHealth.data?.uptime || 0,
        uptimeFormatted: miniprogramHealth.data?.uptimeFormatted || '-',
        memory: miniprogramHealth.data?.memory || {},
        env: miniprogramHealth.data?.env || 'unknown',
        error: miniprogramHealth.error
      }
    ];

    // 如果有 PM2 数据，补充进程信息
    if (Array.isArray(pm2Status)) {
      services.forEach(service => {
        const pm2Info = pm2Status.find(p => p.name === service.name);
        if (pm2Info) {
          service.pid = pm2Info.pid;
          service.restarts = pm2Info.restarts;
          service.pm2Status = pm2Info.status;
          service.pm2Memory = pm2Info.memory;
          service.pm2Cpu = pm2Info.cpu;
        }
      });
    }

    // 计算总体状态
    const allOnline = services.every(s => s.status === 'online');
    const anyOffline = services.some(s => s.status === 'offline');
    const overallStatus = allOnline ? 'healthy' : (anyOffline ? 'critical' : 'warning');

    res.json({
      code: 0,
      timestamp: new Date().toISOString(),
      overallStatus,
      services,
      database: getDatabaseInfo(),
      system: getSystemInfo(),
      nginx: nginxStatus,
      pm2: Array.isArray(pm2Status) ? { status: 'running', processes: pm2Status.length } : pm2Status
    });
  } catch (error) {
    console.error('监控状态获取失败:', error);
    res.status(500).json({
      code: -1,
      message: '获取监控状态失败',
      error: error.message
    });
  }
});

// 获取最近的错误日志
router.get('/logs', async (req, res) => {
  const { lines = 50, type = 'error' } = req.query;
  
  exec(`pm2 logs --lines ${lines} --nostream 2>&1`, (error, stdout, stderr) => {
    if (error) {
      return res.json({ code: -1, error: error.message });
    }
    
    const logs = (stdout + stderr).split('\n').filter(line => line.trim());
    res.json({
      code: 0,
      logs: logs.slice(-parseInt(lines))
    });
  });
});

// 重启服务
router.post('/restart/:service', async (req, res) => {
  const { service } = req.params;
  const allowedServices = ['miniprogram-api', 'flashphoto-api'];
  
  if (!allowedServices.includes(service)) {
    return res.status(400).json({ code: -1, message: '无效的服务名称' });
  }
  
  exec(`pm2 restart ${service}`, (error, stdout, stderr) => {
    if (error) {
      return res.json({ code: -1, error: error.message });
    }
    res.json({
      code: 0,
      message: `服务 ${service} 已重启`,
      output: stdout
    });
  });
});

module.exports = router;
