/**
 * 硬编码场景配置
 * 垂类专精模式：证件照、职业照等核心场景
 * 启动时自动初始化到数据库
 */

const HARDCODED_SCENES = [
  {
    id: 1,
    scene_key: 'idphoto',
    name: '证件照',
    name_en: 'ID Photo',
    description: '专业证件照生成',
    description_en: 'Professional ID photo generation',
    icon: 'https://pop-pub.com/images/icon-id-card.svg',
    cover_image: 'https://pop-pub.com/images/cover-idphoto.jpg',
    points_cost: 50,
    status: 'active',
    is_review_safe: 1,
    sort_order: 1,
    steps: [
      {
        step_key: 'upload',
        step_name: '上传照片',
        step_name_en: 'Upload Photo',
        title: '上传照片',
        title_en: 'Upload Photo',
        component_type: 'image_upload',
        step_order: 1,
        is_required: 1,
        is_visible: 1
      },
      {
        step_key: 'gender',
        step_name: '性别',
        step_name_en: 'Gender',
        title: '选择性别',
        title_en: 'Select Gender',
        component_type: 'gender_select',
        step_order: 2,
        is_required: 1,
        is_visible: 1,
        options: [
          { option_key: 'male', name: '男', name_en: 'Male', is_default: 0 },
          { option_key: 'female', name: '女', name_en: 'Female', is_default: 0 }
        ]
      },
      {
        step_key: 'spec',
        step_name: '规格',
        step_name_en: 'Specification',
        title: '选择规格',
        title_en: 'Select Specification',
        component_type: 'spec_select',
        step_order: 3,
        is_required: 1,
        is_visible: 1,
        options: [
          { option_key: 'one_inch', name: '一寸', name_en: '1 inch', is_default: 1 },
          { option_key: 'two_inch', name: '二寸', name_en: '2 inch', is_default: 0 },
          { option_key: 'passport', name: '护照', name_en: 'Passport', is_default: 0 },
          { option_key: 'visa', name: '签证', name_en: 'Visa', is_default: 0 }
        ]
      },
      {
        step_key: 'background',
        step_name: '背景',
        step_name_en: 'Background',
        title: '选择背景',
        title_en: 'Select Background',
        component_type: 'color_picker',
        step_order: 4,
        is_required: 1,
        is_visible: 1,
        options: [
          { option_key: 'white', name: '白色', name_en: 'White', color: '#ffffff', is_default: 1 },
          { option_key: 'blue', name: '蓝色', name_en: 'Blue', color: '#0066cc', is_default: 0 },
          { option_key: 'red', name: '红色', name_en: 'Red', color: '#cc0000', is_default: 0 }
        ]
      }
    ],
    prompt: '专业证件照，{{gender}}性，{{spec}}规格，{{background}}背景，清晰面部，正面照，专业打光'
  },
  {
    id: 2,
    scene_key: 'professional',
    name: '职业照',
    name_en: 'Professional Photo',
    description: '职业形象照生成',
    description_en: 'Professional headshot generation',
    icon: 'https://pop-pub.com/images/icon-driver.svg',
    cover_image: 'https://pop-pub.com/images/cover-professional.jpg',
    points_cost: 60,
    status: 'active',
    is_review_safe: 1,
    sort_order: 2,
    steps: [
      {
        step_key: 'upload',
        step_name: '上传照片',
        step_name_en: 'Upload Photo',
        title: '上传照片',
        title_en: 'Upload Photo',
        component_type: 'image_upload',
        step_order: 1,
        is_required: 1,
        is_visible: 1
      },
      {
        step_key: 'gender',
        step_name: '性别',
        step_name_en: 'Gender',
        title: '选择性别',
        title_en: 'Select Gender',
        component_type: 'gender_select',
        step_order: 2,
        is_required: 1,
        is_visible: 1,
        options: [
          { option_key: 'male', name: '男', name_en: 'Male', is_default: 0 },
          { option_key: 'female', name: '女', name_en: 'Female', is_default: 0 }
        ]
      },
      {
        step_key: 'style',
        step_name: '风格',
        step_name_en: 'Style',
        title: '选择风格',
        title_en: 'Select Style',
        component_type: 'radio',
        step_order: 3,
        is_required: 1,
        is_visible: 1,
        options: [
          { option_key: 'formal', name: '正式', name_en: 'Formal', is_default: 1 },
          { option_key: 'casual', name: '休闲', name_en: 'Casual', is_default: 0 },
          { option_key: 'creative', name: '创意', name_en: 'Creative', is_default: 0 }
        ]
      },
      {
        step_key: 'background',
        step_name: '背景',
        step_name_en: 'Background',
        title: '选择背景',
        title_en: 'Select Background',
        component_type: 'color_picker',
        step_order: 4,
        is_required: 1,
        is_visible: 1,
        options: [
          { option_key: 'white', name: '白色', name_en: 'White', color: '#ffffff', is_default: 1 },
          { option_key: 'gray', name: '灰色', name_en: 'Gray', color: '#cccccc', is_default: 0 },
          { option_key: 'blue', name: '蓝色', name_en: 'Blue', color: '#0066cc', is_default: 0 }
        ]
      }
    ],
    prompt: '职业形象照，{{gender}}性，{{style}}风格，{{background}}背景，专业打光，清晰面部，商务气质'
  }
];

