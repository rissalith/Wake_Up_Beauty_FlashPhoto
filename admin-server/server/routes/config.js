// 中台配置相关路由 - 小程序获取动态配置
const express = require('express');
const router = express.Router();
const { getOne, getAll, run, runBatch, commitBatch } = require('../config/database');

// ========== 公开接口（小程序调用）==========

// 获取配置版本号（用于判断是否需要更新缓存）
router.get('/version', (req, res) => {
  try {
    const config = getOne("SELECT config_value FROM system_config WHERE config_key = 'config_version'");
    const version = config ? config.config_value : '1.0.0';
    res.json({ code: 200, data: { version, timestamp: Date.now() } });
  } catch (error) {
    console.error('获取配置版本失败:', error);
    res.json({ code: 200, data: { version: '1.0.0', timestamp: Date.now() } });
  }
});

// 获取系统配置（审核模式、维护模式等）
router.get('/system', (req, res) => {
  try {
    const configs = getAll("SELECT config_key, config_value, config_type FROM system_config WHERE config_type IS NOT NULL");
    const result = {};
    configs.forEach(c => {
      let value = c.config_value;
      if (c.config_type === 'boolean') {
        value = c.config_value === 'true' || c.config_value === '1';
      } else if (c.config_type === 'number') {
        value = Number(c.config_value);
      } else if (c.config_type === 'json') {
        try { value = JSON.parse(c.config_value); } catch (e) { /* keep string */ }
      }
      result[c.config_key] = value;
    });
    res.json({ code: 200, data: result });
  } catch (error) {
    console.error('获取系统配置失败:', error);
    // 返回默认配置
    res.json({
      code: 200,
      data: {
        review_mode: false,
        maintenance_mode: false,
        announcement_enabled: false,
        announcement_text: ''
      }
    });
  }
});

// 获取场景列表（根据审核模式过滤，只返回上线和即将上线的）
router.get('/scenes', (req, res) => {
  try {
    // CDN图标配置（用于补全缺失的icon）
    const CDN_BASE = 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com';
    const IMG_VERSION = Date.now();
    const defaultIconMap = {
      'id_photo': `${CDN_BASE}/id-photo.png?v=${IMG_VERSION}`,
      'professional': `${CDN_BASE}/professional.png?v=${IMG_VERSION}`,
      'resume': `${CDN_BASE}/id-photo.png?v=${IMG_VERSION}`,
      'social': `${CDN_BASE}/portrait.png?v=${IMG_VERSION}`,
      'passport': `${CDN_BASE}/id-photo.png?v=${IMG_VERSION}`,
      'student': `${CDN_BASE}/id-photo.png?v=${IMG_VERSION}`,
      'portrait': `${CDN_BASE}/portrait.png?v=${IMG_VERSION}`,
      'family': `${CDN_BASE}/family.png?v=${IMG_VERSION}`,
      'pet': `${CDN_BASE}/pet.png?v=${IMG_VERSION}`,
      'wedding': `${CDN_BASE}/wedding.png?v=${IMG_VERSION}`
    };
    const defaultIcon = `${CDN_BASE}/id-photo.png?v=${IMG_VERSION}`;

    // 检查审核模式
    const reviewConfig = getOne("SELECT config_value FROM system_config WHERE config_key = 'review_mode'");
    const isReviewMode = reviewConfig && (reviewConfig.config_value === 'true' || reviewConfig.config_value === '1');

    // 只返回 active 和 coming_soon 状态的场景
    let sql = `SELECT id, name, name_en, description, description_en,
      icon, cover_image, points_cost, status, page_path, use_dynamic_render, sort_order
      FROM scenes WHERE status IN ('active', 'coming_soon')`;
    if (isReviewMode) {
      sql += " AND is_review_safe = 1";
    }
    sql += " ORDER BY sort_order ASC";

    const scenes = getAll(sql);
    // 补全缺失的icon，并为所有icon添加时间戳
    const scenesWithIcon = scenes.map(scene => ({
      ...scene,
      icon: scene.icon ? `${scene.icon}${scene.icon.includes('?') ? '&' : '?'}v=${IMG_VERSION}` : (defaultIconMap[scene.id] || defaultIcon)
    }));
    res.json({ code: 200, data: scenesWithIcon });
  } catch (error) {
    console.error('获取场景列表失败:', error);
    res.json({ code: 500, message: '获取场景列表失败' });
  }
});

// 获取场景详细配置（包含步骤和选项）
router.get('/scene/:id', (req, res) => {
  try {
    const sceneId = req.params.id;

    // 获取场景基本信息（只允许访问active状态的场景）
    const scene = getOne(`SELECT * FROM scenes WHERE id = '${sceneId}' AND status = 'active'`);
    if (!scene) {
      return res.json({ code: 404, message: '场景不存在或未上线' });
    }

    // 获取场景步骤
    const steps = getAll(`SELECT * FROM scene_steps WHERE scene_id = '${scene.id}' AND is_visible = 1 ORDER BY step_order ASC`);

    // 获取每个步骤的选项
    const stepsWithOptions = steps.map(step => {
      const options = getAll(`SELECT * FROM step_options WHERE step_id = ${step.id} AND is_visible = 1 ORDER BY sort_order ASC`);
      return {
        ...step,
        options: options.map(opt => ({
          id: opt.option_key,
          name: opt.label,
          nameEn: opt.label_en,
          value: opt.option_key,
          image: opt.image,
          color: opt.color,
          gender: opt.gender,
          promptText: opt.prompt_text || opt.label
        }))
      };
    });

    // 获取Prompt模板
    const promptTemplate = getOne(`SELECT template FROM prompt_templates WHERE scene_id = '${scene.id}' AND is_active = 1`);

    res.json({
      code: 200,
      data: {
        ...scene,
        steps: stepsWithOptions,
        promptTemplate: promptTemplate ? promptTemplate.template : null
      }
    });
  } catch (error) {
    console.error('获取场景配置失败:', error);
    res.json({ code: 500, message: '获取场景配置失败' });
  }
});

