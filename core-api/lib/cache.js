/**
 * Redis 缓存工具
 * 用于缓存统计数据等高频查询结果
 */
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// 缓存键前缀
const CACHE_PREFIX = 'flashphoto:cache:';

// 缓存过期时间（秒）
const CACHE_TTL = {
  STATS_DASHBOARD: 60,      // 仪表盘统计 1 分钟
  STATS_TRENDS: 300,        // 趋势数据 5 分钟
  STATS_ORDERS: 60,         // 订单统计 1 分钟
  CONFIG_PUBLIC: 600,       // 公开配置 10 分钟
  SCENES_LIST: 300,         // 场景列表 5 分钟
};

class CacheManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) return;

    try {
      this.client = new Redis(REDIS_URL, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        enableOfflineQueue: false
      });

      await this.client.connect();

      this.client.on('error', (err) => {
        console.error('[Cache] Redis 错误:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        this.isConnected = true;
      });

      this.isConnected = true;
      console.log('[Cache] Redis 缓存连接成功');
    } catch (error) {
      console.warn('[Cache] Redis 连接失败，将使用无缓存模式:', error.message);
      this.isConnected = false;
    }
  }

  /**
   * 获取缓存
   * @param {string} key 缓存键
   * @returns {Promise<any|null>}
   */
  async get(key) {
    if (!this.isConnected || !this.client) return null;

    try {
      const data = await this.client.get(CACHE_PREFIX + key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[Cache] 获取缓存失败:', error.message);
      return null;
    }
  }

  /**
   * 设置缓存
   * @param {string} key 缓存键
   * @param {any} value 缓存值
   * @param {number} ttl 过期时间（秒）
   */
  async set(key, value, ttl = 60) {
    if (!this.isConnected || !this.client) return;

    try {
      await this.client.setex(CACHE_PREFIX + key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('[Cache] 设置缓存失败:', error.message);
    }
  }

  /**
   * 删除缓存
   * @param {string} key 缓存键
   */
  async del(key) {
    if (!this.isConnected || !this.client) return;

    try {
      await this.client.del(CACHE_PREFIX + key);
    } catch (error) {
      console.error('[Cache] 删除缓存失败:', error.message);
    }
  }

  /**
   * 删除匹配模式的缓存
   * @param {string} pattern 模式
   */
  async delPattern(pattern) {
    if (!this.isConnected || !this.client) return;

    try {
      const keys = await this.client.keys(CACHE_PREFIX + pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.error('[Cache] 批量删除缓存失败:', error.message);
    }
  }

  /**
   * 使缓存失效（用于数据更新后）
   */
  async invalidateStats() {
    await this.delPattern('stats:*');
  }

  /**
   * 关闭连接
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }
}

// 导出单例
const cacheManager = new CacheManager();

module.exports = {
  cacheManager,
  CACHE_TTL,
  CacheManager
};
