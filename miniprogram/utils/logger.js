/**
 * 日志管理器
 * 生产环境可通过 DEBUG_MODE 控制日志输出
 */

// 设置为 false 关闭所有日志
const DEBUG_MODE = false;

const logger = {
  log(...args) {
    if (DEBUG_MODE) console.log(...args);
  },
  warn(...args) {
    if (DEBUG_MODE) console.warn(...args);
  },
  error(...args) {
    if (DEBUG_MODE) console.error(...args);
  },
  info(...args) {
    if (DEBUG_MODE) console.info(...args);
  }
};

module.exports = logger;
