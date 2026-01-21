/**
 * 微信支付路由
 * 用于处理小程序内购充值（Android标准微信支付）
 */
const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const fs = require("fs");
const { getOne, getAll, run, runBatch, commitBatch } = require("../config/database");

// 判断是否使用共享数据库
const isSharedDb = !!process.env.SHARED_DB_PATH;

// 微信支付配置（从环境变量读取）
const WX_PAY_CONFIG = {
  appid: process.env.WX_APPID || "",
  mchid: process.env.WX_MCH_ID || "",
  apiKey: process.env.WX_PAY_API_KEY || "",
  certSerial: process.env.WX_PAY_CERT_SERIAL || "",
  privateKeyPath: process.env.WX_PAY_PRIVATE_KEY_PATH || "",
  notifyUrl: process.env.WX_PAY_NOTIFY_URL || "https://pop-pub.com/api/pay/notify"
};

// 读取私钥
let privateKey = null;
if (WX_PAY_CONFIG.privateKeyPath && fs.existsSync(WX_PAY_CONFIG.privateKeyPath)) {
  try {
    privateKey = fs.readFileSync(WX_PAY_CONFIG.privateKeyPath, "utf8");
    console.log("[微信支付] 私钥加载成功");
  } catch (e) {
    console.error("[微信支付] 私钥加载失败:", e.message);
  }
}

// 充值套餐
const RECHARGE_PACKAGES = [
  { id: 1, amount: 5, points: 50, bonus_points: 0 },
  { id: 2, amount: 10, points: 100, bonus_points: 0 },
  { id: 3, amount: 20, points: 200, bonus_points: 10 },
  { id: 4, amount: 100, points: 1000, bonus_points: 100 },
  { id: 5, amount: 200, points: 2000, bonus_points: 300 },
  { id: 6, amount: 500, points: 5000, bonus_points: 1000 }
];

// 生成订单ID
function generateOrderId() {
  return "WX" + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// 生成随机字符串
function generateNonceStr() {
  return crypto.randomBytes(16).toString("hex");
}

// 生成签名（V3）
function generateSignature(method, url, timestamp, nonceStr, body) {
  const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(message);
  return sign.sign(privateKey, "base64");
}

// 生成支付签名（小程序调起支付用）
function generatePaySign(appId, timeStamp, nonceStr, packageStr) {
  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(message);
  return sign.sign(privateKey, "base64");
}

// 获取充值套餐列表
router.get("/packages", (req, res) => {
  res.json({
    code: 200,
    data: RECHARGE_PACKAGES
  });
});

// 创建支付订单
router.post("/create-order", async (req, res) => {
  const { userId, openid, amount, points, description } = req.body;

  if (!userId || !amount || !points) {
    return res.status(400).json({ code: 400, message: "缺少必要参数" });
  }

  // 确保有有效的 openid（微信支付必须使用真实的 openid）
  let payerOpenid = openid;
  if (!payerOpenid) {
    // 尝试从数据库获取用户的 openid
    const user = isSharedDb
      ? getOne("SELECT openid FROM users WHERE id = ?", [userId])
      : getOne("SELECT openid FROM users WHERE user_id = ? OR id = ?", [userId, userId]);
    payerOpenid = user?.openid;
  }

  if (!payerOpenid) {
    return res.status(400).json({ code: 400, message: "缺少有效的openid，无法发起支付" });
  }

  const orderId = generateOrderId();

  // 计算赠送醒币
  let bonusPoints = 0;
  if (amount >= 500) {
    bonusPoints = Math.floor(points * 0.20);
  } else if (amount >= 200) {
    bonusPoints = Math.floor(points * 0.15);
  } else if (amount >= 100) {
    bonusPoints = Math.floor(points * 0.10);
  } else if (amount >= 20) {
    bonusPoints = Math.floor(points * 0.05);
  }

  try {
    // 创建订单记录
    run(
      `INSERT INTO orders (id, user_id, amount, points_amount, bonus_points, status, payment_method, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 'wxpay', datetime('now'))`,
      [orderId, userId, amount, points, bonusPoints]
    );

    console.log("[创建订单] 成功:", { orderId, userId, amount, points, bonusPoints });

    // 检查微信支付配置
    if (!WX_PAY_CONFIG.mchid || !WX_PAY_CONFIG.apiKey || !privateKey) {
      console.warn("[支付] 微信支付未完全配置，返回测试模式");
      console.log("[支付] 配置状态: mchid=", !!WX_PAY_CONFIG.mchid, ", apiKey=", !!WX_PAY_CONFIG.apiKey, ", privateKey=", !!privateKey);
      return res.json({
        code: 200,
        data: {
          orderId,
          testMode: true,
          message: "微信支付暂未配置，请使用测试模式"
        }
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
      amount: {
        total: amount * 100, // 单位：分
        currency: "CNY"
      },
      payer: {
        openid: payerOpenid
      }
    };

    const bodyStr = JSON.stringify(requestBody);
    const url = "/v3/pay/transactions/jsapi";
    const signature = generateSignature("POST", url, timestamp, nonceStr, bodyStr);

    // 调用微信支付API
    const https = require("https");
    const options = {
      hostname: "api.mch.weixin.qq.com",
      port: 443,
      path: url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "WeChatPay-MiniProgram-Server/1.0",
        "Authorization": `WECHATPAY2-SHA256-RSA2048 mchid="${WX_PAY_CONFIG.mchid}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${WX_PAY_CONFIG.certSerial}"`
      }
    };

    console.log("[微信支付] 请求预付单:", { orderId, amount, openid: payerOpenid });

    const wxReq = https.request(options, (wxRes) => {
      let data = "";
      wxRes.on("data", (chunk) => data += chunk);
      wxRes.on("end", () => {
        try {
          const result = JSON.parse(data);
          console.log("[微信支付] 预付单响应:", result);

          if (result.prepay_id) {
            // 生成小程序调起支付需要的参数
            const payTimestamp = Math.floor(Date.now() / 1000).toString();
            const payNonceStr = generateNonceStr();
            const packageStr = `prepay_id=${result.prepay_id}`;
            const paySign = generatePaySign(WX_PAY_CONFIG.appid, payTimestamp, payNonceStr, packageStr);

            res.json({
              code: 200,
              data: {
                orderId,
                timeStamp: payTimestamp,
                nonceStr: payNonceStr,
                package: packageStr,
                signType: "RSA",
                paySign: paySign
              }
            });
          } else {
            console.error("[微信支付] 创建预付单失败:", result);
            res.json({
              code: 500,
              message: result.message || "创建预付单失败",
              data: { orderId, testMode: true }
            });
          }
        } catch (e) {
          console.error("[微信支付] 解析响应失败:", e, data);
          res.json({
            code: 500,
            message: "解析微信支付响应失败",
            data: { orderId, testMode: true }
          });
        }
      });
    });

    wxReq.on("error", (e) => {
      console.error("[微信支付] 请求失败:", e);
      res.json({
        code: 500,
        message: "请求微信支付失败",
        data: { orderId, testMode: true }
      });
    });

    wxReq.write(bodyStr);
    wxReq.end();

  } catch (error) {
    console.error("[创建订单] 失败:", error);
    res.status(500).json({ code: 500, message: "创建订单失败: " + error.message });
  }
});

// 查询订单状态
router.get("/order/:orderId", async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = getOne("SELECT * FROM orders WHERE id = ?", [orderId]);

    if (!order) {
      return res.status(404).json({ code: 404, message: "订单不存在" });
    }

    res.json({
      code: 200,
      data: order
    });

  } catch (error) {
    console.error("[查询订单] 失败:", error);
    res.status(500).json({ code: 500, message: "查询订单失败" });
  }
});