// 获取完整初始化配置（首次加载时一次性获取所有数据）
router.get('/init', (req, res) => {
  try {
    // CDN图标配置（用于补全缺失的icon）
    const CDN_BASE = 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com';
    const IMG_VERSION = Date.now();
    const defaultIconMap = {
      'id_photo': `${CDN_BASE}/id-photo.png?v=${IMG_VERSION}`,
      'professional': `${CDN_BASE}/professional.png?v=${IMG_VERSION}`,
      'resume': `${CDN_BASE}/id-photo.png?v=${IMG_VERSION}`,
      'social': `${CDN_BASE}/portrait.png?v=${IMG_VERSION}`,
      'passport': `${CDN_BASE}/id-photo.png?v=${IMG_VERSION}`,
      'student': `${CDN_BASE}/id-photo.png?v=${IMG_VERSION}`,
      'portrait': `${CDN_BASE}/portrait.png?v=${IMG_VERSION}`,
      'family': `${CDN_BASE}/family.png?v=${IMG_VERSION}`,
      'pet': `${CDN_BASE}/pet.png?v=${IMG_VERSION}`,
      'wedding': `${CDN_BASE}/wedding.png?v=${IMG_VERSION}`
    };
    const defaultIcon = `${CDN_BASE}/id-photo.png?v=${IMG_VERSION}`;

    // 1. 获取版本号
    const versionConfig = getOne("SELECT config_value FROM system_config WHERE config_key = 'config_version'");
    const version = versionConfig ? (versionConfig.config_value || '1.0.0') : '1.0.0';

    // 2. 获取系统配置
    const systemConfigs = getAll("SELECT config_key, config_value, config_type FROM system_config");
    const system = {};
    systemConfigs.forEach(c => {
      let value = c.config_value;
      if (c.config_type === 'boolean') {
        value = c.config_value === 'true' || c.config_value === '1';
      } else if (c.config_type === 'number') {
        value = Number(c.config_value);
      } else if (c.config_type === 'json') {
        try { value = JSON.parse(c.config_value); } catch (e) { /* keep string */ }
      }
      system[c.config_key] = value;
    });

    // 3. 获取场景列表（根据审核模式过滤，只返回可见状态）
    const isReviewMode = system.review_mode === true;
    let sceneSql = "SELECT * FROM scenes WHERE status IN ('active', 'coming_soon')";
    if (isReviewMode) {
      sceneSql += " AND is_review_safe = 1";
    }
    sceneSql += " ORDER BY sort_order ASC";
    const scenes = getAll(sceneSql);

    // 4. 获取所有步骤和选项（兼容不同数据库结构：is_active vs is_visible）
    let allSteps = [];
    let allOptions = [];
    try {
      // 尝试使用 is_visible (生产数据库)
      allSteps = getAll("SELECT * FROM scene_steps WHERE is_visible = 1 ORDER BY step_order ASC");
      allOptions = getAll("SELECT * FROM step_options WHERE is_visible = 1 ORDER BY sort_order ASC");
    } catch (e) {
      // 回退到 is_active (本地数据库)
      allSteps = getAll("SELECT * FROM scene_steps WHERE is_active = 1 ORDER BY step_order ASC");
      allOptions = getAll("SELECT * FROM step_options WHERE is_active = 1 ORDER BY sort_order ASC");
    }

    // 构建完整的场景数据（补全缺失的icon）
    const scenesWithConfig = scenes.map(scene => {
      const sceneSteps = allSteps.filter(s => s.scene_id == scene.id);
      const stepsWithOptions = sceneSteps.map(step => {
        const stepOptions = allOptions.filter(o => o.step_id == step.id);
        return {
          ...step,
          // 兼容不同字段名: title vs step_name, label vs name
          name: step.title || step.step_name,
          // 确保返回icon和gender_based字段
          icon: step.icon || '',
          gender_based: step.gender_based === 1 || step.gender_based === true,
          options: stepOptions.map(opt => ({
            id: opt.option_key,
            name: opt.label || opt.name,
            nameEn: opt.label_en || opt.name_en,
            value: opt.option_value || opt.color || '',
            image: opt.image || opt.image_url ? `${opt.image || opt.image_url}${(opt.image || opt.image_url).includes('?') ? '&' : '?'}v=${IMG_VERSION}` : '',
            color: opt.color || '',
            gender: opt.gender || null,
            promptText: opt.prompt_text || opt.label || opt.name,
            isDefault: opt.is_default === 1 || opt.is_default === true
          }))
        };
      });

      // 获取该场景的Prompt模板
      let promptTemplate = null;
      try {
        const prompt = getOne(`SELECT template FROM prompt_templates WHERE scene_id = '${scene.id}' AND is_active = 1`);
        promptTemplate = prompt ? prompt.template : null;
      } catch (e) {
        // 忽略错误
      }

      // 如果场景没有icon，使用默认icon，否则为现有icon添加时间戳
      const sceneIcon = scene.icon ? `${scene.icon}${scene.icon.includes('?') ? '&' : '?'}v=${IMG_VERSION}` : (defaultIconMap[scene.id] || defaultIcon);
      return {
        ...scene,
        icon: sceneIcon,
        steps: stepsWithOptions,
        promptTemplate: promptTemplate
      };
    });

    // 5. 获取规格配置（兼容不同数据库结构）
    let photoSpecs = [];
    try {
      photoSpecs = getAll("SELECT * FROM photo_specs WHERE is_visible = 1 ORDER BY sort_order ASC");
    } catch (e) {
      try {
        photoSpecs = getAll("SELECT * FROM photo_specs WHERE is_active = 1 ORDER BY sort_order ASC");
      } catch (e2) {
        photoSpecs = getAll("SELECT * FROM photo_specs ORDER BY sort_order ASC");
      }
    }

    res.json({
      code: 200,
      data: {
        version,
        timestamp: Date.now(),
        system,
        scenes: scenesWithConfig,
        photoSpecs
      }
    });
  } catch (error) {
    console.error('获取初始化配置失败:', error);
    res.json({ code: 500, message: '获取配置失败', error: error.message });
  }
});

// ========== 管理接口（后台调用，需要认证）==========

