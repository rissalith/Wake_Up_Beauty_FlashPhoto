/**
 * 马年新春头像场景初始数据脚本
 * 包含：场景配置、场景步骤、100个吉祥成语、4个马品级、Prompt模板
 *
 * 运行方式: node scripts/init-horse-year-scene.js
 */
const Database = require('better-sqlite3');
const path = require('path');

// 数据库路径
const DB_PATH = process.env.SHARED_DB_PATH || process.env.DB_PATH || path.join(__dirname, '../core-api/data/flashphoto.db');

console.log('数据库路径:', DB_PATH);

const db = new Database(DB_PATH);

// 场景ID
const SCENE_ID = 'horse_year_avatar';

// 100个吉祥成语数据
const phrases = [
  // 马相关成语 (20个)
  { phrase: '马到成功', phrase_en: 'Instant Success', rarity: 'epic', weight: 80 },
  { phrase: '龙马精神', phrase_en: 'Vigorous Spirit', rarity: 'legendary', weight: 50 },
  { phrase: '一马当先', phrase_en: 'Take the Lead', rarity: 'rare', weight: 90 },
  { phrase: '万马奔腾', phrase_en: 'Galloping Horses', rarity: 'epic', weight: 80 },
  { phrase: '快马加鞭', phrase_en: 'Full Speed Ahead', rarity: 'common', weight: 100 },
  { phrase: '马不停蹄', phrase_en: 'Non-stop Progress', rarity: 'common', weight: 100 },
  { phrase: '千军万马', phrase_en: 'Mighty Forces', rarity: 'rare', weight: 90 },
  { phrase: '老马识途', phrase_en: 'Experienced Guide', rarity: 'common', weight: 100 },
  { phrase: '天马行空', phrase_en: 'Unbounded Creativity', rarity: 'epic', weight: 80 },
  { phrase: '汗马功劳', phrase_en: 'Great Contributions', rarity: 'rare', weight: 90 },
  { phrase: '马踏飞燕', phrase_en: 'Flying Horse', rarity: 'legendary', weight: 50 },
  { phrase: '骏马奔驰', phrase_en: 'Galloping Steed', rarity: 'common', weight: 100 },
  { phrase: '宝马良驹', phrase_en: 'Fine Horse', rarity: 'rare', weight: 90 },
  { phrase: '策马扬鞭', phrase_en: 'Ride Forward', rarity: 'common', weight: 100 },
  { phrase: '马首是瞻', phrase_en: 'Follow the Leader', rarity: 'common', weight: 100 },
  { phrase: '金戈铁马', phrase_en: 'Valiant Warriors', rarity: 'epic', weight: 80 },
  { phrase: '驷马难追', phrase_en: 'Words of Honor', rarity: 'rare', weight: 90 },
  { phrase: '走马观花', phrase_en: 'Quick Glance', rarity: 'common', weight: 100 },
  { phrase: '人强马壮', phrase_en: 'Strong and Mighty', rarity: 'common', weight: 100 },
  { phrase: '马上封侯', phrase_en: 'Instant Promotion', rarity: 'legendary', weight: 50 },

  // 新春祝福成语 (40个)
  { phrase: '新春快乐', phrase_en: 'Happy New Year', rarity: 'common', weight: 100 },
  { phrase: '恭喜发财', phrase_en: 'Prosperity', rarity: 'common', weight: 100 },
  { phrase: '万事如意', phrase_en: 'All the Best', rarity: 'common', weight: 100 },
  { phrase: '心想事成', phrase_en: 'Dreams Come True', rarity: 'common', weight: 100 },
  { phrase: '吉祥如意', phrase_en: 'Good Fortune', rarity: 'common', weight: 100 },
  { phrase: '福星高照', phrase_en: 'Lucky Star', rarity: 'rare', weight: 90 },
  { phrase: '财源广进', phrase_en: 'Wealth Flows In', rarity: 'rare', weight: 90 },
  { phrase: '步步高升', phrase_en: 'Rising Higher', rarity: 'common', weight: 100 },
  { phrase: '大吉大利', phrase_en: 'Great Luck', rarity: 'common', weight: 100 },
  { phrase: '年年有余', phrase_en: 'Abundance', rarity: 'common', weight: 100 },
  { phrase: '花开富贵', phrase_en: 'Blooming Wealth', rarity: 'rare', weight: 90 },
  { phrase: '金玉满堂', phrase_en: 'Treasures Abound', rarity: 'epic', weight: 80 },
  { phrase: '招财进宝', phrase_en: 'Attract Wealth', rarity: 'rare', weight: 90 },
  { phrase: '五福临门', phrase_en: 'Five Blessings', rarity: 'epic', weight: 80 },
  { phrase: '喜气洋洋', phrase_en: 'Full of Joy', rarity: 'common', weight: 100 },
  { phrase: '欢天喜地', phrase_en: 'Jubilant', rarity: 'common', weight: 100 },
  { phrase: '阖家欢乐', phrase_en: 'Family Joy', rarity: 'common', weight: 100 },
  { phrase: '幸福美满', phrase_en: 'Happiness', rarity: 'common', weight: 100 },
  { phrase: '平安喜乐', phrase_en: 'Peace and Joy', rarity: 'common', weight: 100 },
  { phrase: '福寿安康', phrase_en: 'Health Wealth', rarity: 'rare', weight: 90 },
  { phrase: '鸿运当头', phrase_en: 'Great Fortune', rarity: 'epic', weight: 80 },
  { phrase: '紫气东来', phrase_en: 'Purple Aura', rarity: 'legendary', weight: 50 },
  { phrase: '吉星高照', phrase_en: 'Lucky Stars', rarity: 'rare', weight: 90 },
  { phrase: '瑞雪兆丰', phrase_en: 'Auspicious Snow', rarity: 'common', weight: 100 },
  { phrase: '春风得意', phrase_en: 'Spring Breeze', rarity: 'common', weight: 100 },
  { phrase: '春暖花开', phrase_en: 'Spring Blooms', rarity: 'common', weight: 100 },
  { phrase: '春回大地', phrase_en: 'Spring Returns', rarity: 'common', weight: 100 },
  { phrase: '迎春接福', phrase_en: 'Welcome Spring', rarity: 'common', weight: 100 },
  { phrase: '辞旧迎新', phrase_en: 'Out Old In New', rarity: 'common', weight: 100 },
  { phrase: '开门大吉', phrase_en: 'Great Opening', rarity: 'common', weight: 100 },
  { phrase: '开门见喜', phrase_en: 'See Joy First', rarity: 'common', weight: 100 },
  { phrase: '喜从天降', phrase_en: 'Joy from Heaven', rarity: 'rare', weight: 90 },
  { phrase: '双喜临门', phrase_en: 'Double Happiness', rarity: 'epic', weight: 80 },
  { phrase: '三阳开泰', phrase_en: 'Triple Yang', rarity: 'epic', weight: 80 },
  { phrase: '四季平安', phrase_en: 'Four Seasons', rarity: 'common', weight: 100 },
  { phrase: '六六大顺', phrase_en: 'Smooth Sailing', rarity: 'rare', weight: 90 },
  { phrase: '八方来财', phrase_en: 'Wealth from All', rarity: 'rare', weight: 90 },
  { phrase: '十全十美', phrase_en: 'Perfection', rarity: 'epic', weight: 80 },
  { phrase: '百事亨通', phrase_en: 'All Goes Well', rarity: 'rare', weight: 90 },
  { phrase: '千祥云集', phrase_en: 'Auspicious Clouds', rarity: 'epic', weight: 80 },

  // 事业学业成语 (20个)
  { phrase: '前程似锦', phrase_en: 'Bright Future', rarity: 'rare', weight: 90 },
  { phrase: '鹏程万里', phrase_en: 'Soaring High', rarity: 'epic', weight: 80 },
  { phrase: '飞黄腾达', phrase_en: 'Rise to Fame', rarity: 'rare', weight: 90 },
  { phrase: '事业有成', phrase_en: 'Career Success', rarity: 'common', weight: 100 },
  { phrase: '学业进步', phrase_en: 'Academic Progress', rarity: 'common', weight: 100 },
  { phrase: '金榜题名', phrase_en: 'Top Scholar', rarity: 'epic', weight: 80 },
  { phrase: '独占鳌头', phrase_en: 'Number One', rarity: 'legendary', weight: 50 },
  { phrase: '出类拔萃', phrase_en: 'Outstanding', rarity: 'rare', weight: 90 },
  { phrase: '才高八斗', phrase_en: 'Great Talent', rarity: 'rare', weight: 90 },
  { phrase: '学富五车', phrase_en: 'Learned Scholar', rarity: 'rare', weight: 90 },
  { phrase: '功成名就', phrase_en: 'Fame and Success', rarity: 'epic', weight: 80 },
  { phrase: '名利双收', phrase_en: 'Fame and Wealth', rarity: 'rare', weight: 90 },
  { phrase: '蒸蒸日上', phrase_en: 'Rising Daily', rarity: 'common', weight: 100 },
  { phrase: '日新月异', phrase_en: 'Ever Improving', rarity: 'common', weight: 100 },
  { phrase: '百尺竿头', phrase_en: 'Keep Advancing', rarity: 'common', weight: 100 },
  { phrase: '更上层楼', phrase_en: 'Reach Higher', rarity: 'common', weight: 100 },
  { phrase: '锦上添花', phrase_en: 'Icing on Cake', rarity: 'common', weight: 100 },
  { phrase: '如虎添翼', phrase_en: 'Wings to Tiger', rarity: 'rare', weight: 90 },
  { phrase: '一帆风顺', phrase_en: 'Smooth Sailing', rarity: 'common', weight: 100 },
  { phrase: '顺风顺水', phrase_en: 'All Smooth', rarity: 'common', weight: 100 },

  // 健康长寿成语 (20个)
  { phrase: '身体健康', phrase_en: 'Good Health', rarity: 'common', weight: 100 },
  { phrase: '龙精虎猛', phrase_en: 'Full of Energy', rarity: 'rare', weight: 90 },
  { phrase: '生龙活虎', phrase_en: 'Lively Spirit', rarity: 'common', weight: 100 },
  { phrase: '精神焕发', phrase_en: 'Radiant Spirit', rarity: 'common', weight: 100 },
  { phrase: '容光焕发', phrase_en: 'Glowing Face', rarity: 'common', weight: 100 },
  { phrase: '青春永驻', phrase_en: 'Eternal Youth', rarity: 'rare', weight: 90 },
  { phrase: '返老还童', phrase_en: 'Rejuvenation', rarity: 'epic', weight: 80 },
  { phrase: '长命百岁', phrase_en: 'Long Life', rarity: 'rare', weight: 90 },
  { phrase: '寿比南山', phrase_en: 'Longevity', rarity: 'epic', weight: 80 },
  { phrase: '福如东海', phrase_en: 'Boundless Fortune', rarity: 'epic', weight: 80 },
  { phrase: '松鹤延年', phrase_en: 'Long Life', rarity: 'rare', weight: 90 },
  { phrase: '益寿延年', phrase_en: 'Extended Life', rarity: 'rare', weight: 90 },
  { phrase: '健步如飞', phrase_en: 'Swift Steps', rarity: 'common', weight: 100 },
  { phrase: '神采奕奕', phrase_en: 'Spirited Look', rarity: 'common', weight: 100 },
  { phrase: '精力充沛', phrase_en: 'Full of Energy', rarity: 'common', weight: 100 },
  { phrase: '身强体壮', phrase_en: 'Strong Body', rarity: 'common', weight: 100 },
  { phrase: '百病不侵', phrase_en: 'Disease Free', rarity: 'rare', weight: 90 },
  { phrase: '无病无灾', phrase_en: 'No Illness', rarity: 'common', weight: 100 },
  { phrase: '平平安安', phrase_en: 'Safe and Sound', rarity: 'common', weight: 100 },
  { phrase: '健健康康', phrase_en: 'Healthy', rarity: 'common', weight: 100 }
];

