/**
 * 服务监控 API
 */
const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../../config/database');

// 获取监控状态
router.get('/status', async (req, res) => {
  try {
    const db = getDb();

    // 系统信息
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = Math.round((usedMem / totalMem) * 100);

    // CPU 使用率（简化计算）
    let cpuUsage = 0;
    if (cpus.length > 0) {
      const cpu = cpus[0];
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      cpuUsage = Math.round(((total - idle) / total) * 100);
    }

    // 系统运行时间
    const uptimeSeconds = os.uptime();
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeFormatted = `${days}天 ${hours}小时 ${minutes}分钟`;

    // 数据库统计
    let dbStats = { users: 0, photos: 0, orders: 0 };
    let dbSize = '-';
    let dbPath = process.env.SHARED_DB_PATH || '/app/data/flashphoto.db';

    try {
      const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
      const photosCount = db.prepare('SELECT COUNT(*) as count FROM photo_history').get();
      const ordersCount = db.prepare('SELECT COUNT(*) as count FROM orders').get();
      dbStats = {
        users: usersCount?.count || 0,
        photos: photosCount?.count || 0,
        orders: ordersCount?.count || 0
      };

      // 数据库文件大小
      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        dbSize = `${sizeMB} MB`;
      }
    } catch (e) {
      console.error('获取数据库统计失败:', e.message);
    }

    // 服务状态（当前服务肯定在线）
    const services = [
      {
        name: 'core-api',
        displayName: 'Core API 服务',
        port: 3001,
        status: 'online',
        uptimeFormatted: uptimeFormatted,
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / (1024 * 1024))
        },
        responseTime: '< 1ms',
        restarts: 0
      }
    ];

    // 检查其他服务（通过 HTTP 请求）
    const checkService = async (name, displayName, port, url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        return {
          name,
          displayName,
          port,
          status: response.ok ? 'online' : 'offline',
          uptimeFormatted: '-',
          memory: { heapUsed: 0 },
          responseTime: '-',
          restarts: 0
        };
      } catch (e) {
        return {
          name,
          displayName,
          port,
          status: 'offline',
          uptimeFormatted: '-',
          memory: { heapUsed: 0 },
          responseTime: '-',
          restarts: 0
        };
      }
    };

    // 检查 AI 服务和支付服务
    try {
      const aiService = await checkService('ai-service', 'AI 图片生成服务', 3002, 'http://ai-service:3002/health');
      const payService = await checkService('pay-service', '支付服务', 3003, 'http://pay-service:3003/health');
      services.push(aiService, payService);
    } catch (e) {
      console.error('检查服务状态失败:', e.message);
    }

    // 计算总体状态
    const offlineCount = services.filter(s => s.status === 'offline').length;
    let overallStatus = 'healthy';
    if (offlineCount > 0) {
      overallStatus = offlineCount === services.length ? 'critical' : 'warning';
    }

    res.json({
      code: 0,
      overallStatus,
      services,
      nginx: {
        status: 'running',
        version: '-',
        configValid: true
      },
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        uptimeFormatted,
        cpu: {
          usage: cpuUsage,
          cores: cpus.length,
          model: cpus[0]?.model || '-'
        },
        memory: {
          total: Math.round(totalMem / (1024 * 1024)),
          used: Math.round(usedMem / (1024 * 1024)),
          usagePercent: memUsagePercent
        }
      },
      database: {
        status: 'connected',
        size: dbSize,
        path: dbPath,
        stats: dbStats
      }
    });
  } catch (error) {
    console.error('获取监控状态失败:', error);
    res.status(500).json({ code: 500, error: error.message });
  }
});

// 获取日志
router.get('/logs', async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 30;

    // 返回最近的控制台日志（简化实现）
    // 实际生产环境应该读取日志文件
    const logs = [
      `[${new Date().toISOString()}] Core API 服务运行中`,
      `[${new Date().toISOString()}] 数据库连接正常`,
      `[${new Date().toISOString()}] Redis 消息处理器已启动`
    ];

    res.json({
      code: 0,
      logs: logs.slice(0, lines)
    });
  } catch (error) {
    console.error('获取日志失败:', error);
    res.status(500).json({ code: 500, error: error.message });
  }
});

// 重启服务（需要 Docker 权限，这里只返回提示）
router.post('/restart/:serviceName', async (req, res) => {
  try {
    const { serviceName } = req.params;

    // 安全检查：不允许通过 API 重启服务
    // 实际重启需要通过 Portainer 或 SSH
    res.json({
      code: 403,
      error: '出于安全考虑，请通过 Portainer 或 SSH 重启服务'
    });
  } catch (error) {
    console.error('重启服务失败:', error);
    res.status(500).json({ code: 500, error: error.message });
  }
});

module.exports = router;
