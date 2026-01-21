/**
 * Core API 服务 - 统一后端服务
 * 端口: 3001
 * 职责: 小程序API + 后台管理API + Redis消息处理
 * 
 * 架构: 合并了 miniprogram-api 和 admin-api，统一数据库和认证
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// 核心模块
const { initDatabase, getDb, dbRun, saveDatabase } = require('./config/database');
const { redisMessageHandler } = require('./lib/redis-message-handler');

const app = express();
const PORT = process.env.PORT || 3001;

// ==================== 中间件配置 ====================

// 信任代理（Nginx）
app.set('trust proxy', 1);

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Service']
}));

// Body 解析
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 请求频率限制
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 2000,
  message: { code: 429, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

// 请求日志
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000 || res.statusCode >= 400) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// ==================== 路由加载 ====================

// 小程序端路由
const miniprogramUserRoutes = require('./routes/miniprogram/user');
const miniprogramPointsRoutes = require('./routes/miniprogram/points');
const miniprogramPhotoRoutes = require('./routes/miniprogram/photo');
const miniprogramInviteRoutes = require('./routes/miniprogram/invite');
const miniprogramConfigRoutes = require('./routes/miniprogram/config');
const miniprogramVirtualPayRoutes = require('./routes/miniprogram/virtual-pay');

// 后台管理路由
const adminAuthRoutes = require('./routes/admin/auth');
const adminUsersRoutes = require('./routes/admin/users');
const adminStatsRoutes = require('./routes/admin/stats');
const adminConfigRoutes = require('./routes/admin/config');
const adminScenesRoutes = require('./routes/admin/scenes');

// 尝试加载额外路由（可能不存在）
let adminTranslateRoutes, adminPhotosRoutes;
try { adminTranslateRoutes = require('./routes/admin/translate'); } catch(e) { console.log('[Core API] translate routes not found:', e.message); }
try { adminPhotosRoutes = require('./routes/admin/photos'); } catch(e) { console.log('[Core API] photos routes not found:', e.message); }

// 初始化 COS
try {
  const { initCOS } = require('./config/cos');
  initCOS();
} catch(e) { console.log('[Core API] COS init failed:', e.message); }

// 注册小程序路由
app.use('/api/user', miniprogramUserRoutes);
app.use('/api/points', miniprogramPointsRoutes);
app.use('/api/photo', miniprogramPhotoRoutes);
app.use('/api/invite', miniprogramInviteRoutes);
app.use('/api/config', miniprogramConfigRoutes);
app.use('/api/virtual-pay', miniprogramVirtualPayRoutes);

// 注册后台管理路由 (带 /admin 前缀)
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/stats', adminStatsRoutes);
app.use('/api/admin/config', adminConfigRoutes);
app.use('/api/admin/scenes', adminScenesRoutes);

// 兼容旧版前端 API 路径 (不带 /admin 前缀)
app.use('/api/auth', adminAuthRoutes);
app.use('/api/users', adminUsersRoutes);
app.use('/api/stats', adminStatsRoutes);
app.use('/api/scenes', adminScenesRoutes); // 场景管理

// 注册额外路由（如果存在）
if (adminTranslateRoutes) app.use('/api/translate', adminTranslateRoutes);
if (adminPhotosRoutes) app.use('/api/photos', adminPhotosRoutes);

// ==================== 额外兼容路由 ====================

// 积分管理相关 API
app.get('/api/points/packages/all', (req, res) => {
  try {
    const db = getDb();
    const packages = [
      { id: 1, amount: 5, points: 50, bonus_points: 0, is_active: 1 },
      { id: 2, amount: 10, points: 100, bonus_points: 0, is_active: 1 },
      { id: 3, amount: 20, points: 200, bonus_points: 10, is_active: 1 },
      { id: 4, amount: 100, points: 1000, bonus_points: 100, is_active: 1 },
      { id: 5, amount: 200, points: 2000, bonus_points: 300, is_active: 1 },
      { id: 6, amount: 500, points: 5000, bonus_points: 1000, is_active: 1 }
    ];
    res.json({ code: 0, data: packages });
  } catch (error) {
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

app.get('/api/points/rewards/all', (req, res) => {
  try {
    const db = getDb();
    const rewards = db.prepare('SELECT * FROM point_rewards').all();
    res.json({ code: 0, data: rewards });
  } catch (error) {
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

app.get('/api/points/stats', (req, res) => {
  try {
    const db = getDb();
    const totalPoints = db.prepare('SELECT SUM(points) as sum FROM users').get().sum || 0;
    const totalRecharge = db.prepare("SELECT SUM(amount) as sum FROM points_records WHERE type = 'recharge'").get().sum || 0;
    const totalConsume = db.prepare("SELECT SUM(ABS(amount)) as sum FROM points_records WHERE type = 'consume'").get().sum || 0;
    res.json({ code: 0, data: { totalPoints, totalRecharge, totalConsume } });
  } catch (error) {
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

app.get('/api/points/records', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, pageSize = 20, userId, type } = req.query;
    let sql = 'SELECT pr.*, u.nickname, u.openid FROM points_records pr LEFT JOIN users u ON pr.user_id = u.id WHERE 1=1';
    const params = [];
    if (userId) { sql += ' AND pr.user_id = ?'; params.push(userId); }
    if (type) { sql += ' AND pr.type = ?'; params.push(type); }
    sql += ' ORDER BY pr.created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const records = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace(/SELECT pr\.\*, u\.nickname, u\.openid/i, 'SELECT COUNT(*) as count')).get(...params).count;
    res.json({ code: 0, data: { list: records, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (error) {
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 订单统计
app.get('/api/orders/stats/summary', (req, res) => {
  try {
    const db = getDb();
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    const paidOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'paid'").get().count;
    const totalRevenue = db.prepare("SELECT SUM(amount) as sum FROM orders WHERE status = 'paid'").get().sum || 0;
    res.json({ code: 0, data: { total: totalOrders, paid: paidOrders, revenue: totalRevenue } });
  } catch (error) {
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 照片 COS 状态
app.get('/api/photos/cos/status', (req, res) => {
  const { isCOSConfigured } = require('./config/cos');
  const configured = isCOSConfigured();
  res.json({
    code: 0,
    data: {
      configured,
      message: configured ? 'COS 已配置' : 'COS 未配置'
    }
  });
});

// 反馈列表
app.get('/api/feedback/admin/list', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, pageSize = 20, status } = req.query;
    let sql = 'SELECT f.*, u.nickname, u.openid FROM feedbacks f LEFT JOIN users u ON f.user_id = u.id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND f.status = ?'; params.push(status); }
    sql += ' ORDER BY f.created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const list = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace(/SELECT f\.\*, u\.nickname, u\.openid/i, 'SELECT COUNT(*) as count')).get(...params).count;
    res.json({ code: 0, data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (error) {
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 场景配置 (admin)
app.get('/api/config/admin/scenes', (req, res) => {
  try {
    const db = getDb();
    const scenes = db.prepare('SELECT * FROM scenes ORDER BY sort_order').all();
    res.json({ code: 0, data: scenes });
  } catch (error) {
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 素材列表
app.get('/api/assets/list', (req, res) => {
  res.json({ code: 0, data: { list: [], total: 0 } });
});

// ==================== 场景步骤和Prompt相关API ====================

// 获取场景步骤 (兼容多种路径)
app.get(['/api/config/scenes/:sceneId/steps', '/api/config/admin/scene/:sceneId/steps'], (req, res) => {
  try {
    const db = getDb();
    const { sceneId } = req.params;
    const steps = db.prepare('SELECT * FROM scene_steps WHERE scene_id = ? ORDER BY step_order').all(sceneId);
    
    // 获取每个步骤的选项
    const stepsWithOptions = steps.map(step => {
      const options = db.prepare('SELECT * FROM step_options WHERE step_id = ? ORDER BY sort_order').all(step.id);
      return { ...step, name: step.step_name, options };
    });
    
    res.json({ code: 0, data: stepsWithOptions });
  } catch (error) {
    console.error('获取场景步骤错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取所有Prompt模板
app.get('/api/config/prompts', (req, res) => {
  try {
    const db = getDb();
    const prompts = db.prepare('SELECT * FROM prompt_templates ORDER BY created_at DESC').all();
    res.json({ code: 0, data: prompts });
  } catch (error) {
    console.error('获取Prompt模板错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取场景的Prompt模板 (按场景ID) - 前端调用 /api/config/admin/prompts/:sceneId
app.get('/api/config/admin/prompts/:sceneId', (req, res) => {
  try {
    const db = getDb();
    const { sceneId } = req.params;
    const prompts = db.prepare('SELECT * FROM prompt_templates WHERE scene_id = ?').all(sceneId);
    res.json({ code: 0, data: prompts });
  } catch (error) {
    console.error('获取场景Prompt模板错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取单个Prompt模板
app.get('/api/config/prompts/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const prompt = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(id);
    if (!prompt) {
      return res.status(404).json({ code: -1, msg: 'Prompt模板不存在' });
    }
    res.json({ code: 0, data: prompt });
  } catch (error) {
    console.error('获取Prompt模板错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 保存场景步骤
app.post('/api/config/scenes/:sceneId/steps', (req, res) => {
  try {
    const db = getDb();
    const { sceneId } = req.params;
    const { steps } = req.body;
    
    // 删除旧的步骤和选项
    const oldSteps = db.prepare('SELECT id FROM scene_steps WHERE scene_id = ?').all(sceneId);
    oldSteps.forEach(step => {
      db.prepare('DELETE FROM step_options WHERE step_id = ?').run(step.id);
    });
    db.prepare('DELETE FROM scene_steps WHERE scene_id = ?').run(sceneId);
    
    // 插入新的步骤和选项
    steps.forEach((step, idx) => {
      const stepResult = db.prepare(`
        INSERT INTO scene_steps (scene_id, step_key, name, description, type, is_required, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(sceneId, step.step_key || step.stepKey, step.name, step.description || '', step.type || 'single', step.is_required !== false ? 1 : 0, idx);
      
      const stepId = stepResult.lastInsertRowid;
      
      if (step.options && step.options.length) {
        step.options.forEach((opt, optIdx) => {
          db.prepare(`
            INSERT INTO step_options (step_id, option_key, name, value, icon, is_default, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(stepId, opt.option_key || opt.optionKey, opt.name, opt.value || '', opt.icon || '', opt.is_default ? 1 : 0, optIdx);
        });
      }
    });
    
    saveDatabase();
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('保存场景步骤错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 保存Prompt模板
app.post('/api/config/prompts', (req, res) => {
  try {
    const db = getDb();
    const { scene_id, name, template_content, variables } = req.body;
    
    const result = db.prepare(`
      INSERT INTO prompt_templates (scene_id, name, template_content, variables)
      VALUES (?, ?, ?, ?)
    `).run(scene_id, name, template_content, JSON.stringify(variables || []));
    
    saveDatabase();
    res.json({ code: 0, data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('保存Prompt模板错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 更新Prompt模板
app.put('/api/config/prompts/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, template_content, variables } = req.body;
    
    db.prepare(`
      UPDATE prompt_templates SET name = ?, template_content = ?, variables = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, template_content, JSON.stringify(variables || []), id);
    
    saveDatabase();
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('更新Prompt模板错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 删除Prompt模板
app.delete('/api/config/prompts/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    db.prepare('DELETE FROM prompt_templates WHERE id = ?').run(id);
    saveDatabase();
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('删除Prompt模板错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取场景的Prompt
app.get('/api/scenes/:sceneId/prompts', (req, res) => {
  try {
    const db = getDb();
    const { sceneId } = req.params;
    const prompts = db.prepare('SELECT * FROM prompt_templates WHERE scene_id = ?').all(sceneId);
    res.json({ code: 0, data: prompts });
  } catch (error) {
    console.error('获取场景Prompt错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 订单列表
app.get('/api/orders', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, pageSize = 20, status, keyword } = req.query;
    let sql = 'SELECT o.*, u.nickname, u.openid FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND o.status = ?'; params.push(status); }
    if (keyword) { sql += ' AND (o.id LIKE ? OR u.nickname LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    sql += ' ORDER BY o.created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const list = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace(/SELECT o\.\*, u\.nickname, u\.openid/i, 'SELECT COUNT(*) as count')).get(...params).count;
    res.json({ code: 0, data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (error) {
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 照片列表
app.get('/api/photos', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, pageSize = 20, status, userId } = req.query;
    let sql = 'SELECT ph.*, u.nickname, u.openid FROM photo_history ph LEFT JOIN users u ON ph.user_id = u.id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND ph.status = ?'; params.push(status); }
    if (userId) { sql += ' AND ph.user_id = ?'; params.push(userId); }
    sql += ' ORDER BY ph.created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const list = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace(/SELECT ph\.\*, u\.nickname, u\.openid/i, 'SELECT COUNT(*) as count')).get(...params).count;
    res.json({ code: 0, data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (error) {
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ==================== 健康检查 ====================
const startTime = Date.now();

app.get('/api/health', async (req, res) => {
  const memUsage = process.memoryUsage();
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  let dbStatus = 'unknown';
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'error: ' + e.message;
  }
  
  const redisHealth = await redisMessageHandler.healthCheck();
  
  res.json({
    code: 0,
    status: 'online',
    service: 'core-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime,
    uptimeFormatted: formatUptime(uptime),
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024)
    },
    database: { status: dbStatus },
    redis: redisHealth
  });
});

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

// ==================== 静态文件服务 ====================
app.use(express.static(path.join(__dirname, 'public')));

// 后台管理前端
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/index.html'), (err) => {
    if (err) {
      res.status(200).json({ message: 'Admin frontend not deployed' });
    }
  });
});

// ==================== 错误处理 ====================
app.use((err, req, res, next) => {
  console.error('[Core API] 未捕获错误:', err);
  res.status(500).json({ code: 500, message: '服务器内部错误' });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ code: 404, message: 'API 端点不存在' });
});

// ==================== 启动服务 ====================
async function startServer() {
  try {
    // 初始化数据库
    await initDatabase();
    console.log('[Core API] 数据库初始化完成');
    
    // 初始化 Redis 消息处理器
    try {
      await redisMessageHandler.connect(getDb, dbRun, saveDatabase);
      console.log('[Core API] Redis 消息处理器已连接');
    } catch (redisError) {
      console.warn('[Core API] Redis 连接失败，服务将在无 Redis 模式下运行:', redisError.message);
    }
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log('==========================================');
      console.log('  Core API 服务已启动 (统一后端)');
      console.log(`  端口: ${PORT}`);
      console.log(`  Redis: ${process.env.REDIS_URL || 'redis://127.0.0.1:6379'}`);
      console.log('  路由:');
      console.log('    小程序: /api/user, /api/points, /api/photo, /api/invite');
      console.log('    管理后台: /api/admin/*');
      console.log('    健康检查: /api/health');
      console.log('==========================================');
    });
  } catch (error) {
    console.error('[Core API] 启动失败:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('[Core API] 收到 SIGTERM 信号，正在关闭...');
  await redisMessageHandler.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Core API] 收到 SIGINT 信号，正在关闭...');
  await redisMessageHandler.disconnect();
  process.exit(0);
});

startServer();
