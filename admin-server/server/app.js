require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDatabase } = require('./config/database');
const { initCOS, cleanupExpiredTempFiles } = require('./config/cos');

const app = express();

// 中间件
app.set('trust proxy', 1);
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求频率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 1000, // 最多1000次请求
  message: { code: 429, message: '请求过于频繁，请稍后再试' }
});
app.use('/api/', limiter);

// 路由
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const ordersRoutes = require('./routes/orders');
const photosRoutes = require('./routes/photos');
const couponsRoutes = require('./routes/coupons');
const statsRoutes = require('./routes/stats');
const syncRoutes = require('./routes/sync');
const pointsRoutes = require('./routes/points');
const rechargeRoutes = require('./routes/recharge');
const inviteRoutes = require('./routes/invite');
const feedbackRoutes = require('./routes/feedback');
const uploadRoutes = require('./routes/upload');
const securityRoutes = require('./routes/security');
const configRoutes = require('./routes/config');
const assetsRoutes = require('./routes/assets');
const payRoutes = require('./routes/pay');
const virtualPayRoutes = require('./routes/virtual-pay');
const monitorRoutes = require('./routes/monitor');
const translateRoutes = require('./routes/translate');
const aiAgentRoutes = require('./routes/ai-agent');

console.log('正在加载路由...');
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/photos', photosRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/points', pointsRoutes);
app.use('/api/recharge', rechargeRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/config', configRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/pay', payRoutes);
app.use('/api/virtual-pay', virtualPayRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/ai-agent', aiAgentRoutes);

console.log('路由加载完成: 所有路由已注册，包括 /api/ai-agent');

// 健康检查端点（无需认证）
app.get('/api/health', (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    code: 0,
    status: 'online',
    service: 'flashphoto-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
    }
  });
});

// 兼容小程序单数路由
app.use('/api/user', usersRoutes);
app.use('/api/photo', photosRoutes);

// 静态文件服务（前端构建后的文件）
app.use(express.static(path.join(__dirname, 'public')));

// 所有未匹配的路由返回前端入口
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public/admin/index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).json({ message: '醒美闪图后台管理系统 API 服务正在运行' });
    }
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ code: 500, message: '服务器内部错误' });
});

// 启动服务
async function startServer() {
  try {
    // 初始化数据库
    await initDatabase();

    // 初始化COS（可选，如果有配置的话）
    initCOS();

    // 启动定时清理任务（每 6 小时清理一次过期临时文件）
    const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 小时
    const TEMP_FILE_MAX_AGE = 24; // 临时文件最大保留时间（小时）

    setInterval(async () => {
      console.log('[定时任务] 开始清理过期临时文件...');
      try {
        const result = await cleanupExpiredTempFiles(TEMP_FILE_MAX_AGE);
        console.log(`[定时任务] 清理完成: 扫描 ${result.scanned} 个文件，删除 ${result.deleted} 个过期文件`);
      } catch (err) {
        console.error('[定时任务] 清理失败:', err.message);
      }
    }, CLEANUP_INTERVAL);

    // 启动时也执行一次清理
    setTimeout(async () => {
      console.log('[启动任务] 执行首次临时文件清理...');
      try {
        const result = await cleanupExpiredTempFiles(TEMP_FILE_MAX_AGE);
        console.log(`[启动任务] 清理完成: 扫描 ${result.scanned} 个文件，删除 ${result.deleted} 个过期文件`);
      } catch (err) {
        console.error('[启动任务] 清理失败:', err.message);
      }
    }, 30000); // 启动 30 秒后执行

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`醒美闪图后台管理系统已启动`);
      console.log(`API 服务: http://localhost:${PORT}`);
      console.log(`定时清理: 每 ${CLEANUP_INTERVAL / 3600000} 小时清理 ${TEMP_FILE_MAX_AGE} 小时前的临时文件`);
    });
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

startServer();
