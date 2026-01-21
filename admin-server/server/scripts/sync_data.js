const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function syncData() {
  const SQL = await initSqlJs();

  // 源数据库（后台数据库）
  const sourceDbPath = path.join(__dirname, '../database/xingmei.db');
  // 目标数据库（小程序数据库）
  const targetDbPath = process.env.TARGET_DB_PATH || '/www/wwwroot/pop-pub.com/miniprogram-server/data/flashphoto_prod.db';

  if (!fs.existsSync(sourceDbPath)) {
    console.log('源数据库不存在:', sourceDbPath);
    return;
  }

  if (!fs.existsSync(targetDbPath)) {
    console.log('目标数据库不存在:', targetDbPath);
    return;
  }

  console.log('源数据库:', sourceDbPath);
  console.log('目标数据库:', targetDbPath);

  const sourceDb = new SQL.Database(fs.readFileSync(sourceDbPath));
  const targetDb = new SQL.Database(fs.readFileSync(targetDbPath));

  // 1. 同步用户数据
  console.log('\n=== 同步用户数据 ===');
  const users = sourceDb.exec('SELECT * FROM users');
  if (users.length > 0) {
    const cols = users[0].columns;
    console.log('源用户表字段:', cols.join(', '));
    console.log('用户数量:', users[0].values.length);

    for (const row of users[0].values) {
      const userData = {};
      cols.forEach((col, i) => userData[col] = row[i]);

      // 检查目标数据库是否已存在该用户
      const existing = targetDb.exec(`SELECT id FROM users WHERE id = '${userData.user_id}'`);
      if (existing.length > 0 && existing[0].values.length > 0) {
        console.log(`用户 ${userData.user_id} 已存在，跳过`);
        continue;
      }

      // 插入用户到目标数据库（字段映射）
      try {
        targetDb.run(`
          INSERT INTO users (id, openid, nickname, avatar_url, email, points, created_at, updated_at, inviter_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          userData.user_id,           // id <- user_id
          userData.openid || null,
          userData.nickname || null,
          userData.avatar_url || null,
          userData.bind_email || null, // email <- bind_email
          userData.points || 0,
          userData.created_at || new Date().toISOString(),
          userData.updated_at || new Date().toISOString(),
          userData.inviter_id || null
        ]);
        console.log(`已同步用户: ${userData.user_id} (${userData.nickname || '无昵称'})`);
      } catch (e) {
        console.error(`同步用户 ${userData.user_id} 失败:`, e.message);
      }
    }
  }

  // 2. 同步积分记录
  console.log('\n=== 同步积分记录 ===');
  const pointRecords = sourceDb.exec('SELECT * FROM point_records');
  if (pointRecords.length > 0) {
    const cols = pointRecords[0].columns;
    console.log('源积分记录表字段:', cols.join(', '));
    console.log('记录数量:', pointRecords[0].values.length);

    for (const row of pointRecords[0].values) {
      const data = {};
      cols.forEach((col, i) => data[col] = row[i]);

      // 检查是否已存在
      const existing = targetDb.exec(`SELECT id FROM points_records WHERE id = '${data.record_id}'`);
      if (existing.length > 0 && existing[0].values.length > 0) {
        continue;
      }

      try {
        targetDb.run(`
          INSERT INTO points_records (id, user_id, type, amount, balance_after, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          data.record_id,           // id <- record_id
          data.user_id,
          data.type,
          data.amount,
          data.balance,             // balance_after <- balance
          data.description,
          data.created_at
        ]);
      } catch (e) {
        // 忽略重复插入错误
      }
    }
    console.log('积分记录同步完成');
  }

  // 3. 同步订单数据（recharge_orders -> orders）
  console.log('\n=== 同步订单数据 ===');
  const orders = sourceDb.exec('SELECT * FROM recharge_orders');
  if (orders.length > 0) {
    const cols = orders[0].columns;
    console.log('源订单表字段:', cols.join(', '));
    console.log('订单数量:', orders[0].values.length);

    for (const row of orders[0].values) {
      const data = {};
      cols.forEach((col, i) => data[col] = row[i]);

      // 检查是否已存在
      const existing = targetDb.exec(`SELECT id FROM orders WHERE id = '${data.order_id}'`);
      if (existing.length > 0 && existing[0].values.length > 0) {
        continue;
      }

      try {
        targetDb.run(`
          INSERT INTO orders (id, user_id, amount, points_amount, bonus_points, status, payment_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          data.order_id,            // id <- order_id
          data.user_id,
          data.amount,
          data.points,              // points_amount <- points
          data.bonus_points || 0,
          data.status,
          data.payment_id || null,
          data.created_at,
          data.paid_at || data.created_at  // updated_at <- paid_at
        ]);
        console.log(`已同步订单: ${data.order_id}`);
      } catch (e) {
        console.error(`同步订单 ${data.order_id} 失败:`, e.message);
      }
    }
  }

  // 4. 同步反馈数据
  console.log('\n=== 同步反馈数据 ===');
  const feedbacks = sourceDb.exec('SELECT * FROM feedbacks');
  if (feedbacks.length > 0) {
    const cols = feedbacks[0].columns;
    console.log('源反馈表字段:', cols.join(', '));
    console.log('反馈数量:', feedbacks[0].values.length);

    for (const row of feedbacks[0].values) {
      const data = {};
      cols.forEach((col, i) => data[col] = row[i]);

      // 检查是否已存在
      const existing = targetDb.exec(`SELECT id FROM feedbacks WHERE feedback_id = '${data.feedback_id}'`);
      if (existing.length > 0 && existing[0].values.length > 0) {
        continue;
      }

      try {
        targetDb.run(`
          INSERT INTO feedbacks (feedback_id, user_id, content, images, contact, status, reply_content, replied_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          data.feedback_id,
          data.user_id,
          data.content,
          data.images,
          data.contact,
          data.status,
          data.reply_content,
          data.replied_at,
          data.created_at
        ]);
        console.log(`已同步反馈: ${data.feedback_id}`);
      } catch (e) {
        console.error(`同步反馈 ${data.feedback_id} 失败:`, e.message);
      }
    }
  }

  // 保存目标数据库
  const targetData = targetDb.export();
  const targetBuffer = Buffer.from(targetData);
  fs.writeFileSync(targetDbPath, targetBuffer);
  console.log('\n=== 数据同步完成，已保存到目标数据库 ===');

  // 验证
  console.log('\n=== 验证同步结果 ===');
  const verifyDb = new SQL.Database(fs.readFileSync(targetDbPath));
  const tables = ['users', 'points_records', 'orders', 'feedbacks'];
  for (const t of tables) {
    const cnt = verifyDb.exec(`SELECT COUNT(*) FROM ${t}`);
    console.log(`${t}: ${cnt[0].values[0][0]} 条`);
  }
}

syncData().catch(console.error);
