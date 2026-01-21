/**
 * Redis 消息处理器 - 小程序 API 服务
 * 订阅支付服务的消息，处理订单创建和支付完成
 */
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

// Redis 连接配置
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// 消息通道定义
const CHANNELS = {
  // 订单相关
  ORDER_CREATE_REQUEST: 'order:create:request',
  ORDER_CREATE_RESPONSE: 'order:create:response',
  PAYMENT_COMPLETE_REQUEST: 'payment:complete:request',
  PAYMENT_COMPLETE_RESPONSE: 'payment:complete:response',
  ORDER_QUERY_REQUEST: 'order:query:request',
  ORDER_QUERY_RESPONSE: 'order:query:response'
};

class RedisMessageHandler {
  constructor() {
    this.publisher = null;
    this.subscriber = null;
    this.isConnected = false;
    this.dbGetter = null; // 数据库获取函数
    this.dbRunner = null; // 数据库执行函数
    this.dbSaver = null;  // 数据库保存函数
  }

  /**
   * 初始化 Redis 连接
   * @param {Function} getDb - 获取数据库实例的函数
   * @param {Function} dbRun - 执行数据库语句的函数
   * @param {Function} saveDatabase - 保存数据库的函数
   */
  async connect(getDb, dbRun, saveDatabase) {
    if (this.isConnected) return;

    this.dbGetter = getDb;
    this.dbRunner = dbRun;
    this.dbSaver = saveDatabase;

    try {
      // 创建发布者连接
      this.publisher = new Redis(REDIS_URL, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      // 创建订阅者连接
      this.subscriber = new Redis(REDIS_URL, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      await this.publisher.connect();
      await this.subscriber.connect();

      // 订阅请求通道
      await this.subscriber.subscribe(
        CHANNELS.ORDER_CREATE_REQUEST,
        CHANNELS.PAYMENT_COMPLETE_REQUEST,
        CHANNELS.ORDER_QUERY_REQUEST
      );

      // 处理订阅消息
      this.subscriber.on('message', (channel, message) => {
        this.handleMessage(channel, message);
      });

      this.publisher.on('error', (err) => {
        console.error('[Redis Handler] Publisher 错误:', err.message);
      });

      this.subscriber.on('error', (err) => {
        console.error('[Redis Handler] Subscriber 错误:', err.message);
      });

      this.isConnected = true;
      console.log('[Redis Handler] 小程序 API 消息处理器连接成功');
    } catch (error) {
      console.error('[Redis Handler] 连接失败:', error.message);
      // 不抛出错误，允许服务在没有 Redis 的情况下运行
    }
  }

  /**
   * 处理接收到的消息
   */
  async handleMessage(channel, message) {
    try {
      const data = JSON.parse(message);
      const { messageId, timestamp, data: payload } = data;

      console.log(`[Redis Handler] 收到消息 [${channel}]:`, messageId);

      let response;

      switch (channel) {
        case CHANNELS.ORDER_CREATE_REQUEST:
          response = await this.handleCreateOrder(payload);
          await this.sendResponse(CHANNELS.ORDER_CREATE_RESPONSE, messageId, response);
          break;

        case CHANNELS.PAYMENT_COMPLETE_REQUEST:
          response = await this.handleCompletePayment(payload);
          await this.sendResponse(CHANNELS.PAYMENT_COMPLETE_RESPONSE, messageId, response);
          break;

        case CHANNELS.ORDER_QUERY_REQUEST:
          response = await this.handleQueryOrder(payload);
          await this.sendResponse(CHANNELS.ORDER_QUERY_RESPONSE, messageId, response);
          break;

        default:
          console.warn('[Redis Handler] 未知通道:', channel);
      }
    } catch (error) {
      console.error('[Redis Handler] 处理消息失败:', error);
    }
  }

  /**
   * 发送响应消息
   */
  async sendResponse(channel, messageId, data) {
    const response = {
      messageId,
      timestamp: new Date().toISOString(),
      ...data
    };

    await this.publisher.publish(channel, JSON.stringify(response));
    console.log(`[Redis Handler] 发送响应 [${channel}]:`, messageId);
  }

  /**
   * 处理创建订单请求
   */
  async handleCreateOrder(payload) {
    const { orderId, userId, amount, points, bonusPoints, paymentMethod } = payload;

    try {
      const db = this.dbGetter();

      if (!orderId || !userId || !amount || !points) {
        return { success: false, error: '缺少必要参数' };
      }

      // 检查订单是否已存在
      const existingOrder = db.prepare('SELECT id FROM orders WHERE id = ?').get(orderId);
      if (existingOrder) {
        return { success: true, orderId, message: '订单已存在' };
      }

      this.dbRunner(db,
        `INSERT INTO orders (id, user_id, amount, points_amount, bonus_points, status, payment_method, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`,
        [orderId, userId, amount, points, bonusPoints || 0, paymentMethod || 'wxpay']);
      
      this.dbSaver();

      console.log('[Redis Handler] 创建订单成功:', orderId);
      return { success: true, orderId };
    } catch (error) {
      console.error('[Redis Handler] 创建订单失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理完成支付请求
   */
  async handleCompletePayment(payload) {
    const { orderId, userId, points, amount, bonusPoints } = payload;

    try {
      const db = this.dbGetter();

      if (!orderId || !userId || !points) {
        return { success: false, error: '缺少必要参数' };
      }

      // 检查订单状态
      const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
      if (!order) {
        return { success: false, error: '订单不存在' };
      }

      if (order.status === 'paid') {
        const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
        return { success: true, orderId, newBalance: user?.points || 0, message: '订单已处理' };
      }

      const totalPoints = points + (bonusPoints || 0);

      // 更新订单状态
      this.dbRunner(db, "UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?", [orderId]);
      
      // 增加用户醒币
      this.dbRunner(db, "UPDATE users SET points = points + ?, updated_at = datetime('now') WHERE id = ?", [totalPoints, userId]);

      // 获取更新后的余额
      const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
      const newBalance = user ? user.points : totalPoints;

      // 记录积分流水
      const description = `充值 ¥${amount}` + (bonusPoints > 0 ? ` (含赠送${bonusPoints})` : '');
      this.dbRunner(db,
        `INSERT INTO points_records (id, user_id, type, amount, balance_after, description, order_id, created_at)
         VALUES (?, ?, 'recharge', ?, ?, ?, ?, datetime('now'))`,
        [uuidv4(), userId, totalPoints, newBalance, description, orderId]);

      this.dbSaver();

      console.log('[Redis Handler] 完成支付成功:', { orderId, userId, totalPoints, newBalance });
      return { success: true, orderId, newBalance };
    } catch (error) {
      console.error('[Redis Handler] 完成支付失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理查询订单请求
   */
  async handleQueryOrder(payload) {
    const { orderId } = payload;

    try {
      const db = this.dbGetter();

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (!order) {
        return { success: false, error: '订单不存在' };
      }

      return { success: true, order };
    } catch (error) {
      console.error('[Redis Handler] 查询订单失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 关闭连接
   */
  async disconnect() {
    if (this.publisher) {
      await this.publisher.quit();
    }
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    this.isConnected = false;
    console.log('[Redis Handler] 连接已关闭');
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    if (!this.isConnected) {
      return { status: 'disconnected', connected: false };
    }
    try {
      await this.publisher.ping();
      return { status: 'healthy', connected: true };
    } catch (error) {
      return { status: 'unhealthy', connected: false, error: error.message };
    }
  }
}

// 导出单例
const redisMessageHandler = new RedisMessageHandler();

module.exports = {
  redisMessageHandler,
  CHANNELS,
  RedisMessageHandler
};