// 4个马品级数据
const horseGrades = [
  {
    grade_key: 'common',
    name: '普通马',
    name_en: 'Common Horse',
    description: '朴实可爱的小马驹，温顺乖巧',
    probability: 0.50,
    prompt_text: '一匹棕色的普通小马，温顺可爱，毛发柔顺',
    sort_order: 1
  },
  {
    grade_key: 'silver',
    name: '银马',
    name_en: 'Silver Horse',
    description: '银光闪闪的骏马，英姿飒爽',
    probability: 0.30,
    prompt_text: '一匹银白色的骏马，毛发闪烁着银光，英姿飒爽',
    sort_order: 2
  },
  {
    grade_key: 'gold',
    name: '金马',
    name_en: 'Golden Horse',
    description: '金光灿灿的神驹，尊贵华丽',
    probability: 0.15,
    prompt_text: '一匹金色的神驹，浑身散发着金色光芒，鬃毛飘逸，尊贵华丽',
    sort_order: 3
  },
  {
    grade_key: 'divine',
    name: '神马',
    name_en: 'Divine Horse',
    description: '传说中的天马，祥云环绕，神圣无比',
    probability: 0.05,
    prompt_text: '一匹传说中的天马，浑身散发神圣光芒，脚踏祥云，鬃毛如火焰般飘动，周围环绕着金色光环',
    sort_order: 4
  }
];

