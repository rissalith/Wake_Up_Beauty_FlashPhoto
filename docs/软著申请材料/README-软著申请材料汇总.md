# 醒美闪图项目 软件著作权申请材料汇总

## 一、软著申请方案概述

根据醒美闪图项目的架构特点，可以从以下5个不同角度申请软件著作权：

| 序号 | 软件名称 | 软件类型 | 核心功能 | 代码规模 |
|-----|---------|---------|---------|---------|
| 1 | 醒美闪图AI图片生成微信小程序软件 | 移动应用 | 用户端AI图片生成 | ~15000行 |
| 2 | 醒美闪图后台管理系统软件 | 管理系统 | 运营管理后台 | ~12000行 |
| 3 | AI图片生成服务系统软件 | AI应用 | AI图片生成引擎 | ~5000行 |
| 4 | 积分支付管理系统软件 | 支付系统 | 积分与支付管理 | ~6000行 |
| 5 | 场景配置中台系统软件 | 配置管理 | 动态场景配置 | ~8000行 |

---

## 二、各软著对应的源代码目录

### 软著1：醒美闪图AI图片生成微信小程序软件

**主要代码目录**：
```
miniprogram/
├── app.js                    # 小程序入口（核心）
├── app.json                  # 小程序配置
├── pages/
│   ├── index/index.js        # 首页（核心）
│   ├── scene/scene.js        # 场景页（核心）
│   ├── history/history.js    # 历史页
│   ├── mine/mine.js          # 个人中心
│   ├── recharge/recharge.js  # 充值页
│   ├── invite/invite.js      # 邀请页
│   └── ...
├── utils/
│   ├── auth.js               # 认证工具
│   ├── ai-service.js         # AI服务调用
│   ├── configManager.js      # 配置管理
│   ├── security.js           # 安全检查
│   ├── cos.js                # 云存储
│   ├── lang.js               # 多语言
│   └── ...
├── components/
│   ├── login-modal/          # 登录弹窗
│   ├── privacy-modal/        # 隐私弹窗
│   └── ...
└── config/
    ├── api.js                # API配置
    └── images.js             # 图片配置
```

### 软著2：醒美闪图后台管理系统软件

**主要代码目录**：
```
admin-server/admin-web/
├── src/
│   ├── main.js               # 入口文件
│   ├── App.vue               # 根组件
│   ├── views/
│   │   ├── Login.vue         # 登录页（核心）
│   │   ├── Dashboard.vue     # 仪表盘（核心）
│   │   ├── Users.vue         # 用户管理（核心）
│   │   ├── Orders.vue        # 订单管理
│   │   ├── Photos.vue        # 照片管理
│   │   ├── Scenes.vue        # 场景管理（核心）
│   │   ├── Points.vue        # 积分管理
│   │   └── ...
│   ├── router/index.js       # 路由配置
│   ├── store/index.js        # 状态管理
│   ├── api/index.js          # API封装
│   └── components/           # 公共组件
└── package.json
```

### 软著3：AI图片生成服务系统软件

**主要代码目录**：
```
services/ai-service/
├── index.js                  # 服务入口（核心）
├── Dockerfile                # 容器配置
└── package.json

miniprogram/utils/
├── ai-service.js             # AI服务客户端（核心）
```

### 软著4：积分支付管理系统软件

**主要代码目录**：
```
services/pay-service/
├── index.js                  # 服务入口（核心）
├── lib/
│   └── redis-client.js       # Redis客户端
├── Dockerfile
└── package.json

core-api/routes/miniprogram/
├── points.js                 # 积分管理（核心）
├── virtual-pay.js            # 虚拟支付（核心）
```

### 软著5：场景配置中台系统软件

**主要代码目录**：
```
core-api/
├── routes/
│   ├── miniprogram/config.js # 配置API（核心）
│   └── admin/
│       ├── scenes.js         # 场景管理API（核心）
│       └── config.js         # 配置管理API
├── config/
│   └── database.js           # 数据库配置（核心）

miniprogram/utils/
├── configManager.js          # 配置管理器（核心）
```

---

## 三、源代码材料准备说明

### 3.1 软著申请代码要求

根据国家版权局要求，软著申请需要提交：
- **源代码文档**：60页，每页50行
- **格式要求**：A4纸，页眉标注软件名称和版本号
- **内容要求**：前30页 + 后30页（或全部代码如不足60页）

### 3.2 代码整理建议

1. **去除注释**：保留必要的功能注释，删除调试注释
2. **去除空行**：减少不必要的空行
3. **统一格式**：使用统一的代码缩进和格式
4. **敏感信息**：删除API密钥、密码等敏感信息

### 3.3 推荐的代码选取顺序

**软著1（小程序）推荐代码**：
1. app.js（入口文件）
2. pages/scene/scene.js（核心业务）
3. pages/index/index.js（首页）
4. utils/ai-service.js（AI调用）
5. utils/configManager.js（配置管理）
6. utils/auth.js（认证）
7. pages/history/history.js
8. pages/mine/mine.js
9. components/login-modal/login-modal.js
10. config/api.js

**软著2（后台管理）推荐代码**：
1. src/main.js
2. src/views/Dashboard.vue
3. src/views/Users.vue
4. src/views/Scenes.vue
5. src/views/Login.vue
6. src/router/index.js
7. src/store/index.js
8. src/api/index.js

**软著3（AI服务）推荐代码**：
1. services/ai-service/index.js
2. miniprogram/utils/ai-service.js

**软著4（支付系统）推荐代码**：
1. services/pay-service/index.js
2. core-api/routes/miniprogram/points.js
3. core-api/routes/miniprogram/virtual-pay.js
4. services/pay-service/lib/redis-client.js

**软著5（配置中台）推荐代码**：
1. core-api/routes/admin/scenes.js
2. core-api/routes/miniprogram/config.js
3. core-api/config/database.js
4. miniprogram/utils/configManager.js

---

## 四、申请材料清单

每份软著申请需要准备以下材料：

### 4.1 必需材料

- [ ] 计算机软件著作权登记申请表
- [ ] 软件说明书（本目录下的说明书文档）
- [ ] 源代码文档（60页）
- [ ] 申请人身份证明

### 4.2 说明书文档

| 软著 | 说明书文件 |
|-----|-----------|
| 软著1 | 软著1-醒美闪图AI图片生成微信小程序-说明书.md |
| 软著2 | 软著2-醒美闪图后台管理系统-说明书.md |
| 软著3 | 软著3-AI图片生成服务系统-说明书.md |
| 软著4 | 软著4-积分支付管理系统-说明书.md |
| 软著5 | 软著5-场景配置中台系统-说明书.md |

---

## 五、注意事项

### 5.1 软件名称规范

- 软件名称应体现软件功能特点
- 建议格式：`[品牌名][功能描述]软件 V1.0`
- 避免使用通用名称

### 5.2 版本号说明

- 首次申请建议使用 V1.0
- 后续升级可申请新版本

### 5.3 开发完成日期

- 填写实际开发完成日期
- 不能晚于申请日期

### 5.4 代码原创性

- 确保代码为原创开发
- 第三方库不计入代码量
- 不包含他人享有著作权的代码

---

## 六、联系信息

如有疑问，可参考：
- 中国版权保护中心：https://www.ccopyright.com.cn
- 软件著作权登记指南

---

**文档编写日期**：2026年1月
**文档版本**：V1.0
