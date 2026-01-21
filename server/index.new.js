const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 导入数据库工具
const {
  initDatabase,
  getDb,
  saveDatabase,
  getRewardConfig,
  findUserByIdOrOpenid,
  dbRun
} = require('./utils/database');

// 导入服务
const signService = require('./services/signService');
const virtualPayConfig = require('./config/virtualPay');

// 导入路由模块
const userRoutes = require('./routes/user');
const pointsRoutes = require('./routes/points');
const photoRoutes = require('./routes/photo');
const internalRoutes = require('./routes/internal');
const adminRoutes = require('./routes/admin');
const inviteRoutes = require('./routes/invite');
const virtualPayRoutes = require('./routes/virtual-pay');
const rewardsRoutes = require('./routes/rewards');

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 将数据库工具函数和服务挂载到 app.locals，供路由使用
app.locals.getDb = getDb;
app.locals.saveDatabase = saveDatabase;
app.locals.getRewardConfig = getRewardConfig;
app.locals.findUserByIdOrOpenid = findUserByIdOrOpenid;
app.locals.dbRun = dbRun;
app.locals.signService = signService;
app.locals.virtualPayConfig = virtualPayConfig;
app.locals.currentEnv = process.env.NODE_ENV || 'test';

// 注册路由
app.use('/api/user', userRoutes);
app.use('/api/users', userRoutes);
app.use('/api/points', pointsRoutes);
app.use('/api/photo', photoRoutes);
app.use('/api/internal', internalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/virtual-pay', virtualPayRoutes);
app.use('/api/rewards', rewardsRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'test'
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    code: -1,
    msg: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    code: -1,
    msg: '接口不存在'
  });
});

// 初始化数据库
initDatabase();

// 启动服务器
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  服务器已启动`);
  console.log(`  端口: ${PORT}`);
  console.log(`  环境: ${process.env.NODE_ENV || 'test'}`);
  console.log(`  时间: ${new Date().toISOString()}`);
  console.log(`========================================`);
});

module.exports = app;
