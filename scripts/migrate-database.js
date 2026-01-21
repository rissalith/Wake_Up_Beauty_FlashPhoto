#!/usr/bin/env node
/**
 * 数据库迁移脚本
 *
 * 功能：
 * 1. 将旧数据库的数据迁移到统一的新数据库
 * 2. 支持从多个源数据库合并数据
 * 3. 处理 ID 格式转换（INTEGER -> TEXT）
 * 4. 避免重复数据
 *
 * 使用方法：
 *   cd core-api && node ../scripts/migrate-database.js [--dry-run]
 *   或
 *   node scripts/migrate-database.js [--dry-run] (需要先在根目录 npm install)
 *
 * 参数：
 *   --dry-run    只分析不执行迁移
 *   --source     指定源数据库路径（可多次使用）
 */

// 尝试从多个位置加载模块
let Database, uuidv4;
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

// 尝试加载 better-sqlite3
const possiblePaths = [
  path.join(PROJECT_ROOT, 'node_modules'),
  path.join(PROJECT_ROOT, 'core-api/node_modules'),
  path.join(PROJECT_ROOT, 'server/node_modules'),
  path.join(PROJECT_ROOT, 'admin-server/server/node_modules'),
];

for (const modulePath of possiblePaths) {
  try {
    Database = require(path.join(modulePath, 'better-sqlite3'));
    break;
  } catch (e) {
    // 继续尝试下一个路径
  }
}

for (const modulePath of possiblePaths) {
  try {
    uuidv4 = require(path.join(modulePath, 'uuid')).v4;
    break;
  } catch (e) {
    // 继续尝试下一个路径
  }
}

if (!Database) {
  console.error('错误: 找不到 better-sqlite3 模块');
  console.error('请先在 core-api 目录运行 npm install');
  process.exit(1);
}

if (!uuidv4) {
  // uuid 不是必须的，可以用简单的替代方案
  uuidv4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}

// 解析命令行参数
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceIndex = args.indexOf('--source');
let customSources = [];
if (sourceIndex !== -1 && args[sourceIndex + 1]) {
  customSources.push(args[sourceIndex + 1]);
}

// 数据库路径配置
const TARGET_DB_PATH = path.join(PROJECT_ROOT, 'core-api/data/flashphoto.db');

// 默认源数据库列表
const DEFAULT_SOURCE_DBS = [
  path.join(PROJECT_ROOT, 'admin-server/server/database/xingmei.db'),
  path.join(PROJECT_ROOT, 'admin-server/server/database/flashphoto.db'),
  path.join(PROJECT_ROOT, 'server/data/flashphoto_prod.db'),
  path.join(PROJECT_ROOT, 'server/data/flashphoto_test.db'),
];

const SOURCE_DBS = customSources.length > 0 ? customSources : DEFAULT_SOURCE_DBS;

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

// 需要迁移的表及其配置
const TABLES_CONFIG = {
  users: {
    idField: 'id',
    uniqueFields: ['unionid', 'openid'],
    convertId: true,
  },
  admins: {
    idField: 'id',
    uniqueFields: ['username'],
    convertId: true,
  },
  scenes: {
    idField: 'id',
    uniqueFields: ['scene_key'],
    convertId: false, // INTEGER 主键
  },
  scene_steps: {
    idField: 'id',
    uniqueFields: [],
    convertId: false,
  },
  step_options: {
    idField: 'id',
    uniqueFields: [],
    convertId: false,
  },
  prompt_templates: {
    idField: 'id',
    uniqueFields: [],
    convertId: false,
  },
  photo_specs: {
    idField: 'id',
    uniqueFields: ['spec_key'],
    convertId: false,
  },
  recharge_packages: {
    idField: 'id',
    uniqueFields: [],
    convertId: false,
  },
  system_config: {
    idField: 'id',
    uniqueFields: ['config_key'],
    convertId: false,
  },
  point_rewards: {
    idField: 'id',
    uniqueFields: ['type'],
    convertId: false,
  },
  orders: {
    idField: 'id',
    uniqueFields: [],
    convertId: true,
  },
  points_records: {
    idField: 'id',
    uniqueFields: [],
    convertId: true,
  },
  photo_history: {
    idField: 'id',
    uniqueFields: ['task_id'],
    convertId: true,
  },
  invites: {
    idField: 'id',
    uniqueFields: [],
    convertId: true,
  },
  feedbacks: {
    idField: 'id',
    uniqueFields: [],
    convertId: true,
  },
  virtual_pay_orders: {
    idField: 'id',
    uniqueFields: ['order_id'],
    convertId: true,
  },
  operation_logs: {
    idField: 'id',
    uniqueFields: [],
    convertId: true,
  },
};

// 分析源数据库
function analyzeSourceDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  try {
    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name).filter(n => !n.startsWith('sqlite_'));

    const analysis = {
      path: dbPath,
      tables: {},
      totalRecords: 0,
    };

    for (const tableName of tableNames) {
      try {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get().count;
        analysis.tables[tableName] = count;
        analysis.totalRecords += count;
      } catch (e) {
        analysis.tables[tableName] = `Error: ${e.message}`;
      }
    }

    db.close();
    return analysis;
  } catch (e) {
    return { path: dbPath, error: e.message };
  }
}

// 获取表的列信息
function getTableColumns(db, tableName) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.map(c => c.name);
  } catch (e) {
    return [];
  }
}

