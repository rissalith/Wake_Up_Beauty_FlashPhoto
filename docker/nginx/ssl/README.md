# SSL 证书配置说明

本目录用于存放 SSL 证书文件。

## 所需文件

请将以下文件放置到此目录：

- `fullchain.pem` - 完整证书链（包含服务器证书和中间证书）
- `privkey.pem` - 私钥文件

## 获取证书的方式

### 方式一：Let's Encrypt (免费，推荐)

```bash
# 安装 certbot
apt install certbot

# 获取证书 (需要先停止 Nginx 或使用 webroot 模式)
certbot certonly --standalone -d pop-pub.com -d www.pop-pub.com

# 证书位置
# /etc/letsencrypt/live/pop-pub.com/fullchain.pem
# /etc/letsencrypt/live/pop-pub.com/privkey.pem

# 复制到此目录
cp /etc/letsencrypt/live/pop-pub.com/fullchain.pem ./
cp /etc/letsencrypt/live/pop-pub.com/privkey.pem ./
```

### 方式二：购买商业证书

从证书提供商（如阿里云、腾讯云、DigiCert 等）购买证书后：

1. 下载 Nginx 格式的证书
2. 将证书文件重命名为 `fullchain.pem`
3. 将私钥文件重命名为 `privkey.pem`
4. 放置到此目录

### 方式三：自签名证书 (仅用于测试)

```bash
# 生成自签名证书
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout privkey.pem \
    -out fullchain.pem \
    -subj "/C=CN/ST=Beijing/L=Beijing/O=FlashPhoto/CN=pop-pub.com"
```

或使用部署脚本：

```bash
bash docker/deploy-optimized.sh ssl
```

## 证书续期

Let's Encrypt 证书有效期为 90 天，建议设置自动续期：

```bash
# 添加 crontab 任务
0 0 1 * * certbot renew --quiet && docker restart flashphoto-nginx
```

## 注意事项

1. 私钥文件 (`privkey.pem`) 必须保密，不要提交到代码仓库
2. 生产环境必须使用正式证书，不要使用自签名证书
3. 证书更新后需要重启 Nginx 容器：`docker restart flashphoto-nginx`
