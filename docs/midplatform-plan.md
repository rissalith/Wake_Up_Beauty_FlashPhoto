# 醒美闪图 中台化改造方案

## 一、项目现状分析

### 1.1 当前硬编码位置汇总

| 配置类型 | 文件位置 | 硬编码内容 |
|---------|---------|-----------|
| 场景入口 | `pages/index/index.js:6-150` | 6个场景定义 |
| 证件照价格 | `pages/flashphoto/flashphoto.js:9` | `POINTS_PER_PHOTO = 50` |
| 职业照价格 | `pages/professional-photo/professional-photo.js:8` | `POINTS_PER_PHOTO = 100` |
| 充值套餐 | `pages/recharge/recharge.js:79-93` | 6个固定套餐 |
| Prompt模板 | `pages/flashphoto/flashphoto.js:760-814` | 背景色/美颜/规格映射 |
| 证件照风格 | `config/idPhotoStyles.js` | 男9+女12穿着、发型、表情 |
| 职业配置 | `professional-photo.js:12-137` | 13行业77职业 |
| 规格尺寸 | `flashphoto.js:749-758` | 一寸/二寸等规格 |
| 多语言 | `utils/lang.js` | 1700+行文案 |

### 1.2 当前架构痛点

1. **每加新场景都需审核** - 场景写死在代码里
2. **价格调整需发版** - 无法灵活促销
3. **Prompt优化需发版** - AI效果迭代慢
4. **敏感内容风险** - 无法快速下架

---

## 二、中台化架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                     后台管理系统 (Admin Web)                      │
├─────────────────────────────────────────────────────────────────┤
│  场景管理  │  步骤配置  │  素材库  │  定价策略  │  审核开关  │  数据统计  │
└────────────────────────────┬────────────────────────────────────┘
                             │ RESTful API
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API 服务层                                │
├─────────────────────────────────────────────────────────────────┤
│  /api/config/scenes     - 获取场景列表                           │
│  /api/config/steps/:id  - 获取场景步骤配置                        │
│  /api/config/options    - 获取选项数据                           │
│  /api/config/prompt     - 获取Prompt模板                         │
│  /api/config/pricing    - 获取定价规则                           │
│  /api/config/system     - 获取系统配置(审核模式等)                 │
│  /api/config/version    - 配置版本检查                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    小程序端 (动态渲染引擎)                         │
├─────────────────────────────────────────────────────────────────┤
│  ConfigManager    - 配置管理(拉取/缓存/版本控制)                   │
│  SceneRenderer    - 场景动态渲染                                  │
│  StepEngine       - 步骤流程引擎                                  │
│  ComponentFactory - 动态组件工厂                                  │
│  PromptBuilder    - Prompt构建器                                 │
│  FallbackHandler  - 降级处理(保底配置)                            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流设计

```
用户打开小程序
     │
     ▼
┌─────────────────┐    缓存有效?     ┌─────────────────┐
│ 读取本地缓存配置  │ ───────────────▶ │   直接渲染UI     │
└────────┬────────┘        是        └─────────────────┘
         │ 否
         ▼
┌─────────────────┐                  ┌─────────────────┐
│ 请求服务器配置   │ ───成功─────────▶ │ 更新缓存+渲染UI  │
└────────┬────────┘                  └─────────────────┘
         │ 失败
         ▼
┌─────────────────┐
│ 使用内置保底配置  │
└─────────────────┘
```

---

## 三、数据库设计

详见 `midplatform-design.sql`

### 核心表结构

| 表名 | 作用 |
|-----|------|
| `scenes` | 场景主表 - 定义所有场景入口 |
| `scene_steps` | 步骤定义 - 每个场景的UI流程 |
| `step_options` | 选项数据 - 单选/多选/标签内容 |
| `prompt_templates` | Prompt模板 - AI提示词 |
| `prompt_variables` | 变量映射 - Prompt变量替换 |
| `assets` | 素材资源 - 图片/图标等 |
| `pricing_rules` | 定价规则 - 价格策略 |
| `system_config` | 系统配置 - 全局开关 |

---

## 四、后台管理模块设计

### 4.1 场景管理页面

