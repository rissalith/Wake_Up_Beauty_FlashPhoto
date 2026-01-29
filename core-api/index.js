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
const { cacheManager } = require('./lib/cache');

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
const miniprogramFeedbackRoutes = require('./routes/miniprogram/feedback');
const miniprogramSecurityRoutes = require('./routes/miniprogram/security');
const miniprogramBehaviorRoutes = require('./routes/miniprogram/behavior');
const miniprogramDrawRoutes = require('./routes/miniprogram/draw');
const miniprogramVideoRewardRoutes = require('./routes/miniprogram/video-reward');

// 后台管理路由
const adminAuthRoutes = require('./routes/admin/auth');
const adminUsersRoutes = require('./routes/admin/users');
const adminStatsRoutes = require('./routes/admin/stats');
const adminConfigRoutes = require('./routes/admin/config');
const adminScenesRoutes = require('./routes/admin/scenes');
const adminMonitorRoutes = require('./routes/admin/monitor');
const adminGradeSchemesRoutes = require('./routes/admin/grade-schemes');

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
app.use('/api/feedback', miniprogramFeedbackRoutes);
app.use('/api/security', miniprogramSecurityRoutes);
app.use('/api/behavior', miniprogramBehaviorRoutes);
app.use('/api/draw', miniprogramDrawRoutes);
app.use('/api/video-reward', miniprogramVideoRewardRoutes);

// 注册后台管理路由 (带 /admin 前缀)
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/stats', adminStatsRoutes);
app.use('/api/admin/config', adminConfigRoutes);
app.use('/api/admin/scenes', adminScenesRoutes);
app.use('/api/admin/monitor', adminMonitorRoutes);
app.use('/api/admin/grade-schemes', adminGradeSchemesRoutes);

// 兼容旧版前端 API 路径 (不带 /admin 前缀)
app.use('/api/auth', adminAuthRoutes);
app.use('/api/users', adminUsersRoutes);
app.use('/api/stats', adminStatsRoutes);
app.use('/api/scenes', adminScenesRoutes); // 场景管理
app.use('/api/monitor', adminMonitorRoutes); // 服务监控

// 注册额外路由（如果存在）
if (adminTranslateRoutes) app.use('/api/translate', adminTranslateRoutes);
if (adminPhotosRoutes) app.use('/api/photos', adminPhotosRoutes);

// ==================== 额外兼容路由 ====================

