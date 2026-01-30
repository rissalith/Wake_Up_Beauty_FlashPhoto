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

    // 判断是否需要英文翻译
    const useEnglish = lang === 'en';

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

    // 根据语言处理场景名称和描述
    const localizedScenes = scenes.map(scene => {
      const localizedScene = { ...scene };
      if (useEnglish) {
        localizedScene.name = scene.name_en || scene.name;
        localizedScene.description = scene.description_en || scene.description;
      }
      return localizedScene;
    });

    // 3. 获取版本号
    const versionConfig = db.prepare("SELECT config_value FROM system_config WHERE config_key = 'config_version'").get();
    const version = versionConfig ? parseInt(versionConfig.config_value) || 1 : 1;

    res.json({
      code: 200,
      data: {
        version,
        system,
        scenes: localizedScenes
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

    // 判断是否需要英文翻译
    const useEnglish = lang === 'en';

    // 1. 获取场景基本信息（支持 id 或 scene_key）
    let scene = db.prepare("SELECT * FROM scenes WHERE id = ? OR scene_key = ?").get(sceneId, sceneId);
    if (!scene) {
      return res.status(404).json({ code: -1, msg: '场景不存在' });
    }

    // 根据语言返回对应的名称和描述
    if (useEnglish) {
      scene.name = scene.name_en || scene.name;
      scene.description = scene.description_en || scene.description;
    }

    // 2. 获取场景步骤
    const steps = db.prepare('SELECT * FROM scene_steps WHERE scene_id = ? ORDER BY step_order').all(scene.id);

    // 3. 获取每个步骤的选项
    const stepsWithOptions = steps.map(step => {
      const options = db.prepare('SELECT * FROM step_options WHERE step_id = ? ORDER BY sort_order').all(step.id);

      // 根据语言处理选项的显示文本
      const localizedOptions = options.map(opt => {
        const localizedOpt = { ...opt };
        if (useEnglish) {
          // 使用英文标签，如果没有则回退到中文
          localizedOpt.label = opt.label_en || opt.label;
          localizedOpt.name = opt.label_en || opt.label;
        } else {
          localizedOpt.name = opt.label;
        }
        // 保留原始的多语言字段供前端使用
        localizedOpt.name_en = opt.label_en;
        return localizedOpt;
      });

      // 解析 config JSON 字符串
      let parsedConfig = {};
      if (step.config) {
        try {
          parsedConfig = typeof step.config === 'string' ? JSON.parse(step.config) : step.config;
        } catch (e) {
          console.error('[Config] Failed to parse step config:', step.step_key, e.message);
        }
      }

      // 构建步骤对象
      const stepObj = {
        ...step,
        config: parsedConfig,  // 使用解析后的 config 对象
        name: step.step_name || step.name,
        // 根据语言返回对应的标题
        title: useEnglish ? (step.title_en || step.title) : step.title,
        // 保留原始的多语言字段供前端使用
        title_en: step.title_en,
        // 摇骰子定价配置
        free_count: step.free_count !== undefined ? step.free_count : 1,
        cost_per_roll: step.cost_per_roll !== undefined ? step.cost_per_roll : 10,
        options: localizedOptions
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
    const promptRow = db.prepare('SELECT * FROM prompt_templates WHERE scene_id = ? LIMIT 1').get(scene.id);

    // 转换字段名以匹配前端期望的格式
    // 注意：数据库中有两套字段，优先使用 template/name，其次使用 template_content/template_name
    const prompt = promptRow ? {
      id: promptRow.id,
      scene_id: promptRow.scene_id,
      name: promptRow.name || promptRow.template_name,
      template: promptRow.template || promptRow.template_content,  // 前端期望 prompt.template
      negative_prompt: promptRow.negative_prompt,
      variables: promptRow.variables,
      is_active: promptRow.is_active
    } : null;

    res.json({
      code: 200,
      data: {
        scene,
        steps: stepsWithOptions,
        prompt
      }
    });
  } catch (error) {
    console.error('获取场景详情错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取系统配置（关于我们页面使用）
router.get('/system', (req, res) => {
  try {
    const db = getDb();
    const configs = db.prepare("SELECT config_key, config_value FROM system_config WHERE config_key IN ('support_email', 'copyright_text')").all();

    const result = {};
    configs.forEach(c => {
      result[c.config_key] = c.config_value;
    });

    res.json({
      code: 200,
      data: result
    });
  } catch (error) {
    console.error('获取系统配置错误:', error);
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

    // 构建扁平化 COS key: {userId}_{scene}_{type}_{filename} 或 {userId}_{type}_{filename}
    let key;
    if (scene) {
      key = `${userId}_${scene}_${type}_${finalFileName}`;
    } else {
      key = `${userId}_${type}_${finalFileName}`;
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

      // 扁平化路径: {userId}_{scene}_{type}_{filename} 或 {userId}_{type}_{filename}
      let key;
      if (scene) {
        key = `${userId}_${scene}_${type}_${finalFileName}`;
      } else {
        key = `${userId}_${type}_${finalFileName}`;
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

// ========== 品级方案接口 ==========

// 获取步骤的品级配置（含样式）
router.get('/step-grades/:sceneId/:stepKey', (req, res) => {
  try {
    const db = getDb();
    const { sceneId, stepKey } = req.params;

    // 查找步骤-方案映射
    const mapping = db.prepare(`
      SELECT m.*, s.name as scheme_name, s.scheme_key
      FROM step_scheme_mappings m
      JOIN grade_schemes s ON m.scheme_id = s.id
      WHERE m.scene_id = ? AND m.step_key = ?
    `).get(sceneId, stepKey);

    if (!mapping) {
      return res.json({
        code: 0,
        data: null,
        msg: '该步骤未配置品级方案'
      });
    }

    // 获取方案的品级列表
    const grades = db.prepare(`
      SELECT * FROM grade_definitions
      WHERE scheme_id = ? AND is_active = 1
      ORDER BY sort_order ASC, id ASC
    `).all(mapping.scheme_id);

    // 解析 style_config JSON
    const gradesWithParsedStyle = grades.map(grade => ({
      id: grade.id,
      gradeKey: grade.grade_key,
      name: grade.name,
      nameEn: grade.name_en,
      description: grade.description,
      weight: grade.weight,
      probability: grade.probability,
      promptText: grade.prompt_text,
      color: grade.color,
      bgColor: grade.bg_color,
      textColor: grade.text_color,
      styleConfig: grade.style_config ? JSON.parse(grade.style_config) : null
    }));

    res.json({
      code: 0,
      data: {
        scheme: {
          id: mapping.scheme_id,
          name: mapping.scheme_name,
          schemeKey: mapping.scheme_key
        },
        grades: gradesWithParsedStyle
      }
    });
  } catch (error) {
    console.error('获取步骤品级配置错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

// 获取所有可用的品级方案列表（供小程序端选择使用）
router.get('/grade-schemes', (req, res) => {
  try {
    const db = getDb();
    const { category } = req.query;

    let sql = 'SELECT id, scheme_key, name, name_en, category FROM grade_schemes WHERE is_active = 1';
    const params = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY sort_order ASC, id ASC';

    const schemes = db.prepare(sql).all(...params);

    res.json({
      code: 0,
      data: schemes.map(s => ({
        id: s.id,
        schemeKey: s.scheme_key,
        name: s.name,
        nameEn: s.name_en,
        category: s.category
      }))
    });
  } catch (error) {
    console.error('获取品级方案列表错误:', error);
    res.status(500).json({ code: -1, msg: '服务器错误' });
  }
});

module.exports = router;
