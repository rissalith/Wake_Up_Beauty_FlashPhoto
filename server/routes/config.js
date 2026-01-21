/**
 * 中台配置API路由
 * 提供场景配置、步骤配置、系统配置等接口
 */

const express = require('express');
const router = express.Router();
const { getAll, getOne, run } = require('../config/database');
const { isCOSConfigured, getPresignedUploadUrl, COS_CONFIG } = require('../config/cos');

// ============================================
// 公开接口 (小程序端调用，无需认证)
// ============================================

/**
 * 获取配置版本号
 * GET /api/config/version
 */
router.get('/version', (req, res) => {
  try {
    const config = getOne('SELECT config_value FROM system_config WHERE config_key = ?', ['config_version']);
    res.json({
      code: 200,
      data: {
        version: parseInt(config?.config_value || '1'),
        timestamp: Date.now()
      }
    });
  } catch (error) {
    console.error('获取配置版本失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 获取完整初始化配置
 * GET /api/config/init
 * 小程序启动时调用，返回所有必要配置
 */
router.get('/init', (req, res) => {
  try {
    const lang = req.query.lang || 'zh-CN';

    // 获取系统配置
    const systemConfigs = getAll('SELECT config_key, config_value, config_type FROM system_config');
    const system = {};
    systemConfigs.forEach(c => {
      let value = c.config_value;
      if (c.config_type === 'boolean') value = value === 'true';
      else if (c.config_type === 'number') value = parseInt(value);
      system[c.config_key] = value;
    });

    // 根据审核模式过滤场景
    let sceneSql = "SELECT * FROM scenes WHERE status != 'inactive' ORDER BY sort_order";
    let scenes = getAll(sceneSql);

    // 语言处理
    scenes = scenes.map(s => ({
      id: s.id,
      name: getLocalizedField(s, 'name', lang),
      description: getLocalizedField(s, 'description', lang),
      icon: s.icon,
      cover_image: s.cover_image,
      status: s.status,
      is_review_safe: s.is_review_safe === 1,
      points_cost: s.points_cost,
      page_path: s.page_path,
      use_dynamic_render: s.use_dynamic_render === 1,
      sort_order: s.sort_order
    }));

    // 获取配置版本
    const versionConfig = getOne('SELECT config_value FROM system_config WHERE config_key = ?', ['config_version']);

    res.json({
      code: 200,
      data: {
        version: parseInt(versionConfig?.config_value || '1'),
        system,
        scenes
      }
    });
  } catch (error) {
    console.error('获取初始化配置失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 获取场景列表
 * GET /api/config/scenes
 */
router.get('/scenes', (req, res) => {
  try {
    const lang = req.query.lang || 'zh-CN';
    const reviewMode = req.query.review_mode === 'true';

    let sql = "SELECT * FROM scenes WHERE status != 'inactive'";
    if (reviewMode) {
      sql += ' AND is_review_safe = 1';
    }
    sql += ' ORDER BY sort_order';

    let scenes = getAll(sql);
    scenes = scenes.map(s => ({
      id: s.id,
      name: getLocalizedField(s, 'name', lang),
      description: getLocalizedField(s, 'description', lang),
      icon: s.icon,
      cover_image: s.cover_image,
      status: s.status,
      is_review_safe: s.is_review_safe === 1,
      points_cost: s.points_cost,
      page_path: s.page_path,
      use_dynamic_render: s.use_dynamic_render === 1
    }));

    res.json({ code: 200, data: scenes });
  } catch (error) {
    console.error('获取场景列表失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 过滤空值字段的工具函数
 * 移除 null、undefined、空字符串的字段
 */
function filterEmptyFields(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined && value !== '') {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 获取单个场景完整配置
 * GET /api/config/scene/:id
 * 
 * 优化点：
 * 1. 扁平化 config 字段，将 gender_based 和 icon 提升到步骤顶层
 * 2. 过滤空值字段，不返回 null 或空字符串
 * 3. 选项根据 lang 参数返回对应语言的 label
 * 4. 统一字段命名规范（使用下划线风格）
 */
router.get('/scene/:id', (req, res) => {
  try {
    const { id } = req.params;
    const lang = req.query.lang || 'zh-CN';

    // 获取场景基本信息
    const scene = getOne('SELECT * FROM scenes WHERE id = ?', [id]);
    if (!scene) {
      return res.status(404).json({ code: 404, message: '场景不存在' });
    }

    // 获取步骤配置
    const steps = getAll('SELECT * FROM scene_steps WHERE scene_id = ? AND is_visible = 1 ORDER BY step_order', [id]);

    // 获取每个步骤的选项
    const stepsWithOptions = steps.map(step => {
      const options = getAll('SELECT * FROM step_options WHERE step_id = ? AND is_visible = 1 ORDER BY sort_order', [step.id]);
      
      // 解析 config 字段
      const config = step.config ? JSON.parse(step.config) : {};

      // 处理选项，根据语言返回对应的 label
      const processedOptions = options.map(opt => {
        const metadata = opt.metadata ? JSON.parse(opt.metadata) : null;
        
        // 构建选项对象，只包含有值的字段
        const optionObj = {
          id: opt.option_key,  // 统一使用 id 作为标识符
          label: getLocalizedField(opt, 'label', lang),  // 根据语言返回对应的 label
          prompt_text: opt.prompt_text,
          is_default: opt.is_default === 1
        };
        
        // 只添加有值的可选字段
        if (opt.icon) optionObj.icon = opt.icon;
        if (opt.image) optionObj.image = opt.image;
        if (opt.color) optionObj.color = opt.color;
        if (opt.gender) optionObj.gender = opt.gender;
        if (opt.extra_points > 0) optionObj.extra_points = opt.extra_points;
        if (metadata) optionObj.metadata = metadata;
        
        return optionObj;
      });

      // 构建步骤对象，扁平化 config 字段
      const stepObj = {
        id: step.id,
        step_order: step.step_order,
        step_key: step.step_key,
        title: getLocalizedField(step, 'title', lang),
        component_type: step.component_type,
        is_required: step.is_required === 1,
        icon: config.icon || null,
        options: processedOptions
      };
      
      // 处理依赖配置：支持新的 depends_on 格式，同时兼容旧的 gender_based
      if (config.depends_on) {
        // 新格式：{ step: "gender", filter_field: "gender" }
        stepObj.depends_on = config.depends_on;
      } else if (config.gender_based) {
        // 旧格式兼容：自动转换为新格式
        stepObj.depends_on = {
          step: 'gender',
          filter_field: 'gender'
        };
      }
      
      // 只添加有值的可选字段
      if (step.subtitle) stepObj.subtitle = step.subtitle;
      if (!stepObj.icon) delete stepObj.icon;  // 移除空的 icon
      
      return stepObj;
    });

    // 获取Prompt模板
    const promptTemplate = getOne('SELECT * FROM prompt_templates WHERE scene_id = ? AND is_active = 1 ORDER BY version DESC LIMIT 1', [id]);

    // 获取规格配置
    const specs = getAll('SELECT * FROM photo_specs WHERE scene_id = ? AND is_visible = 1 ORDER BY sort_order', [id]);

    res.json({
      code: 200,
      data: {
        scene: filterEmptyFields({
          id: scene.id,
          name: getLocalizedField(scene, 'name', lang),
          description: getLocalizedField(scene, 'description', lang),
          icon: scene.icon,
          points_cost: scene.points_cost,
          use_dynamic_render: scene.use_dynamic_render === 1
        }),
        steps: stepsWithOptions,
        prompt: promptTemplate ? filterEmptyFields({
          template: promptTemplate.template,
          negative_prompt: promptTemplate.negative_prompt,
          version: promptTemplate.version
        }) : null,
        specs: specs.map(s => filterEmptyFields({
          id: s.spec_key,  // 统一使用 id
          name: getLocalizedField(s, 'name', lang),
          width: s.width,
          height: s.height,
          physical_width: s.physical_width,
          physical_height: s.physical_height,
          ratio: s.ratio
        }))
      }
    });
  } catch (error) {
    console.error('获取场景配置失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 获取系统配置
 * GET /api/config/system
 */
router.get('/system', (req, res) => {
  try {
    const configs = getAll('SELECT config_key, config_value, config_type FROM system_config');
    const result = {};
    configs.forEach(c => {
      let value = c.config_value;
      if (c.config_type === 'boolean') value = value === 'true';
      else if (c.config_type === 'number') value = parseInt(value);
      result[c.config_key] = value;
    });
    res.json({ code: 200, data: result });
  } catch (error) {
    console.error('获取系统配置失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// ============================================
// 管理接口 (需要认证)
// ============================================
const authMiddleware = require('../middleware/auth');

/**
 * 获取所有场景 (管理端)
 * GET /api/config/admin/scenes
 */
router.get('/admin/scenes', authMiddleware, (req, res) => {
  try {
    const scenes = getAll('SELECT * FROM scenes ORDER BY sort_order');
    res.json({ code: 200, data: scenes });
  } catch (error) {
    console.error('获取场景列表失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 创建/更新场景
 * POST /api/config/admin/scene
 */
router.post('/admin/scene', authMiddleware, (req, res) => {
  try {
    const { id, name, name_en, name_tw, description, description_en, description_tw, icon, cover_image, status, is_review_safe, points_cost, page_path, use_dynamic_render, sort_order } = req.body;

    if (!id || !name) {
      return res.status(400).json({ code: 400, message: '场景ID和名称不能为空' });
    }

    // 检查是否存在
    const existing = getOne('SELECT id FROM scenes WHERE id = ?', [id]);

    if (existing) {
      // 更新
      run(`UPDATE scenes SET name=?, name_en=?, name_tw=?, description=?, description_en=?, description_tw=?, icon=?, cover_image=?, status=?, is_review_safe=?, points_cost=?, page_path=?, use_dynamic_render=?, sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [name, name_en, name_tw, description, description_en, description_tw, icon, cover_image, status, is_review_safe ? 1 : 0, points_cost, page_path, use_dynamic_render ? 1 : 0, sort_order, id]);
    } else {
      // 新增
      run(`INSERT INTO scenes (id, name, name_en, name_tw, description, description_en, description_tw, icon, cover_image, status, is_review_safe, points_cost, page_path, use_dynamic_render, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, name_en, name_tw, description, description_en, description_tw, icon, cover_image, status || 'active', is_review_safe ? 1 : 0, points_cost || 50, page_path, use_dynamic_render ? 1 : 0, sort_order || 0]);
    }

    // 更新配置版本
    incrementConfigVersion();

    res.json({ code: 200, message: '保存成功' });
  } catch (error) {
    console.error('保存场景失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 删除场景
 * DELETE /api/config/admin/scene/:id
 */
router.delete('/admin/scene/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    run('DELETE FROM scenes WHERE id = ?', [id]);
    run('DELETE FROM scene_steps WHERE scene_id = ?', [id]);
    incrementConfigVersion();
    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    console.error('删除场景失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 更新场景排序
 * POST /api/config/admin/scenes/sort
 */
router.post('/admin/scenes/sort', authMiddleware, (req, res) => {
  try {
    const { orders } = req.body; // [{id: 'idphoto', sort_order: 1}, ...]

    for (const item of orders) {
      run('UPDATE scenes SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
    }

    incrementConfigVersion();
    res.json({ code: 200, message: '排序更新成功' });
  } catch (error) {
    console.error('更新排序失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 获取场景步骤配置 (管理端)
 * GET /api/config/admin/scene/:id/steps
 */
router.get('/admin/scene/:id/steps', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const steps = getAll('SELECT * FROM scene_steps WHERE scene_id = ? ORDER BY step_order', [id]);

    const stepsWithOptions = steps.map(step => {
      const options = getAll('SELECT * FROM step_options WHERE step_id = ? ORDER BY sort_order', [step.id]);
      return {
        ...step,
        config: step.config ? JSON.parse(step.config) : {},
        options
      };
    });

    res.json({ code: 200, data: stepsWithOptions });
  } catch (error) {
    console.error('获取步骤配置失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 保存步骤配置
 * POST /api/config/admin/scene/:sceneId/step
 */
router.post('/admin/scene/:sceneId/step', authMiddleware, (req, res) => {
  try {
    const { sceneId } = req.params;
    const { id, step_order, step_key, title, title_en, title_tw, subtitle, component_type, is_required, is_visible, config } = req.body;

    const configStr = config ? JSON.stringify(config) : null;

    if (id) {
      // 更新
      run(`UPDATE scene_steps SET step_order=?, step_key=?, title=?, title_en=?, title_tw=?, subtitle=?, component_type=?, is_required=?, is_visible=?, config=? WHERE id=?`,
        [step_order, step_key, title, title_en, title_tw, subtitle, component_type, is_required ? 1 : 0, is_visible ? 1 : 0, configStr, id]);
      res.json({ code: 200, message: '更新成功', data: { id } });
    } else {
      // 新增
      run(`INSERT INTO scene_steps (scene_id, step_order, step_key, title, title_en, title_tw, subtitle, component_type, is_required, is_visible, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sceneId, step_order, step_key, title, title_en, title_tw, subtitle, component_type, is_required ? 1 : 0, is_visible !== false ? 1 : 0, configStr]);

      const newStep = getOne('SELECT id FROM scene_steps WHERE scene_id = ? AND step_key = ?', [sceneId, step_key]);
      res.json({ code: 200, message: '创建成功', data: { id: newStep?.id } });
    }

    incrementConfigVersion();
  } catch (error) {
    console.error('保存步骤失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 保存步骤选项
 * POST /api/config/admin/step/:stepId/option
 */
router.post('/admin/step/:stepId/option', authMiddleware, (req, res) => {
  try {
    const { stepId } = req.params;
    const { id, option_key, label, label_en, label_tw, icon, image, color, prompt_text, extra_points, sort_order, is_default, is_visible, gender, metadata } = req.body;

    const metadataStr = metadata ? JSON.stringify(metadata) : null;

    if (id) {
      run(`UPDATE step_options SET option_key=?, label=?, label_en=?, label_tw=?, icon=?, image=?, color=?, prompt_text=?, extra_points=?, sort_order=?, is_default=?, is_visible=?, gender=?, metadata=? WHERE id=?`,
        [option_key, label, label_en, label_tw, icon, image, color, prompt_text, extra_points || 0, sort_order || 0, is_default ? 1 : 0, is_visible !== false ? 1 : 0, gender, metadataStr, id]);
    } else {
      run(`INSERT INTO step_options (step_id, option_key, label, label_en, label_tw, icon, image, color, prompt_text, extra_points, sort_order, is_default, is_visible, gender, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [stepId, option_key, label, label_en, label_tw, icon, image, color, prompt_text, extra_points || 0, sort_order || 0, is_default ? 1 : 0, is_visible !== false ? 1 : 0, gender, metadataStr]);
    }

    incrementConfigVersion();
    res.json({ code: 200, message: '保存成功' });
  } catch (error) {
    console.error('保存选项失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 删除步骤选项
 * DELETE /api/config/admin/option/:id
 */
router.delete('/admin/option/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    run('DELETE FROM step_options WHERE id = ?', [id]);
    incrementConfigVersion();
    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    console.error('删除选项失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 更新系统配置
 * POST /api/config/admin/system
 */
router.post('/admin/system', authMiddleware, (req, res) => {
  try {
    const configs = req.body; // { review_mode: true, announcement: '...' }

    for (const [key, value] of Object.entries(configs)) {
      const valueStr = typeof value === 'boolean' ? value.toString() : String(value);
      run('UPDATE system_config SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?', [valueStr, key]);
    }

    incrementConfigVersion();
    res.json({ code: 200, message: '配置更新成功' });
  } catch (error) {
    console.error('更新系统配置失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 获取Prompt模板列表
 * GET /api/config/admin/prompts/:sceneId
 */
router.get('/admin/prompts/:sceneId', authMiddleware, (req, res) => {
  try {
    const { sceneId } = req.params;
    const prompts = getAll('SELECT * FROM prompt_templates WHERE scene_id = ? ORDER BY version DESC', [sceneId]);
    res.json({ code: 200, data: prompts });
  } catch (error) {
    console.error('获取Prompt模板失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

/**
 * 保存Prompt模板
 * POST /api/config/admin/prompt
 */
router.post('/admin/prompt', authMiddleware, (req, res) => {
  try {
    const { id, scene_id, name, template, negative_prompt, is_active } = req.body;

    if (id) {
      run(`UPDATE prompt_templates SET name=?, template=?, negative_prompt=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [name, template, negative_prompt, is_active ? 1 : 0, id]);
    } else {
      // 获取最新版本号
      const latest = getOne('SELECT MAX(version) as max_version FROM prompt_templates WHERE scene_id = ?', [scene_id]);
      const newVersion = (latest?.max_version || 0) + 1;

      run(`INSERT INTO prompt_templates (scene_id, name, template, negative_prompt, version, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
        [scene_id, name, template, negative_prompt, newVersion, is_active ? 1 : 0]);
    }

    incrementConfigVersion();
    res.json({ code: 200, message: '保存成功' });
  } catch (error) {
    console.error('保存Prompt模板失败:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// ============================================
// 辅助函数
// ============================================

/**
 * 获取本地化字段
 */
function getLocalizedField(obj, fieldName, lang) {
  if (lang === 'en' && obj[`${fieldName}_en`]) {
    return obj[`${fieldName}_en`];
  }
  if ((lang === 'zh-TW' || lang === 'zh-Hant') && obj[`${fieldName}_tw`]) {
    return obj[`${fieldName}_tw`];
  }
  return obj[fieldName];
}

/**
 * 增加配置版本号
 */
function incrementConfigVersion() {
  const current = getOne('SELECT config_value FROM system_config WHERE config_key = ?', ['config_version']);
  const newVersion = parseInt(current?.config_value || '0') + 1;
  run('UPDATE system_config SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?', [String(newVersion), 'config_version']);
}

// ============================================
// COS 上传凭证接口
// ============================================

/**
 * 获取 COS 上传凭证（预签名 URL）
 * POST /api/config/cos/upload-credential
 */
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

/**
 * 获取 COS 配置信息（公开信息，不含密钥）
 * GET /api/config/cos/info
 */
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
