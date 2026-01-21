# 醒美闪图 (FlashPhoto)

基于微信小程序的 AI 图片生成应用。

## 访问地址

- **后台管理**: https://pop-pub.com/admin/
- **API 服务**: https://pop-pub.com/api/
- **健康检查**: https://pop-pub.com/health

## 自动化部署

项目已配置 GitHub Actions 自动化部署，**推送代码即自动部署**。

### 日常开发流程

```bash
# 1. 修改代码
# 2. 提交并推送
git add .
git commit -m "你的提交信息"
git push
```

推送后系统会自动：
1. 构建后台管理前端
2. SSH 到服务器拉取最新代码
3. 重新构建 Docker 镜像并启动
4. 执行健康检查
5. 发送通知（如已配置企业微信）

### 查看部署状态

https://github.com/rissalith/Wake_Up_Beauty_FlashPhoto/actions

### 手动操作（仅在必要时）

SSH 到服务器后执行：

```bash
cd /www/wwwroot/pop-pub.com

# 查看服务状态
bash docker/deploy-optimized.sh status

# 查看日志
bash docker/deploy-optimized.sh logs
bash docker/deploy-optimized.sh logs core-api  # 指定服务

# 重启服务
bash docker/deploy-optimized.sh restart

# 备份数据
bash docker/deploy-optimized.sh backup

# 健康检查
bash docker/deploy-optimized.sh health
```

## 项目结构

```
├── miniprogram/          # 微信小程序源码
├── core-api/             # 统一后端服务 (API + 管理后台)
├── admin-server/         # 后台管理系统
│   └── admin-web/        # 后台前端 (Vue 3)
├── services/             # 微服务
│   ├── ai-service/       # AI 图片生成
│   └── pay-service/      # 支付服务
├── docker/               # Docker 配置
│   ├── nginx/            # Nginx 配置
│   └── config/           # 环境变量配置
├── .github/workflows/    # GitHub Actions 自动部署
└── docker-compose.optimized.yml  # Docker 编排
```

## 技术栈

- **小程序**: WXML + WXSS + JavaScript
- **后台前端**: Vue 3 + Element Plus + Vite
- **后端**: Node.js + Express + SQLite
- **部署**: Docker + Nginx + GitHub Actions

## 本地开发

### 小程序

1. 打开微信开发者工具
2. 导入 `miniprogram/` 目录
3. 配置 AppID: `wxf67c9b6c7b94a9bb`
4. 点击【工具】→【构建 npm】

### 后台管理前端

```bash
cd admin-server/admin-web
npm install
npm run dev
```

## 注意事项

1. **不要直接在服务器上改代码** - 下次部署会被覆盖
2. **数据库数据会保留** - 存储在 Docker 卷中
3. **SSL 证书自动续期** - Let's Encrypt 已配置

## 详细文档

- [CLAUDE.md](CLAUDE.md) - 项目完整架构说明
