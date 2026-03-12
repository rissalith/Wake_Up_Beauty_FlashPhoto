# 登录授权页面实现说明

## 概述

已为小程序实现了一个独立的登录授权页面，类似 BLUED 的登录界面。用户在需要登录时会被导航到这个页面，在该页面上可以勾选隐私政策和用户协议，然后通过微信授权登录。

## 功能特性

### 1. 独立登录页面
- **路径**: `/pages/login/login`
- **触发方式**: 当用户尝试访问需要登录的功能时，会自动导航到登录页面
- **返回方式**: 登录成功后自动返回上一页

### 2. 协议勾选
- 隐私政策勾选框
- 用户协议勾选框
- 两个协议都必须勾选才能登录
- 点击协议文本可查看完整内容

### 3. 协议详情弹窗
- 隐私政策详情页面
- 用户协议详情页面
- 支持滚动查看长文本
- 可关闭返回主登录界面

### 4. 微信登录流程
- 显示登录步骤提示（验证微信 → 创建账户 → 加载数据）
- 登录成功后显示成功提示
- 自动返回上一页

### 5. 多语言支持
- 中文 (zh-CN)
- 英文 (en)
- 支持实时语言切换

## 文件结构

```
miniprogram/
├── pages/login/
│   ├── login.js          # 登录页面逻辑
│   ├── login.wxml        # 登录页面模板
│   ├── login.wxss        # 登录页面样式
│   └── login.json        # 登录页面配置
├── utils/
│   └── policy-api.js     # 协议 API 调用
└── components/
    └── login-modal/
        └── index.js      # 登录弹窗组件（已更新）
```

## 使用方式

### 1. 触发登录页面

在任何需要检查登录状态的地方，使用以下代码：

```javascript
const app = getApp();
const isLoggedIn = app.globalData.isLoggedIn;

if (!isLoggedIn) {
  wx.navigateTo({
    url: '/pages/login/login'
  });
  return;
}

// 继续执行需要登录的操作
```

### 2. 从登录弹窗导航

登录弹窗组件已更新，点击"确认登录"按钮会自动导航到登录页面：

```javascript
// 在 login-modal 组件中
onLogin() {
  this.triggerEvent('close');
  wx.navigateTo({
    url: '/pages/login/login'
  });
}
```

### 3. 首页场景跳转示例

```javascript
goToScene(e) {
  const app = getApp();
  const isLoggedIn = app.globalData.isLoggedIn;

  if (!isLoggedIn) {
    wx.navigateTo({
      url: '/pages/login/login'
    });
    return;
  }

  // 已登录，继续跳转到场景页面
  this._doNavigateToScene(scene);
}
```

## 后端 API

### 获取隐私政策

```
GET /api/config/privacy-policy
```

**响应**:
```json
{
  "code": 0,
  "data": "隐私政策内容..."
}
```

### 获取用户协议

```
GET /api/config/user-agreement
```

**响应**:
```json
{
  "code": 0,
  "data": "用户协议内容..."
}
```

### 记录协议同意

```
POST /api/user/agreement
```

**请求体**:
```json
{
  "type": "privacy" | "terms" | "all",
  "agreedAt": "2026-03-12T10:00:00Z"
}
```

**响应**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "privacyAgreed": true,
    "termsAgreed": true,
    "agreementTime": "2026-03-12T10:00:00Z"
  }
}
```

## 多语言文本

已在 `miniprogram/utils/lang.js` 中添加以下多语言文本：

### 中文 (zh-CN)
- `wxLogin`: '微信授权登录'
- `logging`: '登录中...'
- `loginStep1`: '正在验证微信...'
- `loginStep2`: '正在创建账户...'
- `loginStep3`: '正在加载数据...'
- `loginSubtitle`: '一键生成专业证件照'
- `agreePrivacy`: '我已阅读并同意'
- `agreeTerms`: '我已阅读并同意'
- `loginTip`: '登录即表示您同意上述协议'

### 英文 (en)
- `wxLogin`: 'WeChat Authorization Login'
- `logging`: 'Logging in...'
- `loginStep1`: 'Verifying WeChat...'
- `loginStep2`: 'Creating account...'
- `loginStep3`: 'Loading data...'
- `loginSubtitle`: 'Generate professional ID photos instantly'
- `agreePrivacy`: 'I have read and agree to'
- `agreeTerms`: 'I have read and agree to'
- `loginTip`: 'By logging in, you agree to the above terms'

## 样式特点

- **渐变背景**: 紫色渐变背景（#667eea → #764ba2）
- **圆角设计**: 所有按钮和卡片都采用圆角设计
- **响应式**: 支持不同屏幕尺寸
- **安全区域**: 支持刘海屏和底部安全区域
- **动画效果**: 加载动画、按钮按压效果

## 配置说明

### 协议内容配置

协议内容存储在 `system_config` 表中：

```sql
-- 隐私政策
INSERT INTO system_config (config_key, config_value, config_type, is_public)
VALUES ('privacy_policy', '隐私政策内容...', 'text', 1);

-- 用户协议
INSERT INTO system_config (config_key, config_value, config_type, is_public)
VALUES ('user_agreement', '用户协议内容...', 'text', 1);
```

可通过后台管理系统编辑这些内容。

## 注意事项

1. **协议必须勾选**: 用户必须同意两个协议才能登录
2. **协议内容加载**: 登录页面加载时会自动获取协议内容
3. **登录状态检查**: 每个需要登录的功能都应该检查 `app.globalData.isLoggedIn`
4. **返回处理**: 登录成功后会自动返回上一页，无需手动处理
5. **错误处理**: 登录失败会显示错误提示，用户可以重试

## 集成步骤

1. ✅ 创建登录页面文件（已完成）
2. ✅ 在 app.json 中注册登录页面（已完成）
3. ✅ 更新登录弹窗组件（已完成）
4. ✅ 添加多语言文本（已完成）
5. ✅ 添加后端 API 端点（已完成）
6. ⏳ 在各个页面中集成登录检查（需要根据业务需求）
7. ⏳ 配置协议内容（需要在后台管理系统中设置）

## 后续优化建议

1. 可以添加"记住我"功能，避免频繁登录
2. 可以添加社交登录选项（QQ、支付宝等）
3. 可以添加注册功能
4. 可以添加忘记密码功能
5. 可以添加登录历史记录