// Prompt模板
const promptTemplate = {
  name: '马年新春头像模板',
  template: `基于参考图生成马年新春喜庆头像。

【核心要求】必须严格保持参考图中人物的面部特征一致性，包括五官轮廓、脸型、眼睛形状、鼻子、嘴巴、肤色等，确保生成结果与本人高度相似。

【场景设定】中国传统新春氛围，{{gender}}人物身穿喜庆的红色中式服装，开心地和{{horse}}合影，双手举着红色春联，春联上写着"{{phrase}}"四个金色大字。

【背景风格】纯色喜庆红色背景，周围有烟花、灯笼、祥云等新春元素装饰。

【构图要求】近景，人物居中，头像构图，面部清晰可见，表情喜庆自然，写实写真照风格。`,
  negative_prompt: '模糊, 变形, 多人, 裁切不完整, 侧脸, 闭眼, 文字错误, 春联文字模糊, 低质量, 卡通'
};

function initHorseYearScene() {
  console.log('开始初始化马年新春头像场景...\n');

  try {
    // 使用事务
    const transaction = db.transaction(() => {
      // 1. 检查场景是否已存在
      const existingScene = db.prepare('SELECT id FROM scenes WHERE scene_key = ?').get(SCENE_ID);

      let sceneDbId;

      if (existingScene) {
        console.log('场景已存在，更新场景配置...');
        db.prepare(`
          UPDATE scenes SET
            name = '马年新春头像',
            name_en = 'Horse Year Avatar',
            description = '生成马年新春喜庆头像，手持春联送祝福',
            description_en = 'Generate festive Horse Year avatar with Spring Festival couplets',
            points_cost = 10,
            status = 'active',
            is_review_safe = 1,
            use_dynamic_render = 1,
            is_highlighted = 1,
            highlight_color = '#ff6b6b',
            highlight_intensity = 0.3,
            sort_order = -1,
            updated_at = CURRENT_TIMESTAMP
          WHERE scene_key = ?
        `).run(SCENE_ID);
        sceneDbId = existingScene.id;
      } else {
        console.log('创建新场景...');
        const result = db.prepare(`
          INSERT INTO scenes (scene_key, name, name_en, description, description_en, points_cost, status, is_review_safe, use_dynamic_render, is_highlighted, highlight_color, highlight_intensity, sort_order)
          VALUES (?, '马年新春头像', 'Horse Year Avatar', '生成马年新春喜庆头像，手持春联送祝福', 'Generate festive Horse Year avatar with Spring Festival couplets', 10, 'active', 1, 1, 1, '#ff6b6b', 0.3, -1)
        `).run(SCENE_ID);
        sceneDbId = result.lastInsertRowid;
      }

      console.log(`场景ID: ${sceneDbId}`);

      // 2. 删除旧的场景步骤
      const oldSteps = db.prepare('SELECT id FROM scene_steps WHERE scene_id = ?').all(sceneDbId);
      oldSteps.forEach(step => {
        db.prepare('DELETE FROM step_options WHERE step_id = ?').run(step.id);
      });
      db.prepare('DELETE FROM scene_steps WHERE scene_id = ?').run(sceneDbId);
      console.log('已清理旧的场景步骤');

      // 3. 创建场景步骤
      const steps = [
        {
          step_key: 'upload',
          step_name: '上传照片',
          step_name_en: 'Upload Photo',
          title: '上传您的照片',
          title_en: 'Upload Your Photo',
          component_type: 'image_upload',
          step_order: 1,
          is_required: 1,
          config: JSON.stringify({ maxCount: 1, tips: '请上传正面清晰照片', tips_en: 'Please upload a clear front-facing photo' })
        },
        {
          step_key: 'gender',
          step_name: '选择性别',
          step_name_en: 'Select Gender',
          title: '选择您的性别',
          title_en: 'Select Your Gender',
          component_type: 'gender_select',
          step_order: 2,
          is_required: 1,
          config: JSON.stringify({ layout: 'horizontal' })
        },
        {
          step_key: 'phrase',
          step_name: '摇出祝福语',
          step_name_en: 'Roll for Blessing',
          title: '摇骰子获取新春祝福',
          title_en: 'Roll the Dice for New Year Blessing',
          component_type: 'random_dice',
          step_order: 3,
          is_required: 1,
          config: JSON.stringify({ poolType: 'phrase', freeCount: 1, costPerRoll: 10, animationDuration: 2000, showRarity: false, title: '摇出你的新春祝福', subtitle: '第一次免费，之后每次10醒币' })
        },
        {
          step_key: 'horse',
          step_name: '抽取坐骑',
          step_name_en: 'Draw Your Horse',
          title: '抽取你的新春坐骑',
          title_en: 'Draw Your New Year Horse',
          component_type: 'random_dice',
          step_order: 4,
          is_required: 1,
          config: JSON.stringify({ poolType: 'horse', freeCount: 1, costPerRoll: 10, animationDuration: 2500, showRarity: true, title: '抽取你的坐骑', subtitle: '第一次免费，之后每次10醒币' })
        }
      ];

      const stepStmt = db.prepare(`
        INSERT INTO scene_steps (scene_id, step_key, step_name, step_name_en, title, title_en, component_type, step_order, is_required, config)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      steps.forEach(step => {
        stepStmt.run(sceneDbId, step.step_key, step.step_name, step.step_name_en, step.title, step.title_en, step.component_type, step.step_order, step.is_required, step.config);
      });
      console.log(`已创建 ${steps.length} 个场景步骤`);

      // 4. 删除旧的词组池数据
      db.prepare('DELETE FROM random_phrase_pool WHERE scene_id = ?').run(SCENE_ID);
      console.log('已清理旧的词组池数据');

      // 5. 插入100个吉祥成语
      const phraseStmt = db.prepare(`
        INSERT INTO random_phrase_pool (scene_id, phrase, phrase_en, rarity, weight, prompt_text)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      phrases.forEach(p => {
        phraseStmt.run(SCENE_ID, p.phrase, p.phrase_en, p.rarity, p.weight, p.phrase);
      });
      console.log(`已插入 ${phrases.length} 个吉祥成语`);

      // 6. 删除旧的马品级数据
      db.prepare('DELETE FROM horse_grades WHERE scene_id = ?').run(SCENE_ID);
      console.log('已清理旧的马品级数据');

      // 7. 插入4个马品级
      const gradeStmt = db.prepare(`
        INSERT INTO horse_grades (scene_id, grade_key, name, name_en, description, probability, prompt_text, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      horseGrades.forEach(g => {
        gradeStmt.run(SCENE_ID, g.grade_key, g.name, g.name_en, g.description, g.probability, g.prompt_text, g.sort_order);
      });
      console.log(`已插入 ${horseGrades.length} 个马品级`);

      // 8. 更新或插入Prompt模板
      const existingPrompt = db.prepare('SELECT id FROM prompt_templates WHERE scene_id = ?').get(sceneDbId);
      if (existingPrompt) {
        db.prepare(`
          UPDATE prompt_templates SET
            name = ?,
            template = ?,
            negative_prompt = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE scene_id = ?
        `).run(promptTemplate.name, promptTemplate.template, promptTemplate.negative_prompt, sceneDbId);
      } else {
        db.prepare(`
          INSERT INTO prompt_templates (scene_id, name, template, negative_prompt)
          VALUES (?, ?, ?, ?)
        `).run(sceneDbId, promptTemplate.name, promptTemplate.template, promptTemplate.negative_prompt);
      }
      console.log('已更新Prompt模板');
    });

    // 执行事务
    transaction();

    console.log('\n========================================');
    console.log('马年新春头像场景初始化完成！');
    console.log('========================================');
    console.log('场景配置:');
    console.log('  - 场景ID: horse_year_avatar');
    console.log('  - 消耗醒币: 10');
    console.log('  - 高亮显示: 是 (红色泛光)');
    console.log('  - 排序: 置顶 (-1)');
    console.log('');
    console.log('场景步骤:');
    console.log('  1. 上传照片 (image_upload)');
    console.log('  2. 选择性别 (gender_select)');
    console.log('  3. 摇出祝福语 (random_dice) - 第一次免费');
    console.log('  4. 抽取坐骑 (random_dice) - 第一次免费');
    console.log('');
    console.log('吉祥成语: 100个');
    console.log('  - 普通(common): 60个');
    console.log('  - 稀有(rare): 25个');
    console.log('  - 史诗(epic): 12个');
    console.log('  - 传说(legendary): 3个');
    console.log('');
    console.log('马品级: 4个');
    console.log('  - 普通马: 50%');
    console.log('  - 银马: 30%');
    console.log('  - 金马: 15%');
    console.log('  - 神马: 5%');
    console.log('========================================');

  } catch (error) {
    console.error('初始化失败:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 运行初始化
initHorseYearScene();
