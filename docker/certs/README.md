# 微信支付证书目录

此目录用于存放微信支付相关证书文件。

## 必需文件

| 文件名 | 说明 | 获取方式 |
|--------|------|----------|
| `apiclient_key.pem` | 商户 API 私钥 | 微信支付商户平台下载 |
| `apiclient_cert.pem` | 商户 API 证书 | 微信支付商户平台下载 |

## 获取证书

1. 登录 [微信支付商户平台](https://pay.weixin.qq.com)
2. 进入 **账户中心** → **API安全**
3. 下载 API 证书

## 安全提示

- 证书文件包含敏感信息，**请勿提交到版本控制系统**
- 此目录已在 `.gitignore` 中配置忽略
- 生产环境请妥善保管证书文件
- 定期检查证书有效期

## Docker 挂载

在 `docker-compose.optimized.yml` 中，此目录会被挂载到 pay-service 容器的 `/app/certs` 路径：

```yaml
volumes:
  - ./docker/certs:/app/certs:ro
```

对应的环境变量配置：
```env
WX_PAY_PRIVATE_KEY_PATH=/app/certs/apiclient_key.pem
```