// 同步照片到服务器
app.post('/api/sync/photo', (req, res) => {
  try {
    const db = getDb();
    const { photo_id, user_id, original_image, result_image, spec, bg_color, status, created_at } = req.body;

    if (!photo_id || !user_id) {
      return res.status(400).json({ code: -1, msg: '缺少必要参数' });
    }

    // 检查是否已存在
    const existing = db.prepare('SELECT id FROM photo_history WHERE id = ?').get(photo_id);

    if (existing) {
      // 更新
      dbRun(db, `
        UPDATE photo_history
        SET original_url = COALESCE(?, original_url),
            result_url = COALESCE(?, result_url),
            spec = COALESCE(?, spec),
            bg_color = COALESCE(?, bg_color),
            status = COALESCE(?, status)
        WHERE id = ?
      `, [original_image || null, result_image || null, spec || null, bg_color || null, status || null, photo_id]);
    } else {
      // 插入
      dbRun(db, `
        INSERT INTO photo_history (id, user_id, original_url, result_url, spec, bg_color, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [photo_id, user_id, original_image || null, result_image || null, spec || null, bg_color || null, status || 'done', created_at || new Date().toISOString()]);
    }

    saveDatabase();
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('同步照片错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 图片上传接口（用于反馈等）
app.post('/api/upload/image', async (req, res) => {
  try {
    const { isCOSConfigured, uploadToAssetBucket, ASSET_COS_CONFIG } = require('./config/cos');
    const { userId, imageData, type = 'feedback' } = req.body;

    if (!userId || !imageData) {
      return res.status(400).json({ code: -1, msg: '缺少必要参数' });
    }

    if (!isCOSConfigured()) {
      return res.status(503).json({ code: -1, msg: 'COS 未配置' });
    }

    // 解析 base64 图片
    const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ code: -1, msg: '无效的图片格式' });
    }

    const ext = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // 生成文件名
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const fileName = `${timestamp}_${randomStr}.${ext}`;
    const key = `${type}/${userId}/${fileName}`;

    // 上传到 COS
    const result = await uploadToAssetBucket(buffer, key, `image/${ext}`);

    res.json({
      code: 200,
      data: {
        url: result.url || `${ASSET_COS_CONFIG.baseUrl}/${key}`,
        key
      }
    });
  } catch (error) {
    console.error('上传图片错误:', error);
    res.status(500).json({ code: -1, msg: '上传失败: ' + error.message });
  }
});

// 兼容路由：/api/users/sign-agreement -> /api/user/sign-agreement
app.post('/api/users/sign-agreement', (req, res) => {
  try {
    const db = getDb();
    const { userId, agreementType } = req.body;

    if (!userId || !agreementType) {
      return res.status(400).json({ code: -1, msg: '缺少参数' });
    }

    // 查找用户
    let user = db.prepare('SELECT * FROM users WHERE id = ? OR openid = ?').get(userId, userId);
    if (!user) {
      return res.status(404).json({ code: -1, msg: '用户不存在' });
    }

    const now = new Date().toISOString();

    if (agreementType === 'privacy') {
      dbRun(db, 'UPDATE users SET privacy_agreed = 1, agreement_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [now, user.id]);
    } else if (agreementType === 'terms') {
      dbRun(db, 'UPDATE users SET terms_agreed = 1, agreement_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [now, user.id]);
    } else if (agreementType === 'all') {
      dbRun(db, 'UPDATE users SET privacy_agreed = 1, terms_agreed = 1, agreement_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [now, user.id]);
    }

    saveDatabase();

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);

    res.json({
      code: 0,
      msg: 'success',
      data: {
        privacyAgreed: updatedUser?.privacy_agreed === 1,
        termsAgreed: updatedUser?.terms_agreed === 1,
        agreementTime: updatedUser?.agreement_time || now
      }
    });
  } catch (error) {
    console.error('签署协议错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

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
    let sql = 'SELECT pr.id as record_id, pr.*, u.nickname, u.openid, u.avatar_url FROM points_records pr LEFT JOIN users u ON pr.user_id = u.id WHERE 1=1';
    const params = [];
    if (userId) { sql += ' AND pr.user_id = ?'; params.push(userId); }
    if (type) { sql += ' AND pr.type = ?'; params.push(type); }
    sql += ' ORDER BY pr.created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const records = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace(/SELECT pr\.id as record_id, pr\.\*, u\.nickname, u\.openid, u\.avatar_url/i, 'SELECT COUNT(*) as count')).get(...params).count;
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
  const { isCOSConfigured, COS_CONFIG } = require('./config/cos');
  const configured = isCOSConfigured();
  res.json({
    code: 0,
    data: {
      configured,
      bucket: COS_CONFIG.bucket,
      region: COS_CONFIG.region,
      baseUrl: COS_CONFIG.baseUrl,
      message: configured ? 'COS 已配置' : 'COS 未配置'
    }
  });
});

// COS 用户列表
app.get('/api/photos/cos/users', async (req, res) => {
  try {
    const { isCOSConfigured, getAllUserIds } = require('./config/cos');
    if (!isCOSConfigured()) {
      return res.status(503).json({ code: 503, message: 'COS未配置' });
    }

    const userIds = await getAllUserIds();
    const db = getDb();

    // 批量查询用户详情，避免 N+1 查询
    let users = [];
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      const dbUsers = db.prepare(`SELECT id as user_id, nickname, avatar_url FROM users WHERE id IN (${placeholders})`).all(...userIds);
      const userMap = new Map(dbUsers.map(u => [u.user_id, u]));
      users = userIds.map(userId => userMap.get(userId) || { user_id: userId, nickname: userId, fromCOS: true });
    }

    res.json({ code: 0, data: users });
  } catch (error) {
    console.error('获取COS用户失败:', error);
    res.status(500).json({ code: 500, message: '获取用户列表失败: ' + error.message });
  }
});

// COS 照片列表
app.get('/api/photos/cos/list', async (req, res) => {
  try {
    const { isCOSConfigured, getAllUserPhotos, getUserPhotos } = require('./config/cos');
    const { page = 1, pageSize = 20, userId = '', type = '', scene = '' } = req.query;

    if (!isCOSConfigured()) {
      return res.status(503).json({ code: 503, message: 'COS未配置' });
    }

    let photos = [];
    if (userId) {
      photos = await getUserPhotos(userId);
    } else {
      photos = await getAllUserPhotos(scene);
    }

    // 按类型筛选
    if (type) {
      photos = photos.filter(p => p.type === type);
    }

    // 按场景筛选（如果还没在 getAllUserPhotos 中筛选）
    if (scene && !userId) {
      // 已在 getAllUserPhotos 中筛选
    } else if (scene && userId) {
      photos = photos.filter(p => p.scene === scene);
    }

    // 按时间排序（最新的在前）
    photos.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    // 分页
    const total = photos.length;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const pagedPhotos = photos.slice(offset, offset + parseInt(pageSize));

    // 批量获取用户信息，避免 N+1 查询
    const db = getDb();
    const userIds = [...new Set(pagedPhotos.map(p => p.userId).filter(Boolean))];
    let userMap = new Map();
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      const dbUsers = db.prepare(`SELECT id as user_id, nickname, avatar_url FROM users WHERE id IN (${placeholders})`).all(...userIds);
      userMap = new Map(dbUsers.map(u => [u.user_id, u]));
    }
    const organizedPhotos = pagedPhotos.map(photo => ({
      ...photo,
      user: userMap.get(photo.userId) || { user_id: photo.userId, nickname: photo.userId }
    }));

    res.json({
      code: 0,
      data: {
        list: organizedPhotos,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取COS照片失败:', error);
    res.status(500).json({ code: 500, message: '获取COS照片失败: ' + error.message });
  }
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
app.get('/api/assets/list', async (req, res) => {
  try {
    const { isCOSConfigured, getAllAssets } = require('./config/cos');
    if (!isCOSConfigured()) {
      return res.status(503).json({ code: 503, message: 'COS未配置' });
    }
    const result = await getAllAssets();
    res.json({ code: 0, data: result });
  } catch (error) {
    console.error('[Assets] 获取素材列表失败:', error);
    res.status(500).json({ code: 500, message: '获取素材列表失败: ' + error.message });
  }
});

// 素材上传
const multer = require('multer');
const uploadStorage = multer.memoryStorage();
const assetUpload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'), false);
    }
  }
});

app.post('/api/assets/upload', assetUpload.single('file'), async (req, res) => {
  try {
    const { isCOSConfigured, uploadToAssetBucket, ASSET_COS_CONFIG } = require('./config/cos');
    const path = require('path');

    if (!isCOSConfigured()) {
      return res.status(503).json({ code: 503, message: 'COS未配置' });
    }

    const { category, lang, name, state } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ code: 400, message: '请选择文件' });
    }

    let key = '';
    const ext = path.extname(file.originalname) || '.png';
    const timestamp = Date.now();

    switch (category) {
      case 'banner':
        const bannerDir = lang === 'en' ? 'banner-en' : 'banner';
        key = `${bannerDir}/${timestamp}${ext}`;
        break;
      case 'feature':
        const featureLang = lang === 'en' ? 'en' : 'zh-cn';
        key = `feature-${featureLang}${ext}`;
        break;
      case 'title':
        const titleLang = lang === 'en' ? 'en' : 'zh-cn';
        key = `title-${titleLang}${ext}`;
        break;
      case 'tabbar':
        const suffix = state === 'active' ? '-active' : '';
        key = `tab-${name}${suffix}${ext}`;
        break;
      case 'scene-icon':
        key = `scene-${timestamp}${ext}`;
        break;
      case 'ui-icon':
        key = `icon/${file.originalname}`;
        break;
      default:
        key = `misc/${timestamp}${ext}`;
    }

    const result = await uploadToAssetBucket(file.buffer, key, file.mimetype);
    console.log(`[Assets] 素材上传成功: ${result.url}`);

    res.json({
      code: 200,
      message: '上传成功',
      data: {
        key: result.key,
        url: result.url,
        fileName: key.split('/').pop()
      }
    });
  } catch (error) {
    console.error('[Assets] 素材上传失败:', error);
    res.status(500).json({ code: 500, message: '上传失败: ' + error.message });
  }
});

// 素材删除
app.delete('/api/assets/delete', async (req, res) => {
  try {
    const { isCOSConfigured, deleteFromAssetBucket } = require('./config/cos');

    if (!isCOSConfigured()) {
      return res.status(503).json({ code: 503, message: 'COS未配置' });
    }

    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ code: 400, message: '缺少key参数' });
    }

    await deleteFromAssetBucket(key);
    console.log(`[Assets] 素材删除成功: ${key}`);

    res.json({ code: 0, message: '删除成功' });
  } catch (error) {
    console.error('[Assets] 素材删除失败:', error);
    res.status(500).json({ code: 500, message: '删除失败: ' + error.message });
  }
});

// AI生成图片
app.post('/api/assets/ai-generate', async (req, res) => {
  try {
    const http = require('http');
    const { prompt, folder = 'ai-generated' } = req.body;

    if (!prompt) {
      return res.status(400).json({ code: 400, message: '请输入生成提示词' });
    }

    console.log('[Assets] AI生成图片请求, prompt:', prompt.substring(0, 100) + '...');

    // 调用AI服务
    const postData = JSON.stringify({ prompt });
    const options = {
      hostname: process.env.AI_SERVICE_HOST || 'flashphoto-ai-service',
      port: 3002,
      path: '/api/ai/generate-image',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const aiResponse = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('AI服务响应解析失败'));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(120000, () => {
        req.destroy();
        reject(new Error('AI服务请求超时'));
      });
      req.write(postData);
      req.end();
    });

    if (aiResponse.code !== 0 || !aiResponse.data?.imageBase64) {
      return res.status(500).json({
        code: 500,
        message: aiResponse.message || 'AI生成失败'
      });
    }

    console.log('[Assets] AI图片生成成功');

    // 返回base64图片供预览（不直接上传COS）
    res.json({
      code: 0,
      message: '生成成功',
      data: {
        imageBase64: aiResponse.data.imageBase64,
        mimeType: aiResponse.data.mimeType || 'image/png'
      }
    });
  } catch (error) {
    console.error('[Assets] AI生成图片失败:', error);
    res.status(500).json({ code: 500, message: 'AI生成失败: ' + error.message });
  }
});

// 确认保存AI生成的图片到COS
app.post('/api/assets/ai-save', async (req, res) => {
  try {
    const { isCOSConfigured, uploadToAssetBucket, ASSET_COS_CONFIG } = require('./config/cos');
    const db = getDb();

    if (!isCOSConfigured()) {
      return res.status(503).json({ code: 503, message: 'COS未配置' });
    }

    const { imageBase64, prompt, name, folder = 'ai-generated' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ code: 400, message: '缺少图片数据' });
    }

    // 转换base64为buffer
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const timestamp = Date.now();
    const fileName = name ? `${name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')}_${timestamp}.png` : `${timestamp}.png`;
    const key = `${folder}/${fileName}`;

    // 上传到COS
    const result = await uploadToAssetBucket(imageBuffer, key, 'image/png');
    console.log('[Assets] AI图片保存成功:', result.url);

    // 保存元数据到数据库
    try {
      db.prepare(`
        INSERT INTO asset_metadata (key, url, name, source, prompt, created_at)
        VALUES (?, ?, ?, 'ai-generated', ?, datetime('now'))
      `).run(key, result.url, name || fileName, prompt || '');
    } catch (dbError) {
      console.warn('[Assets] 保存元数据失败（表可能不存在）:', dbError.message);
    }

    res.json({
      code: 0,
      message: '保存成功',
      data: {
        key: result.key,
        url: result.url,
        fileName: fileName
      }
    });
  } catch (error) {
    console.error('[Assets] AI图片保存失败:', error);
    res.status(500).json({ code: 500, message: '保存失败: ' + error.message });
  }
});

// 获取素材元数据
app.get('/api/assets/metadata/:key', async (req, res) => {
  try {
    const db = getDb();
    const key = decodeURIComponent(req.params.key);

    const metadata = db.prepare('SELECT * FROM asset_metadata WHERE key = ?').get(key);

    res.json({
      code: 0,
      data: metadata || null
    });
  } catch (error) {
    console.error('[Assets] 获取元数据失败:', error);
    res.status(500).json({ code: 500, message: '获取元数据失败' });
  }
});

// 更新素材元数据（重命名等）
app.put('/api/assets/metadata/:key', async (req, res) => {
  try {
    const db = getDb();
    const key = decodeURIComponent(req.params.key);
    const { name } = req.body;

    db.prepare(`
      UPDATE asset_metadata SET name = ?, updated_at = datetime('now') WHERE key = ?
    `).run(name, key);

    res.json({ code: 0, message: '更新成功' });
  } catch (error) {
    console.error('[Assets] 更新元数据失败:', error);
    res.status(500).json({ code: 500, message: '更新失败' });
  }
});

// 获取Banner列表
app.get('/api/assets/banners', async (req, res) => {
  try {
    const { isCOSConfigured, listAssetObjects, ASSET_COS_CONFIG } = require('./config/cos');

    if (!isCOSConfigured()) {
      return res.status(503).json({ code: 503, message: 'COS未配置' });
    }

    const { lang = 'zh-CN' } = req.query;
    let prefix = 'banner/';
    if (lang === 'en') prefix = 'banner-en/';

    const data = await listAssetObjects(prefix);
    const banners = (data.Contents || [])
      .filter(item => /\.(jpg|jpeg|png|webp)$/i.test(item.Key))
      .map(item => ({
        key: item.Key,
        url: `${ASSET_COS_CONFIG.baseUrl}/${item.Key}`,
        fileName: item.Key.split('/').pop()
      }))
      .sort((a, b) => a.fileName.localeCompare(b.fileName));

    res.json({ code: 0, data: banners });
  } catch (error) {
    console.error('[Assets] 获取Banner失败:', error);
    res.status(500).json({ code: 500, message: '获取Banner失败' });
  }
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

// 批量保存场景配置（步骤+选项+Prompt）
app.post('/api/config/admin/scene/:sceneId/batch-save', (req, res) => {
  try {
    const db = getDb();
    const { sceneId } = req.params;
    const { steps, prompt } = req.body;

    console.log('[batch-save] 开始保存场景配置, sceneId:', sceneId);

    // 使用事务
    const transaction = db.transaction(() => {
      const stepIdMap = {}; // 用于映射前端临时ID到数据库ID

      // 1. 先删除不在列表中的步骤和选项
      if (steps && steps.length > 0) {
        const keepStepIds = steps
          .filter(s => s.id && !String(s.id).startsWith('temp_') && typeof s.id === 'number')
          .map(s => s.id);

        if (keepStepIds.length > 0) {
          // 先删除被移除步骤的选项
          db.prepare(`DELETE FROM step_options WHERE step_id IN (
            SELECT id FROM scene_steps WHERE scene_id = ? AND id NOT IN (${keepStepIds.join(',')})
          )`).run(sceneId);
          // 再删除被移除的步骤
          db.prepare(`DELETE FROM scene_steps WHERE scene_id = ? AND id NOT IN (${keepStepIds.join(',')})`).run(sceneId);
        } else {
          // 如果没有保留的步骤（全是新步骤），先删除该场景所有旧步骤
          db.prepare(`DELETE FROM step_options WHERE step_id IN (SELECT id FROM scene_steps WHERE scene_id = ?)`).run(sceneId);
          db.prepare(`DELETE FROM scene_steps WHERE scene_id = ?`).run(sceneId);
        }
      }

      // 2. 保存所有步骤
      if (steps && steps.length > 0) {
        console.log('[batch-save] 开始保存步骤, 步骤数:', steps.length);

        for (const step of steps) {
          const title = step.title || step.step_name || 'Untitled';
          const titleEn = step.title_en || step.step_name_en || 'Untitled';
          const componentType = step.component_type || step.step_type || 'select';
          const isVisible = step.is_visible !== undefined ? step.is_visible : (step.is_active !== false);
          const configStr = step.config ? JSON.stringify(step.config) : '';

          // 摇骰子定价配置
          const freeCount = step.free_count !== undefined ? step.free_count : 1;
          const costPerRoll = step.cost_per_roll !== undefined ? step.cost_per_roll : 10;

          if (step.id && !String(step.id).startsWith('temp_') && typeof step.id === 'number') {
            // 更新现有步骤
            db.prepare(`UPDATE scene_steps SET
              step_key = ?,
              title = ?,
              title_en = ?,
              component_type = ?,
              step_order = ?,
              is_required = ?,
              is_visible = ?,
              icon = ?,
              gender_based = ?,
              config = ?,
              free_count = ?,
              cost_per_roll = ?
              WHERE id = ?`).run(
              step.step_key || '',
              title,
              titleEn,
              componentType,
              step.step_order || 0,
              step.is_required ? 1 : 0,
              isVisible ? 1 : 0,
              step.icon || '',
              step.gender_based ? 1 : 0,
              configStr,
              freeCount,
              costPerRoll,
              step.id
            );
            stepIdMap[step.id] = step.id;
          } else {
            // 插入新步骤
            const result = db.prepare(`INSERT INTO scene_steps (scene_id, step_key, step_name, step_name_en, title, title_en, component_type, step_order, is_required, is_visible, icon, gender_based, config, free_count, cost_per_roll, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
              sceneId,
              step.step_key || '',
              title,
              titleEn,
              title,
              titleEn,
              componentType,
              step.step_order || 0,
              step.is_required ? 1 : 0,
              isVisible ? 1 : 0,
              step.icon || '',
              step.gender_based ? 1 : 0,
              configStr,
              freeCount,
              costPerRoll
            );
            stepIdMap[step.id || `temp_${step.step_order}`] = result.lastInsertRowid;
          }
        }

        // 获取所有步骤的ID映射（用于新步骤）
        const savedSteps = db.prepare(`SELECT id, step_key, step_order FROM scene_steps WHERE scene_id = ? ORDER BY step_order ASC`).all(sceneId);
        steps.forEach((step, index) => {
          if (!step.id || String(step.id).startsWith('temp_')) {
            const matchedStep = savedSteps.find(s => s.step_order === (step.step_order || index));
            if (matchedStep) {
              stepIdMap[step.id || `temp_${index}`] = matchedStep.id;
            }
          }
        });

        // 3. 保存所有选项
        for (const step of steps) {
          const realStepId = stepIdMap[step.id] || step.id;
          console.log(`[batch-save] 处理步骤选项: step.id=${step.id}, step.step_key=${step.step_key}, realStepId=${realStepId}, options数量=${(step.options || []).length}`);
          if (!realStepId) continue;

          // 获取要保留的选项ID列表
          const keepOptionIds = (step.options || [])
            .filter(o => o.id && !String(o.id).startsWith('temp_') && typeof o.id === 'number')
            .map(o => o.id);
          console.log(`[batch-save] 步骤 ${step.step_key}: keepOptionIds=${JSON.stringify(keepOptionIds)}`);

          // 删除该步骤下被移除的选项
          if (keepOptionIds.length > 0) {
            db.prepare(`DELETE FROM step_options WHERE step_id = ? AND id NOT IN (${keepOptionIds.join(',')})`).run(realStepId);
          } else {
            db.prepare(`DELETE FROM step_options WHERE step_id = ?`).run(realStepId);
          }

          if (!step.options) continue;

          for (const opt of step.options) {
            console.log(`[batch-save] 处理选项: opt.id=${opt.id}, opt.option_key=${opt.option_key}, opt.label=${opt.label}, opt.color=${opt.color}`);
            const label = opt.label || opt.name || '';
            const labelEn = opt.label_en || opt.name_en || '';
            const image = opt.image || opt.image_url || '';
            const color = opt.color || opt.option_value || '';
            const promptText = opt.prompt_text || '';
            const isVisible = opt.is_visible !== undefined ? opt.is_visible : (opt.is_active !== false);

            const metadata = {};
            if (opt.width) metadata.width = opt.width;
            if (opt.height) metadata.height = opt.height;
            const metadataStr = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : '';

            if (opt.id && !String(opt.id).startsWith('temp_') && typeof opt.id === 'number') {
              db.prepare(`UPDATE step_options SET
                option_key = ?,
                label = ?,
                label_en = ?,
                color = ?,
                image = ?,
                prompt_text = ?,
                sort_order = ?,
                is_visible = ?,
                is_default = ?,
                gender = ?,
                extra_points = ?,
                metadata = ?
                WHERE id = ?`).run(
                opt.option_key || '',
                label,
                labelEn,
                color,
                image,
                promptText,
                opt.sort_order || 0,
                isVisible ? 1 : 0,
                opt.is_default ? 1 : 0,
                opt.gender || null,
                opt.extra_points || 0,
                metadataStr,
                opt.id
              );
            } else {
              console.log(`[batch-save] 插入新选项: step_id=${realStepId}, option_key=${opt.option_key}, label=${label}, color=${color}`);
              db.prepare(`INSERT INTO step_options (step_id, option_key, label, label_en, color, image, prompt_text, sort_order, is_visible, is_default, gender, extra_points, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                realStepId,
                opt.option_key || '',
                label,
                labelEn,
                color,
                image,
                promptText,
                opt.sort_order || 0,
                isVisible ? 1 : 0,
                opt.is_default ? 1 : 0,
                opt.gender || null,
                opt.extra_points || 0,
                metadataStr
              );
              console.log(`[batch-save] 选项插入成功`);
            }
          }
        }
      }

      // 4. 保存Prompt模板
      if (prompt && prompt.template) {
        const templateContent = prompt.template;
        const templateName = prompt.name || prompt.template_name || '';
        const negativePrompt = prompt.negative_prompt || '';
        const segments = prompt.segments || null;
        const modelConfig = prompt.model_config || null;
        const existing = db.prepare(`SELECT id FROM prompt_templates WHERE scene_id = ?`).get(sceneId);
        if (existing) {
          db.prepare(`UPDATE prompt_templates SET template = ?, name = ?, negative_prompt = ?, segments = ?, model_config = ?, updated_at = datetime('now') WHERE scene_id = ?`).run(
            templateContent, templateName, negativePrompt, segments, modelConfig, sceneId
          );
        } else {
          db.prepare(`INSERT INTO prompt_templates (scene_id, name, template, negative_prompt, segments, model_config) VALUES (?, ?, ?, ?, ?, ?)`).run(
            sceneId, templateName, templateContent, negativePrompt, segments, modelConfig
          );
        }
      }
    });

    // 执行事务
    transaction();
    saveDatabase();

    console.log('[batch-save] 保存成功');
    res.json({ code: 200, message: '批量保存成功' });
  } catch (error) {
    console.error('[batch-save] 保存失败:', error);
    res.status(500).json({ code: 500, message: '批量保存失败: ' + error.message });
  }
});

// 保存场景基本信息
app.post('/api/config/admin/scene', (req, res) => {
  try {
    const db = getDb();
    const data = req.body;

    const sceneKey = data.scene_key || data.id;
    if (!sceneKey) {
      return res.status(400).json({ code: -1, msg: '场景ID不能为空' });
    }

    // 检查是否存在
    const existing = db.prepare('SELECT id FROM scenes WHERE scene_key = ? OR id = ?').get(sceneKey, sceneKey);

    if (existing) {
      // 更新
      db.prepare(`UPDATE scenes SET
        name = COALESCE(?, name),
        name_en = COALESCE(?, name_en),
        description = COALESCE(?, description),
        description_en = COALESCE(?, description_en),
        icon = COALESCE(?, icon),
        points_cost = COALESCE(?, points_cost),
        status = COALESCE(?, status),
        is_review_safe = COALESCE(?, is_review_safe),
        use_dynamic_render = COALESCE(?, use_dynamic_render),
        sort_order = COALESCE(?, sort_order),
        is_highlighted = COALESCE(?, is_highlighted),
        highlight_color = COALESCE(?, highlight_color),
        highlight_intensity = COALESCE(?, highlight_intensity),
        updated_at = CURRENT_TIMESTAMP
        WHERE scene_key = ? OR id = ?`).run(
        data.name || null,
        data.name_en || null,
        data.description || null,
        data.description_en || null,
        data.icon || null,
        data.points_cost || data.price || null,
        data.status || null,
        data.is_review_safe !== undefined ? data.is_review_safe : null,
        data.use_dynamic_render !== undefined ? data.use_dynamic_render : null,
        data.sort_order !== undefined ? data.sort_order : null,
        data.is_highlighted !== undefined ? data.is_highlighted : null,
        data.highlight_color || null,
        data.highlight_intensity !== undefined ? data.highlight_intensity : null,
        sceneKey,
        sceneKey
      );
    } else {
      // 插入
      db.prepare(`INSERT INTO scenes (scene_key, name, name_en, description, description_en, icon, points_cost, status, is_review_safe, use_dynamic_render, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        sceneKey,
        data.name || '',
        data.name_en || '',
        data.description || '',
        data.description_en || '',
        data.icon || '',
        data.points_cost || data.price || 50,
        data.status || 'inactive',
        data.is_review_safe || 0,
        data.use_dynamic_render || 1,
        data.sort_order || 0
      );
    }

    saveDatabase();
    res.json({ code: 200, message: '保存成功' });
  } catch (error) {
    console.error('保存场景失败:', error);
    res.status(500).json({ code: -1, msg: '服务器错误: ' + error.message });
  }
});

// 更新场景状态
app.post('/api/config/admin/scene/status', (req, res) => {
  try {
    const db = getDb();
    const { id, status } = req.body;

    if (!id || !status) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    db.prepare('UPDATE scenes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE scene_key = ? OR id = ?').run(status, id, id);
    saveDatabase();

    res.json({ code: 200, message: '状态更新成功' });
  } catch (error) {
    console.error('更新场景状态失败:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 订单列表
app.get('/api/orders', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, pageSize = 20, status, keyword } = req.query;
    let sql = 'SELECT o.id as order_id, o.*, u.nickname, u.openid, u.avatar_url FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND o.status = ?'; params.push(status); }
    if (keyword) { sql += ' AND (o.id LIKE ? OR u.nickname LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    sql += ' ORDER BY o.created_at DESC';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const list = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    const total = db.prepare(sql.replace(/SELECT o\.id as order_id, o\.\*, u\.nickname, u\.openid, u\.avatar_url/i, 'SELECT COUNT(*) as count')).get(...params).count;
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

    // 初始化缓存管理器
    try {
      await cacheManager.connect();
      console.log('[Core API] 缓存管理器已连接');
    } catch (cacheError) {
      console.warn('[Core API] 缓存连接失败，将使用无缓存模式:', cacheError.message);
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
  await cacheManager.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Core API] 收到 SIGINT 信号，正在关闭...');
  await redisMessageHandler.disconnect();
  await cacheManager.disconnect();
  process.exit(0);
});

startServer();