// 创建/更新场景
router.post('/admin/scene', (req, res) => {
  try {
    const {
      id, scene_key, name, name_en,
      description, description_en,
      icon, cover_image, price, points_cost, is_free, status,
      is_review_safe, page_path, use_dynamic_render,
      coming_soon_text, sort_order
    } = req.body;

    // 兼容 price 和 points_cost
    const cost = points_cost || price || 0;

    if (id) {
      // 更新现有场景 - 使用兼容生产数据库的字段
      run(`UPDATE scenes SET
        name = '${name || ''}',
        name_en = '${name_en || ''}',
        description = '${description || ''}',
        description_en = '${description_en || ''}',
        icon = '${icon || ''}',
        cover_image = '${cover_image || ''}',
        points_cost = ${cost},
        status = '${status || 'offline'}',
        is_review_safe = ${is_review_safe ? 1 : 0},
        page_path = '${page_path || ''}',
        use_dynamic_render = ${use_dynamic_render ? 1 : 0},
        sort_order = ${sort_order || 0},
        updated_at = datetime('now')
        WHERE id = '${id}'`);
    } else {
      // 创建新场景 - 使用兼容生产数据库的字段
      const newId = scene_key || `scene_${Date.now()}`;
      run(`INSERT INTO scenes (id, name, name_en, description, description_en, icon, cover_image, points_cost, status, is_review_safe, page_path, use_dynamic_render, sort_order, created_at, updated_at)
        VALUES ('${newId}', '${name || ''}', '${name_en || ''}', '${description || ''}', '${description_en || ''}', '${icon || ''}', '${cover_image || ''}', ${cost}, '${status || 'offline'}', ${is_review_safe ? 1 : 0}, '${page_path || ''}', ${use_dynamic_render ? 1 : 0}, ${sort_order || 0}, datetime('now'), datetime('now'))`);
    }

    // 更新配置版本号
    updateConfigVersion();

    res.json({ code: 200, message: '保存成功' });
  } catch (error) {
    console.error('保存场景失败:', error);
    res.json({ code: 500, message: '保存失败: ' + error.message });
  }
});

// 快速更新场景状态
router.post('/admin/scene/status', (req, res) => {
  try {
    const { id, status } = req.body;
    if (!['active', 'coming_soon', 'offline', 'inactive', 'beta'].includes(status)) {
      return res.json({ code: 400, message: '无效的状态值' });
    }

    // 如果要设置为上线状态，需要验证场景配置是否完整
    if (status === 'active') {
      const scene = getOne(`SELECT * FROM scenes WHERE id = '${id}'`);
      if (!scene) {
        return res.json({ code: 404, message: '场景不存在' });
      }

      // 验证必要条件
      const errors = [];

      // 1. 基本信息必填项验证
      if (!scene.name || !scene.name.trim()) {
        errors.push('缺少场景名称');
      }
      if (!scene.icon || !scene.icon.trim()) {
        errors.push('缺少场景图标');
      }
      if (!scene.description || !scene.description.trim()) {
        errors.push('缺少场景描述');
      }

      // 2. 必须至少存在1个步骤
      const steps = getAll(`SELECT id FROM scene_steps WHERE scene_id = '${id}'`);
      if (steps.length === 0) {
        errors.push('至少需要配置1个步骤');
      }

      // 3. 必须存在Prompt模板
      const prompt = getOne(`SELECT id, template FROM prompt_templates WHERE scene_id = '${id}'`);
      if (!prompt || !prompt.template || !prompt.template.trim()) {
        errors.push('缺少Prompt模板');
      }

      if (errors.length > 0) {
        return res.json({
          code: 400,
          message: `无法上线：${errors.join('、')}`,
          errors
        });
      }
    }

    // 兼容字符串和数字类型的id
    run(`UPDATE scenes SET status = '${status}', updated_at = datetime('now') WHERE id = '${id}'`);
    updateConfigVersion();
    res.json({ code: 200, message: '状态更新成功' });
  } catch (error) {
    console.error('更新状态失败:', error);
    res.json({ code: 500, message: '更新失败' });
  }
});

// 获取所有场景（管理后台用，包含所有状态）
router.get('/admin/scenes', (req, res) => {
  try {
    const scenes = getAll("SELECT * FROM scenes ORDER BY sort_order ASC");
    res.json({ code: 200, data: scenes });
  } catch (error) {
    console.error('获取场景列表失败:', error);
    res.json({ code: 500, message: '获取失败' });
  }
});

// 更新场景排序
router.post('/admin/scenes/sort', (req, res) => {
  try {
    const { scenes } = req.body;
    scenes.forEach((scene, index) => {
      run(`UPDATE scenes SET sort_order = ${index} WHERE id = ${scene.id}`);
    });
    updateConfigVersion();
    res.json({ code: 200, message: '排序更新成功' });
  } catch (error) {
    console.error('更新排序失败:', error);
    res.json({ code: 500, message: '更新失败' });
  }
});

// 更新系统配置
router.post('/admin/system', (req, res) => {
  try {
    const configs = req.body;
    Object.keys(configs).forEach(key => {
      const value = typeof configs[key] === 'boolean' ? (configs[key] ? 'true' : 'false') : String(configs[key]);
      run(`UPDATE system_config SET config_value = '${value}', updated_at = datetime('now') WHERE config_key = '${key}'`);
    });
    updateConfigVersion();
    res.json({ code: 200, message: '配置更新成功' });
  } catch (error) {
    console.error('更新配置失败:', error);
    res.json({ code: 500, message: '更新失败' });
  }
});