// 迁移单个表的数据
function migrateTable(sourceDb, targetDb, tableName, config) {
  const sourceColumns = getTableColumns(sourceDb, tableName);
  const targetColumns = getTableColumns(targetDb, tableName);

  if (sourceColumns.length === 0) {
    return { skipped: true, reason: '源表不存在' };
  }

  if (targetColumns.length === 0) {
    return { skipped: true, reason: '目标表不存在' };
  }

  // 找出共同的列
  const commonColumns = sourceColumns.filter(c => targetColumns.includes(c));
  if (commonColumns.length === 0) {
    return { skipped: true, reason: '没有共同的列' };
  }

  // 读取源数据
  const sourceData = sourceDb.prepare(`SELECT ${commonColumns.join(', ')} FROM ${tableName}`).all();
  if (sourceData.length === 0) {
    return { skipped: true, reason: '源表为空' };
  }

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // 准备插入语句
  const placeholders = commonColumns.map(() => '?').join(', ');
  const insertSql = `INSERT OR IGNORE INTO ${tableName} (${commonColumns.join(', ')}) VALUES (${placeholders})`;
  const insertStmt = targetDb.prepare(insertSql);

  for (const row of sourceData) {
    try {
      // 处理 ID 转换
      if (config.convertId && row[config.idField] !== undefined) {
        const id = row[config.idField];
        // 如果是数字 ID，转换为 UUID
        if (typeof id === 'number' || /^\d+$/.test(id)) {
          row[config.idField] = uuidv4();
        }
      }

      const values = commonColumns.map(c => row[c]);
      const result = insertStmt.run(...values);

      if (result.changes > 0) {
        inserted++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors++;
    }
  }

  return {
    total: sourceData.length,
    inserted,
    skipped,
    errors,
    columns: commonColumns.length,
  };
}

// 主函数
async function main() {
  logSection('数据库迁移工具');

  if (dryRun) {
    log('模式: 仅分析 (--dry-run)', 'yellow');
  } else {
    log('模式: 执行迁移', 'green');
  }

  // 分析所有源数据库
  logSection('源数据库分析');

  const validSources = [];
  for (const dbPath of SOURCE_DBS) {
    const analysis = analyzeSourceDb(dbPath);
    const relativePath = path.relative(PROJECT_ROOT, dbPath);

    if (!analysis) {
      log(`  [不存在] ${relativePath}`, 'dim');
      continue;
    }

    if (analysis.error) {
      log(`  [错误] ${relativePath}: ${analysis.error}`, 'red');
      continue;
    }

    log(`\n  [找到] ${relativePath}`, 'green');
    log(`  总记录数: ${analysis.totalRecords}`, 'dim');

    for (const [table, count] of Object.entries(analysis.tables)) {
      if (typeof count === 'number' && count > 0) {
        log(`    - ${table}: ${count} 条`, 'dim');
      }
    }

    if (analysis.totalRecords > 0) {
      validSources.push({ path: dbPath, analysis });
    }
  }

  if (validSources.length === 0) {
    log('\n没有找到有效的源数据库，无需迁移', 'yellow');
    return;
  }

  // 检查目标数据库
  logSection('目标数据库');
  const targetRelativePath = path.relative(PROJECT_ROOT, TARGET_DB_PATH);
  log(`路径: ${targetRelativePath}`, 'cyan');

  // 确保目标目录存在
  const targetDir = path.dirname(TARGET_DB_PATH);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    log('已创建目标目录', 'green');
  }

  if (dryRun) {
    logSection('迁移预览');
    log('以下数据将被迁移:', 'yellow');
    for (const source of validSources) {
      const relativePath = path.relative(PROJECT_ROOT, source.path);
      log(`\n从 ${relativePath}:`, 'cyan');
      for (const [table, count] of Object.entries(source.analysis.tables)) {
        if (typeof count === 'number' && count > 0 && TABLES_CONFIG[table]) {
          log(`  - ${table}: ${count} 条`, 'dim');
        }
      }
    }
    log('\n使用不带 --dry-run 参数运行以执行迁移', 'yellow');
    return;
  }

  // 执行迁移
  logSection('执行迁移');

  // 先初始化目标数据库（通过 require core-api 的 database 模块）
  log('初始化目标数据库...', 'cyan');

  // 直接打开目标数据库
  const targetDb = new Database(TARGET_DB_PATH);
  targetDb.pragma('journal_mode = WAL');

  // 从每个源数据库迁移数据
  for (const source of validSources) {
    const relativePath = path.relative(PROJECT_ROOT, source.path);
    log(`\n从 ${relativePath} 迁移:`, 'cyan');

    const sourceDb = new Database(source.path, { readonly: true });

    for (const [tableName, config] of Object.entries(TABLES_CONFIG)) {
      if (!source.analysis.tables[tableName] || source.analysis.tables[tableName] === 0) {
        continue;
      }

      const result = migrateTable(sourceDb, targetDb, tableName, config);

      if (result.skipped) {
        log(`  ${tableName}: 跳过 (${result.reason})`, 'dim');
      } else {
        log(`  ${tableName}: 插入 ${result.inserted}, 跳过 ${result.skipped}, 错误 ${result.errors}`,
          result.errors > 0 ? 'yellow' : 'green');
      }
    }

    sourceDb.close();
  }

  targetDb.close();

  logSection('迁移完成');
  log('统一数据库路径: ' + targetRelativePath, 'green');
  log('\n后续步骤:', 'cyan');
  log('1. 验证数据完整性', 'dim');
  log('2. 备份旧数据库文件', 'dim');
  log('3. 更新环境变量指向新数据库', 'dim');
  log('4. 重启所有服务', 'dim');
}

main().catch(e => {
  log(`迁移失败: ${e.message}`, 'red');
  process.exit(1);
});