// 微信支付回调通知
router.post("/notify", async (req, res) => {
  console.log("[支付回调] 收到通知:", JSON.stringify(req.body));

  try {
    // 解密回调数据
    const { resource } = req.body;
    if (!resource || !resource.ciphertext) {
      console.error("[支付回调] 缺少加密数据");
      return res.json({ code: "SUCCESS", message: "成功" });
    }

    // 解密 - 微信支付 APIv3 使用 AES-256-GCM
    const { ciphertext, nonce, associated_data } = resource;
    const key = Buffer.from(WX_PAY_CONFIG.apiKey, "utf8");

    // ciphertext 是 base64 编码，解码后最后 16 字节是 authTag
    const ciphertextBuffer = Buffer.from(ciphertext, "base64");
    const authTag = ciphertextBuffer.slice(-16);
    const encryptedData = ciphertextBuffer.slice(0, -16);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "utf8"));
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(associated_data || "", "utf8"));

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);

    const paymentData = JSON.parse(decrypted.toString("utf8"));
    console.log("[支付回调] 解密数据:", paymentData);

    const { out_trade_no, trade_state, transaction_id } = paymentData;

    if (trade_state !== "SUCCESS") {
      console.log("[支付回调] 支付未成功:", trade_state);
      return res.json({ code: "SUCCESS", message: "成功" });
    }

    // 查询订单
    const order = getOne("SELECT * FROM orders WHERE id = ?", [out_trade_no]);
    if (!order) {
      console.error("[支付回调] 订单不存在:", out_trade_no);
      return res.json({ code: "SUCCESS", message: "成功" });
    }

    if (order.status === "paid") {
      console.log("[支付回调] 订单已处理:", out_trade_no);
      return res.json({ code: "SUCCESS", message: "成功" });
    }

    // 计算总醒币
    const totalPoints = order.points_amount + (order.bonus_points || 0);
    const userId = order.user_id;

    // 获取用户当前余额
    const user = isSharedDb
      ? getOne("SELECT points FROM users WHERE id = ?", [userId])
      : getOne("SELECT points FROM users WHERE user_id = ?", [userId]);
    const newBalance = (user?.points || 0) + totalPoints;

    // 使用批量操作确保原子性
    try {
      // 1. 更新订单状态
      runBatch("UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?", [out_trade_no]);

      // 2. 更新用户醒币
      if (isSharedDb) {
        runBatch("UPDATE users SET points = ?, updated_at = datetime('now') WHERE id = ?", [newBalance, userId]);
      } else {
        runBatch("UPDATE users SET points = ?, updated_at = datetime('now') WHERE user_id = ?", [newBalance, userId]);
      }

      // 3. 记录醒币变动
      const recordTable = isSharedDb ? "points_records" : "point_records";
      const balanceField = isSharedDb ? "balance_after" : "balance";
      runBatch(
        `INSERT INTO ${recordTable} (id, user_id, type, amount, ${balanceField}, description, order_id, created_at)
         VALUES (?, ?, 'recharge', ?, ?, ?, ?, datetime('now'))`,
        [
          "RCH" + Date.now().toString(36).toUpperCase(),
          userId,
          totalPoints,
          newBalance,
          `充值 ¥${order.amount}` + (order.bonus_points > 0 ? ` (含赠送${order.bonus_points})` : ""),
          out_trade_no
        ]
      );

      // 统一提交
      commitBatch();
      console.log("[支付回调] 处理成功:", { orderId: out_trade_no, userId, totalPoints, newBalance });
    } catch (batchError) {
      console.error("[支付回调] 批量操作失败:", batchError);
      throw batchError;
    }

    res.json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    console.error("[支付回调] 处理失败:", error);
    res.json({ code: "SUCCESS", message: "成功" }); // 即使失败也返回成功，避免微信重试
  }
});