```
场景管理
├── 场景列表 (拖拽排序)
│   ├── 证件照 [上线中] [审核安全✓] 50醒币
│   ├── 职业照 [上线中] [审核安全✓] 100醒币
│   ├── 写真照 [即将上线] [审核风险!] 150醒币
│   └── + 添加场景
│
├── 编辑场景
│   ├── 基本信息: 名称/描述/图标
│   ├── 状态控制: 上线/下线/即将上线
│   ├── 审核安全: 是否在审核模式显示
│   ├── 定价设置: 基础消耗醒币数
│   └── 步骤配置: 跳转到步骤编辑器
```

### 4.2 步骤配置器 (可视化)

```
证件照 - 步骤配置
┌────────────────────────────────────────────────────┐
│  步骤1: 上传照片                                    │
│  ├── 组件类型: [image_upload ▼]                    │
│  ├── 最大数量: [3]                                 │
│  └── 提示文案: [请上传正面清晰照片]                  │
├────────────────────────────────────────────────────┤
│  步骤2: 选择性别                                    │
│  ├── 组件类型: [radio ▼]                           │
│  ├── 选项管理:                                      │
│  │   ├── 男 (male) - Prompt: "男性"                │
│  │   └── 女 (female) - Prompt: "女性"              │
├────────────────────────────────────────────────────┤
│  步骤3: 选择背景                                    │
│  ├── 组件类型: [color_picker ▼]                    │
│  ├── 选项管理:                                      │
│  │   ├── 白色 (#FFFFFF) - Prompt: "纯白色背景"      │
│  │   ├── 蓝色 (#0066CC) - Prompt: "标准蓝色背景"    │
│  │   └── + 添加颜色                                │
├────────────────────────────────────────────────────┤
│  [+ 添加步骤]                                       │
└────────────────────────────────────────────────────┘
```

### 4.3 Prompt模板编辑器

```
Prompt模板管理
├── 证件照模板 v3 [当前使用]
│   ├── 模板内容 (支持变量):
│   │   基于参考图生成专业{{spec}}证件照...
│   │   {{background}}，{{dress}}，{{hair}}...
│   │
│   ├── 变量映射:
│   │   ├── background:
│   │   │   ├── white → "纯白色背景"
│   │   │   ├── blue → "标准蓝色背景"
│   │   │   └── red → "红色背景"
│   │   └── beauty:
│   │       ├── none → "保持原貌"
│   │       ├── natural → "自然美化：轻微磨皮"
│   │       └── enhanced → "精致修图：瘦脸大眼"
│   │
│   └── 负面提示词: 模糊, 变形, 多人...
│
└── [+ 新建模板] [历史版本]
```

### 4.4 运营控制台

```
运营控制
├── 审核模式 [开关]
│   └── 开启后只显示"审核安全"标记的场景
│
├── 维护模式 [开关]
│   └── 开启后小程序显示维护页面
│
├── 全局公告 [开关]
│   ├── 公告内容: [______________]
│   └── 公告类型: [info/warning/error]
│
├── 定价策略
│   ├── 证件照: 50醒币 [编辑]
│   ├── 职业照: 100醒币 [编辑]
│   └── [+ 添加促销活动]
│
└── 充值套餐管理
    ├── ¥5 → 50醒币 [编辑]
    ├── ¥10 → 100醒币 [编辑]
    └── [+ 添加套餐]
```

---

## 五、小程序端改造

### 5.1 配置管理器 (ConfigManager)

```javascript
// utils/configManager.js
class ConfigManager {
  constructor() {
    this.CACHE_KEY = 'app_config';
    this.VERSION_KEY = 'config_version';
    this.CACHE_DURATION = 30 * 60 * 1000; // 30分钟
  }

  // 初始化配置
  async init() {
    const cached = this.getCache();
    if (cached && !this.isExpired(cached)) {
      return cached.data;
    }

    try {
      const config = await this.fetchRemoteConfig();
      this.setCache(config);
      return config;
    } catch (error) {
      console.warn('配置拉取失败，使用保底配置');
      return this.getFallbackConfig();
    }
  }

  // 检查版本更新
  async checkUpdate() {
    const remoteVersion = await api.getConfigVersion();
    const localVersion = wx.getStorageSync(this.VERSION_KEY);
    return remoteVersion > localVersion;
  }

  // 保底配置
  getFallbackConfig() {
    return require('../config/fallback.js');
  }
}
```

### 5.2 动态组件工厂

