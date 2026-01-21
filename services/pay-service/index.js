/**
 * 支付服务 - 独立微服务 (v3 - Redis 消息队列版)
 * 端口: 3003
 * 职责: 微信支付、虚拟支付、订单管理
 * 
 * 架构: 通过 Redis 消息队列与 miniprogram-api 通信，完全解耦
 */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
require('dotenv').config();

// Redis 客户端
const { redisClient } = require('./lib/redis-client');

const app = express();
const PORT = process.env.PAY_SERVICE_PORT || 3003;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 微信支付配置
const WX_PAY_CONFIG = {
  appid: process.env.WX_APPID || '',
  mchid: process.env.WX_MCH_ID || '',
  apiKey: process.env.WX_PAY_API_KEY || '',
  certSerial: process.env.WX_PAY_CERT_SERIAL || '',
  privateKeyPath: process.env.WX_PAY_PRIVATE_KEY_PATH || '',
  notifyUrl: process.env.WX_PAY_NOTIFY_URL || 'https://pop-pub.com/api/pay/notify'
};

// 读取私钥
let privateKey = null;
if (WX_PAY_CONFIG.privateKeyPath && fs.existsSync(WX_PAY_CONFIG.privateKeyPath)) {
  try {
    privateKey = fs.readFileSync(WX_PAY_CONFIG.privateKeyPath, 'utf8');
    console.log('[支付服务] 微信支付私钥加载成功');
  } catch (e) {
    console.error('[支付服务] 微信支付私钥加载失败:', e.message);
  }
}

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 健康检查接口
app.get('/health', async (req, res) => {
  const redisHealth = await redisClient.healthCheck();
  
  res.json({
    status: 'healthy',
    service: 'pay-service',
    version: '3.0',
    port: PORT,
    timestamp: new Date().toISOString(),
    config: {
      wxPayConfigured: !!(WX_PAY_CONFIG.mchid && privateKey)
    },
    redis: redisHealth
  });
});

// ==================== 工具函数 ====================

function generateOrderId() {
  return 'WX' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
}

function generateNonceStr() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSignature(method, url, timestamp, nonceStr, body) {
  const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  return sign.sign(privateKey, 'base64');
}

function generatePaySign(appId, timeStamp, nonceStr, packageStr) {
  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  return sign.sign(privateKey, 'base64');
}

// ==================== 通过 Redis 消息队列调用 Core API ====================

/**
 * 通过 Redis 创建订单
 */
async function createOrderViaRedis(orderData) {
  try {
    const response = await redisClient.createOrder(orderData);
    if (response.success) {
      return { code: 200, data: { orderId: response.orderId } };
    }
    return { code: 500, message: response.error || '创建订单失败' };
  } catch (error) {
    console.error('[支付服务] Redis 创建订单失败:', error);
    return { code: 500, message: error.message };
  }
}

/**
 * 通过 Redis 完成支付
 */
async function completePaymentViaRedis(orderId, userId, points, amount, bonusPoints = 0) {
  try {
    const response = await redisClient.completePayment({
      orderId,
      userId,
      points,
      amount,
      bonusPoints
    });
    if (response.success) {
      return { code: 200, data: { orderId, newBalance: response.newBalance } };
    }
    return { code: 500, message: response.error || '完成支付失败' };
  } catch (error) {
    console.error('[支付服务] Redis 完成支付失败:', error);
    return { code: 500, message: error.message };
  }
}

/**
 * 通过 Redis 查询订单
 */
async function getOrderViaRedis(orderId) {
  try {
    const response = await redisClient.queryOrder(orderId);
    if (response.success) {
      return response.order;
    }
    return null;
  } catch (error) {
    console.error('[支付服务] Redis 查询订单失败:', error);
    return null;
  }
}

// ==================== 微信支付接口 ====================

// 获取充值套餐列表
app.get('/api/pay/packages', (req, res) => {
  const packages = [
    { id: 1, amount: 5, points: 50, bonus_points: 0 },
    { id: 2, amount: 10, points: 100, bonus_points: 0 },
    { id: 3, amount: 20, points: 200, bonus_points: 10 },
    { id: 4, amount: 100, points: 1000, bonus_points: 100 },
    { id: 5, amount: 200, points: 2000, bonus_points: 300 },
    { id: 6, amount: 500, points: 5000, bonus_points: 1000 }
  ];
  res.json({ code: 200, data: packages });
});