// 手动确认支付（测试用/管理员用）
const authMiddleware = require('../middleware/auth');
router.post("/confirm", authMiddleware, async (req, res) => {
  const { orderId, transactionId } = req.body;

  if (!orderId) {
    return res.status(400).json({ code: 400, message: "缺少订单号" });
  }

  try {
    const order = getOne("SELECT * FROM orders WHERE id = ?", [orderId]);

    if (!order) {
      return res.status(404).json({ code: 404, message: "订单不存在" });
    }

    if (order.status === "paid") {
      return res.json({ code: 200, message: "订单已支付", data: order });
    }

    // 计算总醒币
    const totalPoints = order.points_amount + (order.bonus_points || 0);
    const userId = order.user_id;

    // 获取用户当前余额
    const user = isSharedDb
      ? getOne("SELECT points FROM users WHERE id = ?", [userId])
      : getOne("SELECT points FROM users WHERE user_id = ?", [userId]);
    const newBalance = (user?.points || 0) + totalPoints;

    // 使用批量操作确保原子性
    try {
      // 1. 更新订单状态
      runBatch("UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?", [orderId]);

      // 2. 更新用户醒币
      if (isSharedDb) {
        runBatch("UPDATE users SET points = ?, updated_at = datetime('now') WHERE id = ?", [newBalance, userId]);
      } else {
        runBatch("UPDATE users SET points = ?, updated_at = datetime('now') WHERE user_id = ?", [newBalance, userId]);
      }

      // 3. 记录醒币变动
      const recordTable = isSharedDb ? "points_records" : "point_records";
      const balanceField = isSharedDb ? "balance_after" : "balance";
      runBatch(
        `INSERT INTO ${recordTable} (id, user_id, type, amount, ${balanceField}, description, order_id, created_at)
         VALUES (?, ?, 'recharge', ?, ?, ?, ?, datetime('now'))`,
        [
          "RCH" + Date.now().toString(36).toUpperCase(),
          userId,
          totalPoints,
          newBalance,
          `充值 ¥${order.amount}` + (order.bonus_points > 0 ? ` (含赠送${order.bonus_points})` : ""),
          orderId
        ]
      );

      // 统一提交
      commitBatch();
      console.log("[确认支付] 成功:", { orderId, userId, totalPoints, newBalance });
    } catch (batchError) {
      console.error("[确认支付] 批量操作失败:", batchError);
      throw batchError;
    }

    res.json({
      code: 200,
      message: "支付确认成功",
      data: {
        orderId,
        points: totalPoints,
        newBalance: user ? user.points : totalPoints
      }
    });

  } catch (error) {
    console.error("[确认支付] 失败:", error);
    res.status(500).json({ code: 500, message: "确认支付失败: " + error.message });
  }
});

// 获取用户订单列表
router.get("/user-orders/:userId", async (req, res) => {
  const { userId } = req.params;
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;

  try {
    const orders = getAll(
      "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [userId, parseInt(pageSize), offset]
    );

    res.json({
      code: 200,
      data: {
        list: orders,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });

  } catch (error) {
    console.error("[获取订单列表] 失败:", error);
    res.status(500).json({ code: 500, message: "获取订单列表失败" });
  }
});

module.exports = router;