/**
 * 初始化硬编码场景到数据库
 */
function initHardcodedScenes(db) {
  try {
    // 检查是否已初始化
    const existingCount = db.prepare('SELECT COUNT(*) as count FROM scenes').get().count;
    if (existingCount > 0) {
      console.log('[Scenes] 场景已初始化，跳过硬编码初始化');
      return;
    }

    console.log('[Scenes] 开始初始化硬编码场景...');

    HARDCODED_SCENES.forEach(scene => {
      // 插入场景
      const sceneResult = db.prepare(`
        INSERT INTO scenes (
          scene_key, name, name_en, description, description_en,
          icon, cover_image, points_cost, status, is_review_safe, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        scene.scene_key, scene.name, scene.name_en, scene.description, scene.description_en,
        scene.icon, scene.cover_image, scene.points_cost, scene.status, scene.is_review_safe, scene.sort_order
      );

      const sceneId = sceneResult.lastInsertRowid;

      // 插入步骤和选项
      scene.steps.forEach(step => {
        const stepResult = db.prepare(`
          INSERT INTO scene_steps (
            scene_id, step_key, step_name, step_name_en, title, title_en,
            component_type, step_order, is_required, is_visible
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sceneId, step.step_key, step.step_name, step.step_name_en, step.title, step.title_en,
          step.component_type, step.step_order, step.is_required, step.is_visible
        );

        const stepId = stepResult.lastInsertRowid;

        // 插入选项
        if (step.options && step.options.length > 0) {
          step.options.forEach((option, index) => {
            db.prepare(`
              INSERT INTO step_options (
                step_id, option_key, name, name_en, color, is_default, sort_order
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              stepId, option.option_key, option.name, option.name_en,
              option.color || null, option.is_default || 0, index
            );
          });
        }
      });

      // 插入 Prompt 模板
      db.prepare(`
        INSERT INTO prompt_templates (
          scene_id, template_name, template_content, is_active
        ) VALUES (?, ?, ?, ?)
      `).run(
        sceneId, `${scene.name}_prompt`, scene.prompt, 1
      );

      console.log(`[Scenes] 已初始化场景: ${scene.name}`);
    });

    console.log('[Scenes] 硬编码场景初始化完成');
  } catch (error) {
    console.error('[Scenes] 初始化硬编码场景失败:', error);
    throw error;
  }
}

module.exports = {
  HARDCODED_SCENES,
  initHardcodedScenes
};