```javascript
// components/dynamic-form/index.js
Component({
  properties: {
    stepConfig: Object  // 步骤配置
  },

  methods: {
    // 根据组件类型渲染
    getComponentType() {
      const typeMap = {
        'image_upload': 'upload-panel',
        'radio': 'radio-group',
        'tags': 'tag-selector',
        'color_picker': 'color-picker',
        'image_tags': 'image-tag-selector',
        'slider': 'custom-slider'
      };
      return typeMap[this.data.stepConfig.component_type];
    }
  }
});
```

### 5.3 首页动态渲染

```javascript
// pages/index/index.js
Page({
  async onLoad() {
    const configManager = getApp().configManager;
    const config = await configManager.init();

    // 过滤场景 (审核模式检查)
    let scenes = config.scenes;
    if (config.system.review_mode) {
      scenes = scenes.filter(s => s.is_review_safe);
    }

    this.setData({
      scenes: scenes.filter(s => s.status === 'active'),
      comingSoon: scenes.filter(s => s.status === 'coming_soon')
    });
  }
});
```

### 5.4 通用生成页面

```javascript
// pages/generate/generate.js
Page({
  data: {
    sceneId: '',
    steps: [],
    currentStep: 0,
    formData: {}
  },

  async onLoad(options) {
    const { sceneId } = options;
    const config = await configManager.getSceneConfig(sceneId);

    this.setData({
      sceneId,
      steps: config.steps,
      promptTemplate: config.prompt_template,
      pricing: config.pricing
    });
  },

  // 下一步
  nextStep() {
    if (this.validateCurrentStep()) {
      this.setData({ currentStep: this.data.currentStep + 1 });
    }
  },

  // 构建Prompt
  buildPrompt() {
    let prompt = this.data.promptTemplate;
    Object.keys(this.data.formData).forEach(key => {
      const value = this.data.formData[key];
      const mapping = this.data.promptMappings[key]?.[value];
      prompt = prompt.replace(`{{${key}}}`, mapping || value);
    });
    return prompt;
  }
});
```

---

## 六、API接口设计

### 6.1 配置相关接口

```
GET /api/config/init
- 返回: 完整配置数据 (scenes, system, pricing)
- 用途: 小程序启动时初始化

GET /api/config/version
- 返回: { version: 3, updated_at: "2024-01-01" }
- 用途: 检查配置是否需要更新

GET /api/config/scene/:id
- 返回: 单个场景的完整配置 (steps, options, prompt)
- 用途: 进入场景时加载详细配置

GET /api/config/scenes
- 参数: review_mode (是否审核模式)
- 返回: 场景列表
- 用途: 首页渲染

GET /api/config/pricing/:sceneId
- 返回: 定价规则
- 用途: 支付前获取价格
```

### 6.2 返回数据示例

```json
{
  "code": 200,
  "data": {
    "version": 3,
    "system": {
      "review_mode": false,
      "maintenance_mode": false,
      "announcement": ""
    },
    "scenes": [
      {
        "id": "idphoto",
        "name": "证件照",
        "icon": "https://cdn.../idphoto.png",
        "status": "active",
        "is_review_safe": true,
        "points_cost": 50
      }
    ]
  }
}
```

---

## 七、实施计划

### 阶段一：基础框架 (1周)
- [ ] 创建数据库表结构
- [ ] 实现配置相关API
- [ ] 后台场景管理CRUD

### 阶段二：后台完善 (1周)
- [ ] 步骤可视化配置器
- [ ] Prompt模板编辑器
- [ ] 运营控制台

### 阶段三：小程序改造 (1周)
- [ ] ConfigManager配置管理
- [ ] 动态组件工厂
- [ ] 首页动态渲染
- [ ] 缓存和降级机制

### 阶段四：迁移上线 (1周)
- [ ] 将现有配置迁移到数据库
- [ ] 灰度测试
- [ ] 全量上线

---

## 八、收益对比

| 维度 | 改造前 | 改造后 |
|-----|-------|-------|
| 新场景上线 | 改代码+审核(1-3天) | 后台配置(秒级) |
| 价格调整 | 改代码+发版 | 后台实时调整 |
| Prompt优化 | 改代码+发版 | 后台实时测试 |
| 审核风险 | 可能被拒 | 一键切换安全模式 |
| 促销活动 | 需提前发版 | 随时开启关闭 |
| 紧急下架 | 需紧急发版 | 后台一键下线 |

---

## 九、保底机制

小程序内置一份最小化配置(`config/fallback.js`)，确保：
1. 服务器不可达时能正常使用
2. 至少保证"证件照"场景可用
3. 使用本地缓存的最后有效配置
