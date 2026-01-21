/**
 * 小程序配置路由
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../../config/database');
const { isCOSConfigured, getPresignedUploadUrl, COS_CONFIG } = require('../../config/cos');

// 获取配置版本号
router.get('/version', (req, res) => {
  try {
    const db = getDb();
    // 从 system_config 表获取版本号，如果没有则返回默认值
    const versionConfig = db.prepare("SELECT config_value FROM system_config WHERE config_key = 'config_version'").get();
    const version = versionConfig ? parseInt(versionConfig.config_value) || 1 : 1;

    res.json({
      code: 200,
      data: { version }
    });
  } catch (error) {
    console.error('获取配置版本错误:', error);
    res.json({ code: 200, data: { version: 1 } });
  }
});

// 获取完整初始化配置（小程序启动时调用）
router.get('/init', (req, res) => {
  try {
    const db = getDb();
    const { lang = 'zh-CN' } = req.query;

    // 1. 获取系统配置
    const configs = db.prepare("SELECT config_key, config_value, config_type FROM system_config WHERE is_public = 1").all();
    const system = {};
    configs.forEach(c => {
      let value = c.config_value;
      if (c.config_type === 'boolean') {
        value = value === 'true';
      } else if (c.config_type === 'number') {
        value = parseInt(value) || 0;
      }
      system[c.config_key] = value;
    });

    // 2. 获取场景列表（只返回上线和即将上线的场景）
    const scenes = db.prepare("SELECT * FROM scenes WHERE status IN ('active', 'coming_soon') ORDER BY sort_order ASC, id ASC").all();

    // 3. 获取版本号
    const versionConfig = db.prepare("SELECT config_value FROM system_config WHERE config_key = 'config_version'").get();
    const version = versionConfig ? parseInt(versionConfig.config_value) || 1 : 1;

    res.json({
      code: 200,
      data: {
        version,
        system,
        scenes
      }
    });
  } catch (error) {
    console.error('获取初始化配置错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取单个场景完整配置（包含步骤和prompt）
router.get('/scene/:sceneId', (req, res) => {
  try {
    const db = getDb();
    const { sceneId } = req.params;
    const { lang = 'zh-CN' } = req.query;

    // 1. 获取场景基本信息（支持 id 或 scene_key）
    let scene = db.prepare("SELECT * FROM scenes WHERE id = ? OR scene_key = ?").get(sceneId, sceneId);
    if (!scene) {
      return res.status(404).json({ code: -1, msg: '场景不存在' });
    }

    // 2. 获取场景步骤
    const steps = db.prepare('SELECT * FROM scene_steps WHERE scene_id = ? ORDER BY step_order').all(scene.id);

    // 3. 获取每个步骤的选项
    const stepsWithOptions = steps.map(step => {
      const options = db.prepare('SELECT * FROM step_options WHERE step_id = ? ORDER BY sort_order').all(step.id);

      // 构建步骤对象
      const stepObj = {
        ...step,
        name: step.step_name || step.name,
        options
      };

      // 如果步骤标记为 gender_based，添加 depends_on 信息
      if (step.gender_based) {
        stepObj.depends_on = {
          step: 'gender',
          filter_field: 'gender'
        };
      }

      return stepObj;
    });

    // 4. 获取 Prompt 模板
    const prompt = db.prepare('SELECT * FROM prompt_templates WHERE scene_id = ? LIMIT 1').get(scene.id);

    res.json({
      code: 200,
      data: {
        scene,
        steps: stepsWithOptions,
        prompt: prompt || null
      }
    });
  } catch (error) {
    console.error('获取场景详情错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取公开配置
router.get('/public', (req, res) => {
  try {
    const db = getDb();
    const configs = db.prepare("SELECT config_key, config_value, config_type FROM system_config WHERE is_public = 1").all();

    const result = {};
    configs.forEach(c => {
      let value = c.config_value;
      if (c.config_type === 'boolean') {
        value = value === 'true';
      } else if (c.config_type === 'number') {
        value = parseInt(value) || 0;
      }
      result[c.config_key] = value;
    });

    res.json({
      code: 0,
      data: result
    });
  } catch (error) {
    console.error('获取公开配置错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取奖励配置
router.get('/rewards', (req, res) => {
  try {
    const db = getDb();
    const rewards = db.prepare('SELECT type, name, points, description, max_times, is_active FROM point_rewards ORDER BY id').all();

    res.json({
      code: 0,
      data: rewards.map(r => ({
        type: r.type,
        name: r.name,
        points: r.points,
        description: r.description,
        maxTimes: r.max_times,
        isActive: r.is_active === 1
      }))
    });
  } catch (error) {
    console.error('获取奖励配置错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取场景列表
router.get('/scenes', (req, res) => {
  try {
    const db = getDb();
    const { status } = req.query;

    let sql = "SELECT * FROM scenes WHERE 1=1";
    const params = [];

    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }

    sql += " ORDER BY sort_order ASC, id ASC";

    const scenes = db.prepare(sql).all(...params);

    res.json({
      code: 0,
      data: scenes
    });
  } catch (error) {
    console.error('获取场景列表错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取单个场景详情
router.get('/scenes/:sceneKey', (req, res) => {
  try {
    const db = getDb();
    const { sceneKey } = req.params;

    const scene = db.prepare("SELECT * FROM scenes WHERE scene_key = ?").get(sceneKey);
    if (!scene) {
      return res.status(404).json({ code: -1, msg: '场景不存在' });
    }

    res.json({
      code: 0,
      data: scene
    });
  } catch (error) {
    console.error('获取场景详情错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// ========== COS 上传凭证接口 ==========

// 获取 COS 上传凭证（预签名 URL）
// 小程序端使用此接口获取上传地址，然后直接 PUT 上传
router.post('/cos/upload-credential', async (req, res) => {
  try {
    if (!isCOSConfigured()) {
      return res.status(503).json({
        code: -1,
        msg: 'COS 未配置'
      });
    }

    const { userId, type = 'temp', scene = '', fileName } = req.body;

    if (!userId) {
      return res.status(400).json({ code: -1, msg: '缺少 userId' });
    }

    // 生成文件名
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const finalFileName = fileName || `${timestamp}_${randomStr}.jpg`;

    // 构建 COS key
    let key;
    if (scene) {
      key = `users/${userId}/${scene}/${type}/${finalFileName}`;
    } else {
      key = `users/${userId}/${type}/${finalFileName}`;
    }

    // 生成预签名上传 URL（有效期 15 分钟）
    const credential = await getPresignedUploadUrl(key, 900);

    res.json({
      code: 0,
      data: {
        ...credential,
        fileName: finalFileName
      }
    });
  } catch (error) {
    console.error('获取上传凭证错误:', error);
    res.status(500).json({ code: -1, msg: '获取上传凭证失败: ' + error.message });
  }
});

// 批量获取 COS 上传凭证
router.post('/cos/batch-upload-credentials', async (req, res) => {
  try {
    if (!isCOSConfigured()) {
      return res.status(503).json({
        code: -1,
        msg: 'COS 未配置'
      });
    }

    const { userId, files } = req.body;
    // files: [{ type: 'temp', scene: '', fileName: '' }, ...]

    if (!userId || !files || !Array.isArray(files)) {
      return res.status(400).json({ code: -1, msg: '参数错误' });
    }

    const credentials = [];
    for (const file of files) {
      const { type = 'temp', scene = '', fileName } = file;
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substr(2, 9);
      const finalFileName = fileName || `${timestamp}_${randomStr}.jpg`;

      let key;
      if (scene) {
        key = `users/${userId}/${scene}/${type}/${finalFileName}`;
      } else {
        key = `users/${userId}/${type}/${finalFileName}`;
      }

      try {
        const cred = await getPresignedUploadUrl(key, 900);
        credentials.push({
          ...cred,
          fileName: finalFileName,
          type,
          scene
        });
      } catch (err) {
        credentials.push({
          key,
          fileName: finalFileName,
          type,
          scene,
          error: err.message
        });
      }
    }

    res.json({
      code: 0,
      data: credentials
    });
  } catch (error) {
    console.error('批量获取上传凭证错误:', error);
    res.status(500).json({ code: -1, msg: '获取上传凭证失败: ' + error.message });
  }
});

// 获取 COS 配置信息（公开信息，不含密钥）
router.get('/cos/info', (req, res) => {
  res.json({
    code: 0,
    data: {
      configured: isCOSConfigured(),
      bucket: COS_CONFIG.bucket,
      region: COS_CONFIG.region,
      baseUrl: COS_CONFIG.baseUrl
    }
  });
});

module.exports = router;
