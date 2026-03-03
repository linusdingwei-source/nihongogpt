# 支付宝与微信支付接入说明

项目已支持三种支付方式：**Stripe（信用卡）**、**支付宝**、**微信扫码**。定价页可选择支付方式，支付宝跳转收银台，微信展示二维码扫码支付。

---

## 一、你需要做的事（概览）

1. **支付宝**：在支付宝开放平台创建应用、签约「电脑网站支付」、配置密钥与异步通知 URL。
2. **微信支付**：在微信商户平台开通 Native 支付、配置 API 证书与 APIv3 密钥、设置支付结果通知 URL。
3. **环境变量**：在 `.env` 或 SAE 环境变量中填写对应配置。
4. **数据库**：执行一次 `npx prisma migrate dev` 或 `prisma db push`，以包含订单表新增的 `provider` 字段。

---

## 二、支付宝接入

### 2.1 开放平台配置

1. 登录 [支付宝开放平台](https://open.alipay.com/)。
2. **创建应用**（如「网页/移动应用」），获得 **AppID**。
3. **添加能力**：在应用下签约 **电脑网站支付**（用于 PC 端跳转收银台）。
4. **接口加签方式**：
   - 生成应用 **RSA2 密钥对**（可用 [支付宝密钥工具](https://opendocs.alipay.com/common/02kipk)），应用私钥自己保存，应用公钥上传到开放平台。
   - 若使用工具生成的是 PKCS8，在代码里已用 `keyType: 'PKCS8'`。
5. **获取支付宝公钥**：开放平台会提供「支付宝公钥」，用于验签异步通知。

### 2.2 环境变量

在 `.env` 或 SAE 环境变量中配置：

```bash
# 支付宝
ALIPAY_APP_ID=你的应用AppID
ALIPAY_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
ALIPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
# 可选：沙箱
# ALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do
```

- `ALIPAY_PRIVATE_KEY`：应用私钥，整段 PEM，换行可写成 `\n`。
- `ALIPAY_PUBLIC_KEY`：**支付宝公钥**（开放平台提供的那个），用于验签 notify。

### 2.3 异步通知 URL

- 异步通知地址必须为 **公网 HTTPS**（本地开发可用内网穿透）。
- 在开放平台该应用的「电脑网站支付」中配置 **异步通知地址**：
  ```text
  https://你的域名/api/payment/alipay/notify
  ```
- 支付成功后支付宝会 POST 到该 URL，服务端验签通过后会给用户加积分并更新订单，最后返回纯文本 **success**。

### 2.4 同步跳转（return_url）

- 用户付完款会跳回你配置的 **return_url**（在创建订单时由 `NEXTAUTH_URL` + 路径拼出）。
- 例如：`https://你的域名/zh/payment/success?provider=alipay&out_trade_no=xxx`
- 积分到账以 **异步通知** 为准；同步页可只做「支付已提交，请稍候刷新余额」的提示。

---

## 三、微信支付接入

### 3.1 商户平台配置

1. 登录 [微信支付商户平台](https://pay.weixin.qq.com/)。
2. 开通 **Native 支付**（扫码支付）。
3. **API 证书**：在「账户中心」→「API 安全」中下载并妥善保存：
   - `apiclient_key.pem`（商户私钥）
   - `apiclient_cert.pem`（商户证书，用于请求签名与序列号）
4. **APIv3 密钥**：在「API 安全」中设置 32 位 **APIv3 密钥**，用于回调解密与验签。
5. **证书序列号**：执行 `openssl x509 -in apiclient_cert.pem -noout -serial` 得到序列号（如 `serial=5E1234567890ABCD`，取等号后面部分）。

### 3.2 环境变量

```bash
# 微信支付
WECHAT_PAY_APP_ID=你的应用AppID（公众号或移动应用）
WECHAT_PAY_MCH_ID=商户号
WECHAT_PAY_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
WECHAT_PAY_PUBLIC_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
WECHAT_PAY_SERIAL_NO=证书序列号（不含 serial= 前缀）
WECHAT_PAY_API_V3_KEY=32位APIv3密钥
```

- `WECHAT_PAY_PRIVATE_KEY`：`apiclient_key.pem` 内容。
- `WECHAT_PAY_PUBLIC_CERT`：`apiclient_cert.pem` 内容。
- 若 PEM 含换行，在 `.env` 中可写成 `\n`。

### 3.3 支付结果通知 URL

在商户平台「产品中心」→「开发配置」中配置 **支付结果通知 URL**：

```text
https://你的域名/api/payment/wechat/notify
```

- 必须 HTTPS。
- 支付成功后微信会 POST 加密内容到该 URL，服务端验签、解密后加积分并更新订单，并返回 `{ "code": "SUCCESS", "message": "成功" }`。

---

## 四、数据库迁移

订单表已增加 `provider` 字段（stripe | alipay | wechat），需执行迁移或推送：

```bash
npx prisma migrate dev --name add_order_provider
# 或
npx prisma db push
```

---

## 五、接口与前端说明

| 支付方式 | 创建订单接口 | 前端行为 |
|----------|--------------|----------|
| Stripe   | POST /api/payment/create-checkout | 跳转 Stripe Checkout |
| 支付宝   | POST /api/payment/alipay/create   | 跳转返回的 `url`（支付宝收银台） |
| 微信     | POST /api/payment/wechat/create   | 弹窗展示 `code_url` 的二维码，用户扫码 |

- 支付宝、微信的 **金额单位**：创建订单时用 **分**（人民币），展示时用 **元**（如 ¥35）。
- 套餐与金额在 `lib/payment-packages.ts` 中统一配置（含 `priceCny`），定价页与各支付创建接口共用。

---

## 六、你方自检清单

- [ ] 支付宝：应用已创建并签约电脑网站支付，已配置应用公钥/私钥与支付宝公钥。
- [ ] 支付宝：异步通知 URL 已填为 `https://你的域名/api/payment/alipay/notify`。
- [ ] 微信：Native 支付已开通，API 证书与 APIv3 密钥、证书序列号已配置。
- [ ] 微信：支付结果通知 URL 已填为 `https://你的域名/api/payment/wechat/notify`。
- [ ] 环境变量已按上文在 `.env` 或 SAE 中配置，且域名已备案（国内部署）。
- [ ] 已执行 Prisma 迁移或 `db push`，订单表包含 `provider` 字段。

完成以上步骤后，在定价页选择「支付宝」或「微信扫码」即可完成购买与到账。

---

## 七、本地测试

本地是 `http://localhost:3000`，而支付宝/微信的**异步通知**必须回调到**公网 HTTPS**，所以需要「内网穿透」把本机暴露出去；支付宝还可使用**沙箱**免真实付款。

### 7.1 内网穿透（支付宝/微信回调必做）

任选一种，让外网能访问你本机的 3000 端口：

- **ngrok**：`ngrok http 3000`，会得到 `https://xxxx.ngrok-free.app`。
- **Cloudflare Tunnel**：`cloudflared tunnel --url http://localhost:3000`，会得到 `https://xxx.trycloudflare.com`。

记下得到的 **HTTPS 公网地址**，下面用 `https://你的穿透域名` 表示。

### 7.2 本地环境变量

在 `.env` 里把「站点地址」指到穿透域名，这样创建订单时的 `return_url` / `notify_url` 才是公网地址：

```bash
# 本地测试时改为穿透后的地址（不要用 localhost）
NEXTAUTH_URL=https://你的穿透域名
```

例如：

```bash
NEXTAUTH_URL=https://abc123.ngrok-free.app
```

### 7.3 Stripe 本地测试

#### 安装 Stripe CLI

- **macOS（Homebrew）**：
  ```bash
  brew install stripe/stripe-cli/stripe
  ```
- **Windows**：在 [Stripe CLI 发布页](https://github.com/stripe/stripe-cli/releases) 下载对应 `.exe`，或使用 `scoop install stripe`。
- **Linux**：见 [Stripe 官方安装说明](https://docs.stripe.com/stripe-cli/install)。

安装后首次使用需登录（会打开浏览器绑定 Stripe 账号）：

```bash
stripe login
```

#### 转发 Webhook 到本机

1. 确保项目已启动：`npm run dev`（本机 3000 端口在跑）。
2. **新开一个终端**，执行：
   ```bash
   stripe listen --forward-to localhost:3000/api/payment/webhook
   ```
3. 终端里会打印一行类似：
   ```text
   Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. 复制 **whsec_ 开头** 的整串，粘贴到项目根目录的 `.env` 中，作为本地 webhook 密钥：
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
5. 若 `.env` 里已有 `STRIPE_WEBHOOK_SECRET`（例如线上用的），可暂时改成上面这串，测完再改回；或另建 `.env.local` 覆盖（Next.js 会优先读 `.env.local`）。
6. 保持 **`stripe listen` 这个终端一直开着**，不要关；需要测 webhook 时都先运行它。

#### 用测试卡完成支付

1. 浏览器打开 `http://localhost:3000`，登录后进入定价页，支付方式选「**信用卡 (Stripe)**」，点击购买。
2. 跳转到 Stripe 结账页后，使用 [Stripe 测试卡](https://docs.stripe.com/testing#cards)：
   - 卡号：`4242 4242 4242 4242`
   - 过期：任意未来日期（如 12/34）
   - CVC：任意 3 位（如 123）
   - 邮编：任意
3. 提交付款后，Stripe 会把 `checkout.session.completed` 发到本机，`stripe listen` 会转发到 `localhost:3000/api/payment/webhook`，你的应用会加积分；在运行 `npm run dev` 的终端里可看到日志。

### 7.4 支付宝本地测试（推荐用沙箱）

1. **使用沙箱**（不扣真实钱）  
   - 打开 [支付宝开放平台-沙箱](https://open.alipay.com/develop/sandbox/app)，获取沙箱 **AppID**、**应用私钥**、**支付宝公钥**。  
   - 在 `.env` 配置沙箱参数，并指定沙箱网关：
   ```bash
   ALIPAY_APP_ID=沙箱AppID
   ALIPAY_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
   ALIPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
   ALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do
   ```
   - 沙箱账号与收款信息在沙箱页面有说明，用于登录支付宝沙箱钱包付款。

2. **暴露本机给支付宝**  
   - 用 7.1 的方式启动 ngrok/cloudflared，保证 `https://你的穿透域名` 能访问到本机 3000 端口。  
   - `.env` 中 `NEXTAUTH_URL=https://你的穿透域名`（见 7.2）。

3. **配置异步通知（沙箱/正式同理）**  
   - 在支付宝开放平台该应用下，把「电脑网站支付」的 **异步通知地址** 设为：  
     `https://你的穿透域名/api/payment/alipay/notify`  
   - 例如：`https://abc123.ngrok-free.app/api/payment/alipay/notify`

4. **测试流程**  
   - 浏览器访问 **穿透后的地址**（不要访问 localhost），登录后进入定价页，选「支付宝」并选套餐。  
   - 会跳转到支付宝（沙箱）收银台，用沙箱买家账号付款。  
   - 付款成功后支付宝会：  
     - 跳回你的 `return_url`（支付成功页）；  
     - 后台 POST 到 `notify_url`，你本地服务收到后加积分。  
   - 若未加积分，看终端里 `[Alipay Notify]` 的日志；确认 notify 的 URL 在开放平台填的是穿透地址且能外网访问。

### 7.5 微信支付本地测试

1. **暴露本机**  
   - 同样用 7.1 做内网穿透，`.env` 里 `NEXTAUTH_URL=https://你的穿透域名`（7.2）。

2. **配置通知 URL**  
   - 在微信商户平台「开发配置」里，把 **支付结果通知 URL** 设为：  
     `https://你的穿透域名/api/payment/wechat/notify`  
   - 例如：`https://abc123.ngrok-free.app/api/payment/wechat/notify`

3. **测试流程**  
   - 浏览器访问 **穿透后的地址**，定价页选「微信扫码」并选套餐，页面会弹出二维码。  
   - 用微信扫码并完成付款（需使用已开通微信支付的微信账号）。  
   - 微信会 POST 到上述 notify URL，本地服务验签解密后加积分。

4. **仅测“下单 + 出码”**  
   - 若暂时不配证书/密钥，只测「选微信 → 选套餐 → 弹出二维码」：需至少配置 `WECHAT_PAY_*` 环境变量，否则接口会报错。  
   - 不配置通知 URL 时，扫码付款后不会收到回调，积分不会增加，但可验证创建订单与前端展示是否正常。

### 7.6 本地测试检查清单

- [ ] 已用 ngrok/cloudflared 等把本机 3000 暴露为 `https://你的穿透域名`。
- [ ] `.env` 中 `NEXTAUTH_URL=https://你的穿透域名`（不要用 localhost）。
- [ ] 支付宝：已用沙箱 AppID/密钥，并设置 `ALIPAY_GATEWAY` 为沙箱；开放平台异步通知地址为 `https://你的穿透域名/api/payment/alipay/notify`。
- [ ] 微信：商户平台支付结果通知 URL 为 `https://你的穿透域名/api/payment/wechat/notify`。
- [ ] 访问与付款都使用「穿透后的 HTTPS 地址」，而不是 localhost。
