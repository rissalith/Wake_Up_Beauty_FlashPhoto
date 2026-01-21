# 海外用户访问解决方案

## 问题描述
香港、美国等海外地区用户无法登录小程序,主要原因:
1. 微信 API (`api.weixin.qq.com`) 在海外访问受限
2. 小程序未配置海外服务类目
3. 服务器网络环境限制

## 解决方案

### 方案一: 配置小程序海外服务(推荐)

1. **登录微信公众平台**
   - 访问: https://mp.weixin.qq.com
   - 进入"设置" -> "基本设置" -> "服务类目"

2. **添加海外服务类目**
   - 点击"添加服务类目"
   - 选择支持海外服务的类目
   - 提交审核

3. **配置服务器域名**
   - 确保 `pop-pub.com` 在"开发" -> "开发管理" -> "服务器域名"中配置
   - 添加 `request合法域名`: https://pop-pub.com

### 方案二: 使用代理服务器

如果微信API在海外访问受限,可以通过代理服务器转发请求:

#### 2.1 修改服务器代码

在 `admin-server/server/routes/users.js` 中添加代理配置:

```javascript
// 微信API代理配置(用于海外访问)
const WX_API_PROXY = process.env.WX_API_PROXY || null; // 例如: 'http://proxy.example.com:8080'

// 修改微信登录接口
router.post('/wx-login', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ code: 400, message: 'code不能为空' });
  }

  try {
    const wxLoginUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`;

    // 使用代理或直连
    const requestOptions = {
      method: 'GET',
      timeout: 10000
    };
    
    if (WX_API_PROXY) {
      // 使用代理
      const { HttpsProxyAgent } = require('https-proxy-agent');
      requestOptions.agent = new HttpsProxyAgent(WX_API_PROXY);
    }

    const wxRes = await new Promise((resolve, reject) => {
      const lib = wxLoginUrl.startsWith('https') ? require('https') : require('http');
      lib.get(wxLoginUrl, requestOptions, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('解析微信响应失败'));
          }
        });
      }).on('error', reject);
    });

    // ... 其余代码保持不变
  } catch (error) {
    console.error('[微信登录] 错误:', error);
    res.status(500).json({ code: 500, message: '微信登录失败: ' + error.message });
  }
});
```

#### 2.2 安装依赖

```bash
cd admin-server/server
npm install https-proxy-agent
```

#### 2.3 配置环境变量

在 `admin-server/server/.env` 中添加:

```env
# 微信API代理(可选,用于海外访问)
WX_API_PROXY=http://your-proxy-server:port
```

### 方案三: 增加重试和超时机制(临时方案)

修改微信登录接口,增加重试逻辑:

```javascript
// 带重试的微信API调用
async function callWxApiWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('请求超时')), 15000);
        
        https.get(url, (response) => {
          clearTimeout(timeout);
          let data = '';
          response.on('data', chunk => data += chunk);
          response.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('解析响应失败'));
            }
          });
        }).on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      
      return result;
    } catch (error) {
      console.log(`[微信API] 第${i + 1}次尝试失败:`, error.message);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 方案四: 使用微信开放平台(长期方案)

1. **申请微信开放平台账号**
   - 访问: https://open.weixin.qq.com
   - 创建移动应用或网站应用

2. **绑定小程序**
   - 在开放平台绑定您的小程序
   - 获取 UnionID 机制,实现跨平台用户统一

3. **配置海外服务器**
   - 在香港或美国部署服务器节点
   - 使用 CDN 加速海外访问

## 检查清单

- [ ] 确认小程序是否配置了海外服务类目
- [ ] 检查服务器域名是否在白名单中
- [ ] 测试微信API在海外的访问速度
- [ ] 配置代理服务器(如需要)
- [ ] 增加日志记录,监控海外用户登录情况
- [ ] 考虑使用 CDN 加速静态资源

## 临时解决方案

如果以上方案实施需要时间,可以先:

1. **提示用户使用VPN**
   - 在登录失败时,提示海外用户尝试使用VPN连接到中国大陆

2. **增加友好的错误提示**
   - 检测用户地区,给出针对性的提示信息

3. **提供备用登录方式**
   - 考虑增加手机号登录等备用方案

## 监控和日志

建议添加地域监控:

```javascript
// 记录用户地区信息
router.post('/wx-login', async (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log('[微信登录] 客户端IP:', clientIP);
  
  // ... 登录逻辑
});
```

## 联系微信客服

如果问题持续存在,建议:
1. 联系微信小程序客服: https://developers.weixin.qq.com/community/
2. 提交工单说明海外用户访问问题
3. 咨询是否需要特殊配置或权限
