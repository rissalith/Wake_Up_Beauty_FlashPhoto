/**
 * Redis 客户端封装 - 支付服务
 * 提供消息发布/订阅功能，实现服务间异步通信
 */
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

// Redis 连接配置
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// 消息通道定义
// ⚠️ 重要：此定义必须与 core-api/lib/redis-message-handler.js 中的 CHANNELS 保持完全一致
// 如果修改此处，请同步更新 core-api 中的定义，否则服务间通信将失败
const CHANNELS = {
  // 订单相关
  ORDER_CREATE_REQUEST: 'order:create:request',
  ORDER_CREATE_RESPONSE: 'order:create:response',
  PAYMENT_COMPLETE_REQUEST: 'payment:complete:request',
  PAYMENT_COMPLETE_RESPONSE: 'payment:complete:response',
  ORDER_QUERY_REQUEST: 'order:query:request',
  ORDER_QUERY_RESPONSE: 'order:query:response'
};

// 消息超时时间（毫秒）
const MESSAGE_TIMEOUT = 10000;

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 5000
};

class RedisClient {
  constructor() {
    this.publisher = null;
    this.subscriber = null;
    this.isConnected = false;
    this.pendingRequests = new Map(); // 存储等待响应的请求
  }

  /**
   * 初始化 Redis 连接
   */
  async connect() {
    if (this.isConnected) return;

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

      // 订阅响应通道
      await this.subscriber.subscribe(
        CHANNELS.ORDER_CREATE_RESPONSE,
        CHANNELS.PAYMENT_COMPLETE_RESPONSE,
        CHANNELS.ORDER_QUERY_RESPONSE
      );

      // 处理订阅消息
      this.subscriber.on('message', (channel, message) => {
        this.handleResponse(channel, message);
      });

      this.publisher.on('error', (err) => {
        console.error('[Redis] Publisher 错误:', err.message);
      });

      this.subscriber.on('error', (err) => {
        console.error('[Redis] Subscriber 错误:', err.message);
      });

      this.isConnected = true;
      console.log('[Redis] 支付服务连接成功:', REDIS_URL);
    } catch (error) {
      console.error('[Redis] 连接失败:', error.message);
      throw error;
    }
  }

  /**
   * 处理响应消息
   */
  handleResponse(channel, message) {
    try {
      const data = JSON.parse(message);
      const { messageId } = data;

      if (messageId && this.pendingRequests.has(messageId)) {
        const { resolve, timer } = this.pendingRequests.get(messageId);
        clearTimeout(timer);
        this.pendingRequests.delete(messageId);
        resolve(data);
      }
    } catch (error) {
      console.error('[Redis] 解析响应消息失败:', error.message);
    }
  }

  /**
   * 发送请求并等待响应
   */
  async sendRequest(requestChannel, responseChannel, data, timeout = MESSAGE_TIMEOUT) {
    const messageId = uuidv4();
    const timestamp = new Date().toISOString();

    const message = {
      messageId,
      timestamp,
      data
    };

    return new Promise((resolve, reject) => {
      // 设置超时
      const timer = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new Error(`请求超时: ${requestChannel}`));
      }, timeout);

      // 存储待处理请求
      this.pendingRequests.set(messageId, { resolve, reject, timer });

      // 发布请求
      this.publisher.publish(requestChannel, JSON.stringify(message))
        .catch(err => {
          clearTimeout(timer);
          this.pendingRequests.delete(messageId);
          reject(err);
        });
    });
  }

  /**
   * 带重试的请求
   */
  async sendRequestWithRetry(requestChannel, responseChannel, data) {
    let lastError;
    
    for (let i = 0; i < RETRY_CONFIG.maxRetries; i++) {
      try {
        return await this.sendRequest(requestChannel, responseChannel, data);
      } catch (error) {
        lastError = error;
        console.warn(`[Redis] 请求失败 (${i + 1}/${RETRY_CONFIG.maxRetries}):`, error.message);
        
        if (i < RETRY_CONFIG.maxRetries - 1) {
          const delay = Math.min(
            RETRY_CONFIG.baseDelay * Math.pow(2, i),
            RETRY_CONFIG.maxDelay
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * 创建订单
   */
  async createOrder(orderData) {
    console.log('[Redis] 发送创建订单请求:', orderData.orderId);
    
    try {
      const response = await this.sendRequestWithRetry(
        CHANNELS.ORDER_CREATE_REQUEST,
        CHANNELS.ORDER_CREATE_RESPONSE,
        orderData
      );
      
      console.log('[Redis] 创建订单响应:', response);
      return response;
    } catch (error) {
      console.error('[Redis] 创建订单失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 完成支付
   */
  async completePayment(paymentData) {
    console.log('[Redis] 发送完成支付请求:', paymentData.orderId);
    
    try {
      const response = await this.sendRequestWithRetry(
        CHANNELS.PAYMENT_COMPLETE_REQUEST,
        CHANNELS.PAYMENT_COMPLETE_RESPONSE,
        paymentData
      );
      
      console.log('[Redis] 完成支付响应:', response);
      return response;
    } catch (error) {
      console.error('[Redis] 完成支付失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 查询订单
   */
  async queryOrder(orderId) {
    console.log('[Redis] 发送查询订单请求:', orderId);
    
    try {
      const response = await this.sendRequestWithRetry(
        CHANNELS.ORDER_QUERY_REQUEST,
        CHANNELS.ORDER_QUERY_RESPONSE,
        { orderId }
      );
      
      return response;
    } catch (error) {
      console.error('[Redis] 查询订单失败:', error.message);
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
    console.log('[Redis] 连接已关闭');
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      await this.publisher.ping();
      return { status: 'healthy', connected: true };
    } catch (error) {
      return { status: 'unhealthy', connected: false, error: error.message };
    }
  }
}

// 导出单例
const redisClient = new RedisClient();

module.exports = {
  redisClient,
  CHANNELS,
  RedisClient
};