// 保存Prompt模板
router.post('/admin/prompt', (req, res) => {
  try {
    const { scene_id, template_content, template_name, template, name } = req.body;
    // 兼容两种字段名：template_content/template, template_name/name
    const templateText = (template_content || template || '').replace(/'/g, "''");
    const templateNameText = (template_name || name || '').replace(/'/g, "''");

    const existing = getOne(`SELECT id FROM prompt_templates WHERE scene_id = '${scene_id}'`);
    if (existing) {
      run(`UPDATE prompt_templates SET template = '${templateText}', name = '${templateNameText}', updated_at = datetime('now') WHERE scene_id = '${scene_id}'`);
    } else {
      run(`INSERT INTO prompt_templates (scene_id, name, template) VALUES ('${scene_id}', '${templateNameText}', '${templateText}')`);
    }

    updateConfigVersion();
    res.json({ code: 200, message: '模板保存成功' });
  } catch (error) {
    console.error('保存模板失败:', error);
    res.json({ code: 500, message: '保存失败' });
  }
});

// 获取场景Prompt模板
router.get('/admin/prompts/:sceneId', (req, res) => {
  try {
    const sceneId = req.params.sceneId;
    const prompts = getAll(`SELECT * FROM prompt_templates WHERE scene_id = '${sceneId}'`);
    res.json({ code: 200, data: prompts });
  } catch (error) {
    console.error('获取Prompt失败:', error);
    res.json({ code: 500, message: '获取失败' });
  }
});

// 删除场景
router.delete('/admin/scene/:id', (req, res) => {
  try {
    const sceneId = req.params.id;
    // 先删除关联的步骤选项
    const steps = getAll(`SELECT id FROM scene_steps WHERE scene_id = ${sceneId}`);
    steps.forEach(step => {
      run(`DELETE FROM step_options WHERE step_id = ${step.id}`);
    });
    // 删除步骤
    run(`DELETE FROM scene_steps WHERE scene_id = ${sceneId}`);
    // 删除Prompt模板
    run(`DELETE FROM prompt_templates WHERE scene_id = ${sceneId}`);
    // 删除场景
    run(`DELETE FROM scenes WHERE id = ${sceneId}`);
    updateConfigVersion();
    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    console.error('删除场景失败:', error);
    res.json({ code: 500, message: '删除失败' });
  }
});

// 获取场景步骤配置
router.get('/admin/scene/:sceneId/steps', (req, res) => {
  try {
    const sceneId = req.params.sceneId;
    const steps = getAll(`SELECT * FROM scene_steps WHERE scene_id = '${sceneId}' ORDER BY step_order ASC`);
    // 获取每个步骤的选项
    const stepsWithOptions = steps.map(step => {
      const options = getAll(`SELECT * FROM step_options WHERE step_id = ${step.id} ORDER BY sort_order ASC`);
      return { ...step, options };
    });
    res.json({ code: 200, data: stepsWithOptions });
  } catch (error) {
    console.error('获取步骤配置失败:', error);
    res.json({ code: 500, message: '获取失败' });
  }
});

// 保存场景步骤
router.post('/admin/scene/:sceneId/step', (req, res) => {
  try {
    const sceneId = req.params.sceneId;
    const { id, step_key, step_order, is_required, config, icon, gender_based } = req.body;
    // 兼容前端传入的不同字段名
    const title = req.body.title || req.body.step_name || '';
    const titleEn = req.body.title_en || req.body.step_name_en || '';
    const componentType = req.body.component_type || req.body.step_type || 'select';
    const isVisible = req.body.is_visible !== undefined ? req.body.is_visible : (req.body.is_active !== false);

    let stepId = id;
    if (id) {
      run(`UPDATE scene_steps SET
        step_key = '${step_key || ''}',
        title = '${title}',
        title_en = '${titleEn}',
        component_type = '${componentType}',
        step_order = ${step_order || 0},
        is_required = ${is_required ? 1 : 0},
        is_visible = ${isVisible ? 1 : 0},
        icon = '${icon || ''}',
        gender_based = ${gender_based ? 1 : 0},
        config = '${config ? JSON.stringify(config).replace(/'/g, "''") : ''}'
        WHERE id = ${id}`);
    } else {
      run(`INSERT INTO scene_steps (scene_id, step_key, step_name, step_name_en, title, title_en, component_type, step_order, is_required, is_visible, icon, gender_based, config, created_at)
        VALUES ('${sceneId}', '${step_key || ''}', '${title}', '${titleEn}', '${title}', '${titleEn}', '${componentType}', ${step_order || 0}, ${is_required ? 1 : 0}, ${isVisible ? 1 : 0}, '${icon || ''}', ${gender_based ? 1 : 0}, '${config ? JSON.stringify(config).replace(/'/g, "''") : ''}', datetime('now'))`);
      // 获取新插入的ID
      const newStep = getOne(`SELECT id FROM scene_steps WHERE scene_id = '${sceneId}' ORDER BY id DESC LIMIT 1`);
      stepId = newStep ? newStep.id : null;
    }
    updateConfigVersion();
    res.json({ code: 200, message: '保存成功', data: { id: stepId } });
  } catch (error) {
    console.error('保存步骤失败:', error);
    res.json({ code: 500, message: '保存失败: ' + error.message });
  }
});

// 保存步骤选项
router.post('/admin/step/:stepId/option', (req, res) => {
  try {
    const stepId = req.params.stepId;
    const { id, option_key, sort_order, is_default, gender, extra_points, width, height } = req.body;
    // 兼容前端传入的不同字段名
    const label = req.body.label || req.body.name || '';
    const labelEn = req.body.label_en || req.body.name_en || '';
    const image = req.body.image || req.body.image_url || '';
    const color = req.body.color || req.body.option_value || '';
    const promptText = req.body.prompt_text || '';
    const isVisible = req.body.is_visible !== undefined ? req.body.is_visible : (req.body.is_active !== false);

    // 构建metadata JSON（存储尺寸等扩展属性）
    const metadata = {};
    if (width) metadata.width = width;
    if (height) metadata.height = height;
    const metadataStr = Object.keys(metadata).length > 0 ? JSON.stringify(metadata).replace(/'/g, "''") : '';

    if (id) {
      run(`UPDATE step_options SET
        option_key = '${option_key || ''}',
        label = '${label}',
        label_en = '${labelEn}',
        color = '${color}',
        image = '${image}',
        prompt_text = '${promptText.replace(/'/g, "''")}',
        sort_order = ${sort_order || 0},
        is_visible = ${isVisible ? 1 : 0},
        is_default = ${is_default ? 1 : 0},
        gender = ${gender ? `'${gender}'` : 'NULL'},
        extra_points = ${extra_points || 0},
        metadata = '${metadataStr}'
        WHERE id = ${id}`);
    } else {
      run(`INSERT INTO step_options (step_id, option_key, label, label_en, color, image, prompt_text, sort_order, is_visible, is_default, gender, extra_points, metadata)
        VALUES (${stepId}, '${option_key || ''}', '${label}', '${labelEn}', '${color}', '${image}', '${promptText.replace(/'/g, "''")}', ${sort_order || 0}, ${isVisible ? 1 : 0}, ${is_default ? 1 : 0}, ${gender ? `'${gender}'` : 'NULL'}, ${extra_points || 0}, '${metadataStr}')`);
    }
    updateConfigVersion();
    res.json({ code: 200, message: '保存成功' });
  } catch (error) {
    console.error('保存选项失败:', error);
    res.json({ code: 500, message: '保存失败: ' + error.message });
  }
});

// 批量保存场景配置（步骤+选项+Prompt，一次性保存）
router.post('/admin/scene/:sceneId/batch-save', (req, res) => {
  try {
    const sceneId = req.params.sceneId;
    const { steps, prompt } = req.body;

    // 使用批量操作，最后统一保存数据库
    const stepIdMap = {}; // 用于映射前端临时ID到数据库ID

    // 1. 先删除不在列表中的步骤和选项
    if (steps && steps.length > 0) {
      // 获取要保留的步骤ID列表（只保留有真实数据库ID的）
      const keepStepIds = steps
        .filter(s => s.id && !String(s.id).startsWith('temp_') && typeof s.id === 'number')
        .map(s => s.id);

      if (keepStepIds.length > 0) {
        // 先删除被移除步骤的选项
        runBatch(`DELETE FROM step_options WHERE step_id IN (
          SELECT id FROM scene_steps WHERE scene_id = '${sceneId}' AND id NOT IN (${keepStepIds.join(',')})
        )`);
        // 再删除被移除的步骤
        runBatch(`DELETE FROM scene_steps WHERE scene_id = '${sceneId}' AND id NOT IN (${keepStepIds.join(',')})`);
      } else {
        // 如果没有保留的步骤（全是新步骤），先删除该场景所有旧步骤
        runBatch(`DELETE FROM step_options WHERE step_id IN (SELECT id FROM scene_steps WHERE scene_id = '${sceneId}')`);
        runBatch(`DELETE FROM scene_steps WHERE scene_id = '${sceneId}'`);
      }
      commitBatch();
    }

    // 2. 保存所有步骤
    if (steps && steps.length > 0) {
      console.log('[batch-save] 开始保存步骤, 步骤数:', steps.length);
      for (const step of steps) {
        // 调试：打印每个步骤的icon
        console.log(`[batch-save] 步骤: ${step.title || step.step_name}, icon: "${step.icon || ''}", gender_based: ${step.gender_based}`);

        const title = step.title || step.step_name || 'Untitled';  // 确保不为空
        const titleEn = step.title_en || step.step_name_en || 'Untitled';
        const componentType = step.component_type || step.step_type || 'select';
        const isVisible = step.is_visible !== undefined ? step.is_visible : (step.is_active !== false);
        const configStr = step.config ? JSON.stringify(step.config).replace(/'/g, "''") : '';

        if (step.id && !String(step.id).startsWith('temp_')) {
          // 更新现有步骤
          runBatch(`UPDATE scene_steps SET
            step_key = '${step.step_key || ''}',
            title = '${title}',
            title_en = '${titleEn}',
            component_type = '${componentType}',
            step_order = ${step.step_order || 0},
            is_required = ${step.is_required ? 1 : 0},
            is_visible = ${isVisible ? 1 : 0},
            icon = '${step.icon || ''}',
            gender_based = ${step.gender_based ? 1 : 0},
            config = '${configStr}'
            WHERE id = ${step.id}`);
          stepIdMap[step.id] = step.id;
        } else {
          // 插入新步骤 - 同时填充 step_name 和 title 字段以兼容数据库
          runBatch(`INSERT INTO scene_steps (scene_id, step_key, step_name, step_name_en, title, title_en, component_type, step_order, is_required, is_visible, icon, gender_based, config, created_at)
            VALUES ('${sceneId}', '${step.step_key || ''}', '${title}', '${titleEn}', '${title}', '${titleEn}', '${componentType}', ${step.step_order || 0}, ${step.is_required ? 1 : 0}, ${isVisible ? 1 : 0}, '${step.icon || ''}', ${step.gender_based ? 1 : 0}, '${configStr}', datetime('now'))`);
        }
      }

      // 提交步骤保存以获取新ID
      commitBatch();

      // 获取所有步骤的ID映射
      const savedSteps = getAll(`SELECT id, step_key, step_order FROM scene_steps WHERE scene_id = '${sceneId}' ORDER BY step_order ASC`);
      steps.forEach((step, index) => {
        if (!step.id || String(step.id).startsWith('temp_')) {
          // 新步骤，通过顺序匹配
          const matchedStep = savedSteps.find(s => s.step_order === (step.step_order || index));
          if (matchedStep) {
            stepIdMap[step.id || `temp_${index}`] = matchedStep.id;
          }
        }
      });

      // 2. 删除被移除的选项，然后保存所有选项
      for (const step of steps) {
        const realStepId = stepIdMap[step.id] || step.id;
        if (!realStepId) continue;

        // 获取要保留的选项ID列表
        const keepOptionIds = (step.options || [])
          .filter(o => o.id && !String(o.id).startsWith('temp_') && typeof o.id === 'number')
          .map(o => o.id);

        // 删除该步骤下被移除的选项
        if (keepOptionIds.length > 0) {
          runBatch(`DELETE FROM step_options WHERE step_id = ${realStepId} AND id NOT IN (${keepOptionIds.join(',')})`);
        } else {
          // 如果没有保留的选项，删除该步骤所有旧选项
          runBatch(`DELETE FROM step_options WHERE step_id = ${realStepId}`);
        }

        if (!step.options) continue;

        for (const opt of step.options) {
          const label = opt.label || opt.name || '';
          const labelEn = opt.label_en || opt.name_en || '';
          const image = opt.image || opt.image_url || '';
          const color = opt.color || opt.option_value || '';
          const promptText = (opt.prompt_text || '').replace(/'/g, "''");
          const isVisible = opt.is_visible !== undefined ? opt.is_visible : (opt.is_active !== false);

          const metadata = {};
          if (opt.width) metadata.width = opt.width;
          if (opt.height) metadata.height = opt.height;
          const metadataStr = Object.keys(metadata).length > 0 ? JSON.stringify(metadata).replace(/'/g, "''") : '';

          if (opt.id && !String(opt.id).startsWith('temp_')) {
            runBatch(`UPDATE step_options SET
              option_key = '${opt.option_key || ''}',
              label = '${label}',
              label_en = '${labelEn}',
              color = '${color}',
              image = '${image}',
              prompt_text = '${promptText}',
              sort_order = ${opt.sort_order || 0},
              is_visible = ${isVisible ? 1 : 0},
              is_default = ${opt.is_default ? 1 : 0},
              gender = ${opt.gender ? `'${opt.gender}'` : 'NULL'},
              extra_points = ${opt.extra_points || 0},
              metadata = '${metadataStr}'
              WHERE id = ${opt.id}`);
          } else {
            runBatch(`INSERT INTO step_options (step_id, option_key, label, label_en, color, image, prompt_text, sort_order, is_visible, is_default, gender, extra_points, metadata)
              VALUES (${realStepId}, '${opt.option_key || ''}', '${label}', '${labelEn}', '${color}', '${image}', '${promptText}', ${opt.sort_order || 0}, ${isVisible ? 1 : 0}, ${opt.is_default ? 1 : 0}, ${opt.gender ? `'${opt.gender}'` : 'NULL'}, ${opt.extra_points || 0}, '${metadataStr}')`);
          }
        }
      }
    }

    // 3. 保存Prompt模板
    console.log('[Prompt保存调试] 收到的prompt:', prompt ? JSON.stringify(prompt).substring(0, 300) : 'null');
    if (prompt && prompt.template) {
      const templateContent = prompt.template.replace(/'/g, "''");
      const templateName = (prompt.name || prompt.template_name || '').replace(/'/g, "''");
      const negativePrompt = (prompt.negative_prompt || '').replace(/'/g, "''");
      console.log('[Prompt保存调试] 准备保存 - sceneId:', sceneId, ', template长度:', templateContent.length);
      const existing = getOne(`SELECT id FROM prompt_templates WHERE scene_id = '${sceneId}'`);
      if (existing) {
        console.log('[Prompt保存调试] 更新已有记录, id:', existing.id);
        runBatch(`UPDATE prompt_templates SET template = '${templateContent}', name = '${templateName}', negative_prompt = '${negativePrompt}', updated_at = datetime('now') WHERE scene_id = '${sceneId}'`);
      } else {
        console.log('[Prompt保存调试] 插入新记录');
        runBatch(`INSERT INTO prompt_templates (scene_id, name, template, negative_prompt) VALUES ('${sceneId}', '${templateName}', '${templateContent}', '${negativePrompt}')`);
      }
    } else {
      console.log('[Prompt保存调试] prompt为空或template为空，跳过保存');
    }

    // 4. 一次性提交所有更改
    commitBatch();

    // 5. 更新配置版本号
    updateConfigVersion();

    res.json({ code: 200, message: '批量保存成功' });
  } catch (error) {
    console.error('批量保存失败:', error);
    res.json({ code: 500, message: '批量保存失败: ' + error.message });
  }
});

// 初始化/重置默认场景数据
router.post('/admin/scenes/init', (req, res) => {
  try {
    const CDN_BASE = 'https://xingmeishantu-1310044729.cos.ap-shanghai.myqcloud.com';
    const IMG_VERSION = 'v7';

    const defaultScenes = [
      {
        key: 'id_photo',
        name: '证件照',
        name_en: 'ID Photo',
        desc: 'AI智能证件照，一键生成',
        desc_en: 'AI-powered ID photo generation',
        icon: `${CDN_BASE}/id-photo.png?${IMG_VERSION}`,
        price: 50,
        status: 'active',
        is_review_safe: 1,
        page_path: '/pages/flashphoto/flashphoto',
        sort: 0
      },
      {
        key: 'professional',
        name: '职业照',
        name_en: 'Professional Photo',
        desc: '职场形象照，展现专业风采',
        desc_en: 'Professional headshots for career',
        icon: `${CDN_BASE}/professional.png?${IMG_VERSION}`,
        price: 100,
        status: 'active',
        is_review_safe: 1,
        page_path: '/pages/professional-photo/professional-photo',
        sort: 1
      },
      {
        key: 'resume',
        name: '简历照',
        name_en: 'Resume Photo',
        desc: '求职简历专用，让HR眼前一亮',
        desc_en: 'Perfect for job applications',
        icon: `${CDN_BASE}/id-photo.png?${IMG_VERSION}`,
        price: 50,
        status: 'coming_soon',
        is_review_safe: 1,
        coming_soon_text: '即将上线',
        sort: 2
      },
      {
        key: 'social',
        name: '社交头像',
        name_en: 'Social Avatar',
        desc: '朋友圈/社交平台形象照',
        desc_en: 'Perfect for social media profiles',
        icon: `${CDN_BASE}/portrait.png?${IMG_VERSION}`,
        price: 80,
        status: 'coming_soon',
        is_review_safe: 0,
        coming_soon_text: '敬请期待',
        sort: 3
      },
      {
        key: 'passport',
        name: '护照签证照',
        name_en: 'Passport Photo',
        desc: '符合各国签证规格要求',
        desc_en: 'Meets visa requirements',
        icon: `${CDN_BASE}/id-photo.png?${IMG_VERSION}`,
        price: 50,
        status: 'offline',
        is_review_safe: 1,
        sort: 4
      },
      {
        key: 'student',
        name: '学生证件照',
        name_en: 'Student ID Photo',
        desc: '学生证/校园卡专用',
        desc_en: 'For student ID cards',
        icon: `${CDN_BASE}/id-photo.png?${IMG_VERSION}`,
        price: 30,
        status: 'offline',
        is_review_safe: 1,
        sort: 5
      }
    ];

    let insertedCount = 0;
    let updatedCount = 0;

    defaultScenes.forEach(scene => {
      // 检查场景是否已存在
      const existing = getOne(`SELECT id FROM scenes WHERE scene_key = '${scene.key}'`);
      if (existing) {
        // 更新已存在的场景
        run(`UPDATE scenes SET
          name = '${scene.name}',
          name_en = '${scene.name_en}',
          description = '${scene.desc}',
          description_en = '${scene.desc_en}',
          icon = '${scene.icon}',
          price = ${scene.price},
          status = '${scene.status}',
          is_review_safe = ${scene.is_review_safe},
          page_path = '${scene.page_path || ''}',
          coming_soon_text = '${scene.coming_soon_text || ''}',
          sort_order = ${scene.sort},
          updated_at = datetime('now')
          WHERE scene_key = '${scene.key}'`);
        updatedCount++;
      } else {
        // 插入新场景
        run(`INSERT INTO scenes (scene_key, name, name_en, description, description_en, icon, price, status, is_review_safe, page_path, coming_soon_text, sort_order)
          VALUES ('${scene.key}', '${scene.name}', '${scene.name_en}', '${scene.desc}', '${scene.desc_en}', '${scene.icon}', ${scene.price}, '${scene.status}', ${scene.is_review_safe}, '${scene.page_path || ''}', '${scene.coming_soon_text || ''}', ${scene.sort})`);
        insertedCount++;
      }
    });

    updateConfigVersion();
    console.log(`[Config] 场景初始化完成: 新增 ${insertedCount} 个, 更新 ${updatedCount} 个`);
    res.json({
      code: 200,
      message: `初始化完成: 新增 ${insertedCount} 个场景, 更新 ${updatedCount} 个场景`,
      data: { inserted: insertedCount, updated: updatedCount }
    });
  } catch (error) {
    console.error('初始化场景失败:', error);
    res.json({ code: 500, message: '初始化失败: ' + error.message });
  }
});

// 辅助函数：更新配置版本号
function updateConfigVersion() {
  const newVersion = `${Date.now()}`;
  try {
    const existing = getOne("SELECT id FROM system_config WHERE config_key = 'config_version'");
    if (existing) {
      run(`UPDATE system_config SET config_value = '${newVersion}', updated_at = datetime('now') WHERE config_key = 'config_version'`);
    } else {
      run(`INSERT INTO system_config (config_key, config_value, config_type) VALUES ('config_version', '${newVersion}', 'string')`);
    }
  } catch (e) {
    console.error('更新版本号失败:', e);
  }
}

// ========== 翻译修复接口 ==========

// 完整的翻译映射表
const translations = {
  // ========== 步骤标题 ==========
  '上传照片': { en: 'Upload Photo', tw: '上傳照片' },
  '选择性别': { en: 'Select Gender', tw: '選擇性別' },
  '选择规格': { en: 'Select Size', tw: '選擇規格' },
  '选择背景': { en: 'Select Background', tw: '選擇背景' },
  '美颜级别': { en: 'Beauty Level', tw: '美顏級別' },
  '选择穿着': { en: 'Select Outfit', tw: '選擇穿著' },
  '选择发型': { en: 'Select Hairstyle', tw: '選擇髮型' },
  '选择表情': { en: 'Select Expression', tw: '選擇表情' },
  '背景颜色': { en: 'Background Color', tw: '背景顏色' },
  '智能换装': { en: 'Smart Outfit', tw: '智能換裝' },
  '照片规格': { en: 'Photo Size', tw: '照片規格' },
  '选择行业': { en: 'Select Industry', tw: '選擇行業' },
  '选择职业': { en: 'Select Profession', tw: '選擇職業' },
  '构图': { en: 'Framing', tw: '構圖' },
  '选择构图': { en: 'Select Framing', tw: '選擇構圖' },
  '美颜修饰': { en: 'Beauty', tw: '美顏修飾' },

  // ========== 性别 ==========
  '男': { en: 'Male', tw: '男' },
  '女': { en: 'Female', tw: '女' },
  '男士': { en: 'Male', tw: '男士' },
  '女士': { en: 'Female', tw: '女士' },

  // ========== 规格 ==========
  '一寸': { en: '1 inch', tw: '一寸' },
  '二寸': { en: '2 inch', tw: '二寸' },
  '小一寸': { en: 'Small 1"', tw: '小一寸' },
  '大一寸': { en: 'Large 1"', tw: '大一寸' },
  '小二寸': { en: 'Small 2"', tw: '小二寸' },
  '大二寸': { en: 'Large 2"', tw: '大二寸' },

  // ========== 背景颜色 ==========
  '白色': { en: 'White', tw: '白色' },
  '蓝色': { en: 'Blue', tw: '藍色' },
  '深蓝': { en: 'Dark Blue', tw: '深藍' },
  '深蓝色': { en: 'Dark Blue', tw: '深藍色' },
  '红色': { en: 'Red', tw: '紅色' },
  '灰色': { en: 'Gray', tw: '灰色' },
  '渐变蓝': { en: 'Gradient Blue', tw: '漸變藍' },
  '深灰': { en: 'Dark Gray', tw: '深灰' },
  '深灰色': { en: 'Dark Gray', tw: '深灰色' },
  '米色': { en: 'Beige', tw: '米色' },
  '浅绿': { en: 'Light Green', tw: '淺綠' },
  '浅绿色': { en: 'Light Green', tw: '淺綠色' },
  '棕褐': { en: 'Brown', tw: '棕褐' },
  '棕褐色': { en: 'Brown', tw: '棕褐色' },
  '白底': { en: 'White', tw: '白底' },
  '蓝底': { en: 'Blue', tw: '藍底' },
  '红底': { en: 'Red', tw: '紅底' },
  '灰底': { en: 'Gray', tw: '灰底' },
  '渐变': { en: 'Gradient', tw: '漸變' },

  // ========== 美颜级别 ==========
  '原图': { en: 'Original', tw: '原圖' },
  '自然': { en: 'Natural', tw: '自然' },
  '精致': { en: 'Enhanced', tw: '精緻' },
  '原图直出': { en: 'Original', tw: '原圖直出' },
  '自然美化': { en: 'Natural', tw: '自然美化' },
  '精致修图': { en: 'Enhanced', tw: '精緻修圖' },

  // ========== 服装 ==========
  '白衬衫': { en: 'White Shirt', tw: '白襯衫' },
  '蓝衬衫': { en: 'Blue Shirt', tw: '藍襯衫' },
  '浅蓝衬衫': { en: 'Light Blue Shirt', tw: '淺藍襯衫' },
  '深蓝衬衫': { en: 'Dark Blue Shirt', tw: '深藍襯衫' },
  '深灰衬衫': { en: 'Dark Gray Shirt', tw: '深灰襯衫' },
  '黑衬衫': { en: 'Black Shirt', tw: '黑襯衫' },
  '蓝西装': { en: 'Blue Suit', tw: '藍西裝' },
  '黑西装': { en: 'Black Suit', tw: '黑西裝' },
  '灰西装': { en: 'Gray Suit', tw: '灰西裝' },
  '深蓝西装': { en: 'Dark Blue Suit', tw: '深藍西裝' },
  '不换装': { en: 'No Change', tw: '不換裝' },
  '西装领带': { en: 'Suit & Tie', tw: '西裝領帶' },
  '西装': { en: 'Suit', tw: '西裝' },
  'V领': { en: 'V-Neck', tw: 'V領' },
  '圆领': { en: 'Round Neck', tw: '圓領' },
  '衬衫': { en: 'Shirt', tw: '襯衫' },
  '白衬衣': { en: 'White Shirt', tw: '白襯衣' },
  '蓝衬衣': { en: 'Blue Shirt', tw: '藍襯衣' },
  '黑衬衣': { en: 'Black Shirt', tw: '黑襯衣' },

  // ========== 发型 ==========
  '原发型': { en: 'Original', tw: '原髮型' },
  '短发': { en: 'Short Hair', tw: '短髮' },
  '长发': { en: 'Long Hair', tw: '長髮' },
  '马尾': { en: 'Ponytail', tw: '馬尾' },
  '披肩发': { en: 'Shoulder Length', tw: '披肩髮' },
  '盘发': { en: 'Updo', tw: '盤髮' },
  '寸头': { en: 'Buzz Cut', tw: '寸頭' },
  '偏分': { en: 'Side Part', tw: '偏分' },
  '侧分': { en: 'Side Part', tw: '側分' },
  '短碎发': { en: 'Short Textured', tw: '短碎髮' },
  '短发碎': { en: 'Short Textured', tw: '短髮碎' },
  '中分': { en: 'Center Part', tw: '中分' },
  '自然卷': { en: 'Natural Curl', tw: '自然捲' },
  '直发': { en: 'Straight Hair', tw: '直髮' },
  '卷发': { en: 'Curly Hair', tw: '捲髮' },
  '波浪': { en: 'Wavy', tw: '波浪' },

  // ========== 表情 ==========
  '不露齿': { en: 'Closed Smile', tw: '不露齒' },
  '不露齿微笑': { en: 'Closed Smile', tw: '不露齒微笑' },
  '轻微微笑': { en: 'Slight Smile', tw: '輕微微笑' },
  '大露齿笑': { en: 'Big Smile', tw: '大露齒笑' },
  '露齿笑': { en: 'Toothy Smile', tw: '露齒笑' },
  '微笑': { en: 'Smile', tw: '微笑' },
  '正式': { en: 'Formal', tw: '正式' },
  '严肃': { en: 'Serious', tw: '嚴肅' },
  '亲和': { en: 'Friendly', tw: '親和' },
  '开心': { en: 'Happy', tw: '開心' },

  // ========== 构图 ==========
  '头肩特写': { en: 'Close-up', tw: '頭肩特寫' },
  '标准半身': { en: 'Half Body', tw: '標準半身' },
  '四分三身': { en: '3/4 Body', tw: '四分三身' },
  '全身照': { en: 'Full Body', tw: '全身照' },

  // ========== 行业 ==========
  '科技互联网': { en: 'Tech & IT', tw: '科技互聯網' },
  '金融投资': { en: 'Finance', tw: '金融投資' },
  '教育培训': { en: 'Education', tw: '教育培訓' },
  '医疗健康': { en: 'Medical', tw: '醫療健康' },
  '创意设计': { en: 'Creative', tw: '創意設計' },
  '法律服务': { en: 'Legal Services', tw: '法律服務' },
  '市场营销': { en: 'Marketing', tw: '市場營銷' },
  '媒体传播': { en: 'Media', tw: '媒體傳播' },
  '行政管理': { en: 'Administration', tw: '行政管理' },
  '其他行业': { en: 'Other', tw: '其他行業' },

  // ========== 职业 ==========
  '软件工程师': { en: 'Software Engineer', tw: '軟件工程師' },
  '产品经理': { en: 'Product Manager', tw: '產品經理' },
  'UI设计师': { en: 'UI Designer', tw: 'UI設計師' },
  '数据分析师': { en: 'Data Analyst', tw: '數據分析師' },
  '项目经理': { en: 'Project Manager', tw: '項目經理' },
  '银行从业者': { en: 'Banker', tw: '銀行從業者' },
  '投资顾问': { en: 'Investment Advisor', tw: '投資顧問' },
  '会计师': { en: 'Accountant', tw: '會計師' },
  '保险顾问': { en: 'Insurance Advisor', tw: '保險顧問' },
  '证券从业者': { en: 'Securities Professional', tw: '證券從業者' },
  '教师': { en: 'Teacher', tw: '教師' },
  '教授': { en: 'Professor', tw: '教授' },
  '培训师': { en: 'Corporate Trainer', tw: '培訓師' },
  '教育咨询师': { en: 'Education Counselor', tw: '教育諮詢師' },
  '医生': { en: 'Doctor', tw: '醫生' },
  '护士': { en: 'Nurse', tw: '護士' },
  '药剂师': { en: 'Pharmacist', tw: '藥劑師' },
  '康复治疗师': { en: 'Therapist', tw: '康復治療師' },
  '律师': { en: 'Lawyer', tw: '律師' },
  '法务顾问': { en: 'Legal Consultant', tw: '法務顧問' },
  '公证员': { en: 'Notary', tw: '公證員' },
  '市场经理': { en: 'Marketing Manager', tw: '市場經理' },
  '销售经理': { en: 'Sales Manager', tw: '銷售經理' },
  '品牌策划': { en: 'Brand Planner', tw: '品牌策劃' },
  '公关专员': { en: 'PR Specialist', tw: '公關專員' },
  '记者': { en: 'Journalist', tw: '記者' },
  '编辑': { en: 'Editor', tw: '編輯' },
  '主持人': { en: 'Host', tw: '主持人' },
  '视频制作人': { en: 'Video Producer', tw: '視頻製作人' },
  '人力资源经理': { en: 'HR Manager', tw: '人力資源經理' },
  '行政经理': { en: 'Admin Manager', tw: '行政經理' },
  '企业高管': { en: 'Executive', tw: '企業高管' },
  '秘书助理': { en: 'Secretary', tw: '秘書助理' },
  '创业者': { en: 'Entrepreneur', tw: '創業者' },
  '自由职业者': { en: 'Freelancer', tw: '自由職業者' },
  '咨询顾问': { en: 'Consultant', tw: '諮詢顧問' },
  '职场人士': { en: 'Professional', tw: '職場人士' },
  '其他': { en: 'Other', tw: '其他' },
};

// SQL转义函数
function escapeSQL(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/'/g, "''");
}

// 批量修复翻译接口
router.post('/admin/fix-translations', (req, res) => {
  try {
    console.log('开始修复所有翻译...\n');

    let updatedSteps = 0;
    let updatedOptions = 0;
    const notFoundItems = [];

    // 1. 更新 scene_steps 表
    const steps = getAll("SELECT id, step_key, title, title_en FROM scene_steps");
    for (const step of steps) {
      const searchKey = step.title;
      if (!searchKey) continue;

      const trans = translations[searchKey];
      if (trans) {
        run(`UPDATE scene_steps SET
          title_en = '${escapeSQL(trans.en)}'
          WHERE id = ${step.id}`);
        updatedSteps++;
      } else {
        if (!notFoundItems.includes(searchKey)) {
          notFoundItems.push(searchKey);
        }
      }
    }

    // 2. 更新 step_options 表
    const options = getAll("SELECT id, option_key, label, label_en, name, name_en FROM step_options");
    for (const opt of options) {
      const searchKey = opt.label || opt.name;
      if (!searchKey) continue;

      const trans = translations[searchKey];
      if (trans) {
        run(`UPDATE step_options SET
          label_en = '${escapeSQL(trans.en)}',
          name_en = '${escapeSQL(trans.en)}'
          WHERE id = ${opt.id}`);
        updatedOptions++;
      } else {
        if (!notFoundItems.includes(searchKey)) {
          notFoundItems.push(searchKey);
        }
      }
    }

    // 更新配置版本号
    updateConfigVersion();

    console.log(`翻译修复完成: 步骤 ${updatedSteps} 个, 选项 ${updatedOptions} 个`);
    if (notFoundItems.length > 0) {
      console.log('未找到翻译的项目:', notFoundItems.join(', '));
    }

    res.json({
      code: 200,
      message: `翻译修复完成`,
      data: {
        updatedSteps,
        updatedOptions,
        notFoundItems
      }
    });
  } catch (error) {
    console.error('修复翻译失败:', error);
    res.json({ code: 500, message: '修复翻译失败: ' + error.message });
  }
});

// 获取翻译映射表（供前端参考）
router.get('/admin/translations', (req, res) => {
  res.json({ code: 200, data: translations });
});

module.exports = router;