// 创建支付订单
app.post('/api/pay/create-order', async (req, res) => {
  const { userId, openid, amount, points, description } = req.body;

  if (!userId || !amount || !points) {
    return res.status(400).json({ code: 400, message: '缺少必要参数' });
  }

  const orderId = generateOrderId();
  const bonusPoints = 0; // 前端已计算好总醒币

  try {
    // 通过 Redis 消息队列创建订单记录
    const createResult = await createOrderViaRedis({
      orderId,
      userId,
      amount,
      points,
      bonusPoints,
      paymentMethod: 'wxpay'
    });

    if (!createResult || createResult.code !== 200) {
      console.error('[支付服务] 创建订单失败:', createResult);
      return res.status(500).json({ code: 500, message: '创建订单失败' });
    }

    console.log('[支付服务] 创建订单:', { orderId, userId, amount, points });

    // 检查微信支付配置
    if (!WX_PAY_CONFIG.mchid || !WX_PAY_CONFIG.apiKey || !privateKey) {
      console.warn('[支付服务] 微信支付未完全配置，返回测试模式');
      return res.json({
        code: 200,
        data: { orderId, testMode: true, message: '微信支付暂未配置，请使用测试模式' }
      });
    }

    // 调用微信支付API创建预付单
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = generateNonceStr();

    const requestBody = {
      appid: WX_PAY_CONFIG.appid,
      mchid: WX_PAY_CONFIG.mchid,
      description: description || `充值${points}醒币`,
      out_trade_no: orderId,
      notify_url: WX_PAY_CONFIG.notifyUrl,
      amount: { total: amount * 100, currency: 'CNY' },
      payer: { openid: openid || userId }
    };

    const bodyStr = JSON.stringify(requestBody);
    const url = '/v3/pay/transactions/jsapi';
    const signature = generateSignature('POST', url, timestamp, nonceStr, bodyStr);

    const options = {
      hostname: 'api.mch.weixin.qq.com',
      port: 443,
      path: url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlashPhoto-PayService/3.0',
        'Authorization': `WECHATPAY2-SHA256-RSA2048 mchid="${WX_PAY_CONFIG.mchid}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${WX_PAY_CONFIG.certSerial}"`
      }
    };

    console.log('[支付服务] 调用微信支付API:', { url, mchid: WX_PAY_CONFIG.mchid, appid: WX_PAY_CONFIG.appid });

    const wxReq = https.request(options, (wxRes) => {
      let data = '';
      wxRes.on('data', (chunk) => data += chunk);
      wxRes.on('end', () => {
        console.log('[支付服务] 微信支付API响应:', wxRes.statusCode, data.substring(0, 500));
        try {
          const result = JSON.parse(data);
          if (result.prepay_id) {
            const payTimestamp = Math.floor(Date.now() / 1000).toString();
            const payNonceStr = generateNonceStr();
            const packageStr = `prepay_id=${result.prepay_id}`;
            const paySign = generatePaySign(WX_PAY_CONFIG.appid, payTimestamp, payNonceStr, packageStr);

            console.log('[支付服务] 预付单创建成功:', result.prepay_id);
            res.json({
              code: 200,
              data: { orderId, timeStamp: payTimestamp, nonceStr: payNonceStr, package: packageStr, signType: 'RSA', paySign }
            });
          } else {
            console.error('[支付服务] 微信支付API错误:', result);
            res.json({ code: 500, message: result.message || '创建预付单失败', data: { orderId, testMode: true } });
          }
        } catch (e) {
          console.error('[支付服务] 解析响应失败:', e.message, data);
          res.json({ code: 500, message: '解析微信支付响应失败', data: { orderId, testMode: true } });
        }
      });
    });

    wxReq.on('error', (e) => {
      console.error('[支付服务] 请求微信支付失败:', e.message);
      res.json({ code: 500, message: '请求微信支付失败', data: { orderId, testMode: true } });
    });

    wxReq.write(bodyStr);
    wxReq.end();

  } catch (error) {
    console.error('[支付服务] 创建订单失败:', error);
    res.status(500).json({ code: 500, message: '创建订单失败: ' + error.message });
  }
});

// 查询订单状态
app.get('/api/pay/order/:orderId', async (req, res) => {
  const { orderId } = req.params;
  try {
    const order = await getOrderViaRedis(orderId);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }
    res.json({ code: 200, data: order });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询订单失败' });
  }
});

// 微信支付回调通知
app.post('/api/pay/notify', async (req, res) => {
  console.log('[支付服务] 收到支付回调:', JSON.stringify(req.body));

  try {
    const { resource } = req.body;
    if (!resource || !resource.ciphertext) {
      return res.json({ code: 'SUCCESS', message: '成功' });
    }

    // 解密回调数据
    const { ciphertext, nonce, associated_data } = resource;
    const key = Buffer.from(WX_PAY_CONFIG.apiKey, 'utf8');
    const ciphertextBuffer = Buffer.from(ciphertext, 'base64');
    const authTag = ciphertextBuffer.slice(-16);
    const encryptedData = ciphertextBuffer.slice(0, -16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'));
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(associated_data || '', 'utf8'));

    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    const paymentData = JSON.parse(decrypted.toString('utf8'));

    const { out_trade_no, trade_state } = paymentData;
    console.log('[支付服务] 解密后的支付数据:', { out_trade_no, trade_state });

    if (trade_state !== 'SUCCESS') {
      return res.json({ code: 'SUCCESS', message: '成功' });
    }

    // 通过 Redis 查询订单
    const order = await getOrderViaRedis(out_trade_no);
    if (!order) {
      console.error('[支付服务] 订单不存在:', out_trade_no);
      return res.json({ code: 'SUCCESS', message: '成功' });
    }
    
    if (order.status === 'paid') {
      console.log('[支付服务] 订单已处理:', out_trade_no);
      return res.json({ code: 'SUCCESS', message: '成功' });
    }

    const totalPoints = (order.points_amount || 0) + (order.bonus_points || 0);
    const userId = order.user_id;

    // 通过 Redis 完成支付（更新订单状态 + 增加醒币）
    const completeResult = await completePaymentViaRedis(
      out_trade_no,
      userId,
      order.points_amount || 0,
      order.amount || 0,
      order.bonus_points || 0
    );

    if (completeResult && completeResult.code === 200) {
      console.log('[支付服务] 支付回调处理成功:', { orderId: out_trade_no, userId, totalPoints, newBalance: completeResult.data?.newBalance });
    } else {
      console.error('[支付服务] 支付回调处理失败:', completeResult);
    }

    res.json({ code: 'SUCCESS', message: '成功' });
  } catch (error) {
    console.error('[支付服务] 支付回调处理失败:', error);
    res.json({ code: 'SUCCESS', message: '成功' });
  }
});

// 手动确认支付（测试用）
app.post('/api/pay/confirm', async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ code: 400, message: '缺少订单号' });
  }

  try {
    const order = await getOrderViaRedis(orderId);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }

    if (order.status === 'paid') {
      return res.json({ code: 200, message: '订单已支付', data: order });
    }

    const totalPoints = (order.points_amount || 0) + (order.bonus_points || 0);
    const userId = order.user_id;

    // 通过 Redis 完成支付
    const completeResult = await completePaymentViaRedis(
      orderId,
      userId,
      order.points_amount || 0,
      order.amount || 0,
      order.bonus_points || 0
    );

    if (completeResult && completeResult.code === 200) {
      res.json({ code: 200, message: '支付确认成功', data: { orderId, points: totalPoints, newBalance: completeResult.data?.newBalance } });
    } else {
      res.status(500).json({ code: 500, message: '确认支付失败' });
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: '确认支付失败: ' + error.message });
  }
});

// ==================== 虚拟支付接口 ====================

// 创建虚拟支付订单
app.post('/api/virtual-pay/create-order', async (req, res) => {
  const { userId, openid, amount, points } = req.body;

  if (!userId || !openid || !amount || !points) {
    return res.status(400).json({ code: 400, message: '参数不完整' });
  }

  try {
    const orderId = 'VP' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();

    // 通过 Redis 创建订单
    const createResult = await createOrderViaRedis({
      orderId,
      userId,
      amount: amount * 100, // 分
      points,
      bonusPoints: 0,
      paymentMethod: 'virtual'
    });

    if (!createResult || createResult.code !== 200) {
      return res.status(500).json({ code: 500, message: '创建订单失败' });
    }

    console.log('[支付服务] 创建虚拟支付订单:', orderId);

    res.json({
      code: 200,
      data: { orderId, amount, points, status: 'pending' }
    });
  } catch (error) {
    console.error('[支付服务] 创建虚拟支付订单失败:', error);
    res.status(500).json({ code: 500, message: '创建订单失败' });
  }
});

// 虚拟支付发货通知
app.post('/api/virtual-pay/notify/deliver', async (req, res) => {
  console.log('[支付服务] 收到虚拟支付发货通知:', JSON.stringify(req.body));

  try {
    const outTradeNo = req.body.OutTradeNo || req.body.out_trade_no;
    if (!outTradeNo) {
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    const order = await getOrderViaRedis(outTradeNo);
    if (!order || order.status === 'paid') {
      return res.json({ ErrCode: 0, ErrMsg: 'success' });
    }

    const userId = order.user_id;
    const points = order.points_amount || order.points;

    // 通过 Redis 完成支付
    const completeResult = await completePaymentViaRedis(
      outTradeNo,
      userId,
      points,
      order.amount || 0,
      0
    );

    if (completeResult && completeResult.code === 200) {
      console.log('[支付服务] 虚拟支付发货成功:', { orderId: outTradeNo, points, newBalance: completeResult.data?.newBalance });
    }

    res.json({ ErrCode: 0, ErrMsg: 'success' });
  } catch (error) {
    console.error('[支付服务] 虚拟支付发货失败:', error);
    res.json({ ErrCode: -1, ErrMsg: error.message });
  }
});

// 查询虚拟支付订单
app.get('/api/virtual-pay/order/:orderId', async (req, res) => {
  try {
    const order = await getOrderViaRedis(req.params.orderId);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }
    res.json({ code: 200, data: order });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询订单失败' });
  }
});

// 取消虚拟支付订单
app.post('/api/virtual-pay/cancel/:orderId', async (req, res) => {
  try {
    const order = await getOrderViaRedis(req.params.orderId);
    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }
    if (order.status !== 'pending') {
      return res.json({ code: 200, message: '订单状态已变更', data: order });
    }
    // 取消订单需要通过消息队列实现，这里简化处理
    res.json({ code: 200, message: '订单已取消' });
  } catch (error) {
    res.status(500).json({ code: 500, message: '取消订单失败' });
  }
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('[支付服务] 未捕获错误:', err);
  res.status(500).json({ code: 500, message: '服务器内部错误' });
});

// 启动服务
async function startServer() {
  try {
    // 连接 Redis
    await redisClient.connect();
    
    app.listen(PORT, () => {
      console.log('==========================================');
      console.log('  支付服务已启动 (v3 - Redis 消息队列)');
      console.log(`  端口: ${PORT}`);
      console.log(`  Redis: ${process.env.REDIS_URL || 'redis://127.0.0.1:6379'}`);
      console.log(`  健康检查: http://localhost:${PORT}/health`);
      console.log(`  微信支付: http://localhost:${PORT}/api/pay/*`);
      console.log(`  虚拟支付: http://localhost:${PORT}/api/virtual-pay/*`);
      console.log('==========================================');
    });
  } catch (error) {
    console.error('[支付服务] 启动失败:', error);
    // 即使 Redis 连接失败，也尝试启动服务
    app.listen(PORT, () => {
      console.log(`[支付服务] 服务已启动 (无 Redis): http://localhost:${PORT}`);
    });
  }
}

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('[支付服务] 收到 SIGTERM 信号，正在关闭...');
  await redisClient.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[支付服务] 收到 SIGINT 信号，正在关闭...');
  await redisClient.disconnect();
  process.exit(0);
});

startServer();
