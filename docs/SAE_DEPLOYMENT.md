# SAE 部署方案与详细说明

本文档面向 **阿里云 Serverless 应用引擎（SAE）**，给出从零到上线的完整方案与逐步操作说明。

---

## 一、整体架构与流程

```
┌─────────────────────────────────────────────────────────────────┐
│  用户 / 域名                                                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  SAE（Serverless 应用引擎）                                       │
│  · 运行 Next.js 容器（镜像来自 ACR）                              │
│  · 弹性伸缩、公网/私网访问、健康检查                              │
└───────────┬─────────────────────────────┬───────────────────────┘
            │                             │
            ▼                             ▼
┌───────────────────────┐     ┌───────────────────────┐
│  RDS PostgreSQL       │     │  阿里云 OSS            │
│  · 业务数据、用户、卡片│     │  · TTS 音频等文件存储  │
└───────────────────────┘     └───────────────────────┘
```

**部署流程概览：**

1. 在阿里云创建并配置 **RDS PostgreSQL**、**OSS**、**ACR 镜像仓库**。
2. 本地或 CI 构建 Docker 镜像并推送到 ACR。
3. 在 SAE 创建应用，选择该镜像，配置环境变量、端口、健康检查。
4. 执行数据库迁移，发布应用，用 SAE 公网地址或自有域名访问。

---

## 二、前置条件

- 阿里云账号（已完成实名认证）。
- 本地已安装：**Node.js 20**、**npm**、**Docker**。
- 若对外使用自有域名：需完成 **ICP 备案**（仅用 SAE 临时域名可先不备案）。

---

## 三、第一步：创建 RDS PostgreSQL

### 3.1 购买实例

1. 登录 [阿里云 RDS 控制台](https://rdsnext.console.aliyun.com/)。
2. 选择地域：建议 **华东1（杭州）**，与后续 SAE、OSS 保持一致。
3. 点击 **创建实例**：
   - **数据库类型**：PostgreSQL。
   - **版本**：15 或 16。
   - **系列**：基础版即可（或按需选高可用版）。
   - **规格**：如 1 核 2GB 起。
   - **存储**：按需，20GB 起。
4. **网络类型**：选 **专有网络 VPC**，并记下 **VPC ID** 和 **vSwitch ID**（后面 SAE 需与 RDS 同 VPC 才能内网访问）。
5. 设置 **白名单**：先保留默认或添加 `0.0.0.0/0` 做测试（上线后建议改为 SAE 所在 VPC 网段）。
6. 设置 **账号与密码**：高权限账号名、密码（务必保存）。
7. 提交订单并等待实例 **运行中**。

### 3.2 创建数据库与账号

1. 在实例列表点击实例 ID 进入 **实例详情**。
2. 左侧 **数据库管理** → **创建数据库**：
   - 数据库名：如 `nihongogpt`。
3. 左侧 **账号管理** 确认已有高权限账号，或新建一个仅用于本应用的账号（建议单独账号 + 强密码）。

### 3.3 获取连接信息

- **内网地址**：实例详情页 **连接地址**（如 `pg-xxxxx.pg.rds.aliyuncs.com`）。
- **端口**：一般为 `5432`。
- **连接串格式**：
  ```text
  postgresql://账号:密码@内网地址:5432/数据库名
  ```
- 若密码中含特殊字符，需 URL 编码（如 `@` → `%40`）。

示例（请替换为实际值）：

```text
DATABASE_URL="postgresql://myuser:MyP%40ss@pg-xxxxx.pg.rds.aliyuncs.com:5432/nihongogpt"
DIRECT_URL="postgresql://myuser:MyP%40ss@pg-xxxxx.pg.rds.aliyuncs.com:5432/nihongogpt"
```

---

## 四、第二步：创建 OSS Bucket

### 4.1 创建 Bucket

1. 打开 [OSS 控制台](https://oss.console.aliyun.com/)。
2. **Bucket 列表** → **创建 Bucket**：
   - **地域**：与 RDS、SAE 一致，如 **华东1（杭州）**。
   - **Bucket 名称**：全局唯一，如 `nihongogpt-cn-audio`。
   - **存储类型**：标准存储。
   - **读写权限**：**公共读**（便于 TTS 生成的音频 URL 直接访问）；若仅内网用可选私有。
3. 创建完成记下 **Bucket 名称** 和 **地域 Region**（如 `oss-cn-hangzhou`）。

### 4.2 创建 RAM 用户并授权

1. 打开 [RAM 控制台](https://ram.console.aliyun.com/) → **身份管理** → **用户** → **创建用户**。
2. 登录名称：如 `sae-oss-nihongogpt`，**勾选 OpenAPI 调用**。
3. 保存 **AccessKey ID** 和 **AccessKey Secret**（只显示一次，务必保存）。
4. **用户** → 找到该用户 → **添加权限**：
   - 可先选 **AliyunOSSFullAccess**（仅该 Bucket 更安全，需自定义策略）。
5. 若只授权单个 Bucket，可使用如下自定义策略（将 `your-bucket-name` 换成实际 Bucket 名）：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["oss:*"],
      "Resource": ["acs:oss:*:*:your-bucket-name", "acs:oss:*:*:your-bucket-name/*"]
    }
  ]
}
```

记下：`OSS_REGION`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`。

---

## 五、第三步：ACR 镜像仓库与推送镜像

### 5.1 创建命名空间与镜像仓库

1. 打开 [容器镜像服务 ACR 控制台](https://cr.console.aliyun.com/)。
2. 选择 **个人实例**（或企业版），地域选 **华东1（杭州）**。
3. **命名空间** → **创建命名空间**，如 `nihongogpt`。
4. **镜像仓库** → **创建镜像仓库**：
   - 命名空间：刚创建的。
   - 仓库名称：如 `app`。
   - 摘要：可选。
   - 类型：**私有** 即可。
5. 创建完成后，在仓库详情页可以看到 **公网/内网拉取地址**，例如：
   ```text
   registry.cn-hangzhou.aliyuncs.com/nihongogpt/app:latest
   ```

### 5.2 登录 ACR

在终端执行（将 `registry.cn-hangzhou.aliyuncs.com` 换成你的实例公网地址）：

```bash
docker login registry.cn-hangzhou.aliyuncs.com
# 输入阿里云账号（或 RAM 子账号）及密码
```

### 5.3 构建并推送镜像

在**项目根目录**执行：

```bash
# 构建（约几分钟）
docker build -t nihongogpt-cn:latest .

# 打标签为 ACR 地址（替换为你的命名空间/仓库名）
docker tag nihongogpt-cn:latest registry.cn-hangzhou.aliyuncs.com/nihongogpt/app:latest

# 推送
docker push registry.cn-hangzhou.aliyuncs.com/nihongogpt/app:latest
```

推送成功后，在 ACR 控制台该仓库的 **镜像版本** 中能看到 `latest`。

---

## 六、第四步：执行数据库迁移

在**能访问 RDS 内网或已放行你 IP 的机器**上执行（本地需 RDS 白名单包含你出口 IP，或在一台与 RDS 同 VPC 的 ECS 上执行）：

```bash
cd /path/to/nihongogpt

# 设置连接串（替换为实际值）
export DATABASE_URL="postgresql://账号:密码@RDS内网地址:5432/数据库名"
export DIRECT_URL="$DATABASE_URL"

# 若有 migrations 目录，使用迁移
npx prisma migrate deploy

# 若无迁移文件（开发阶段或仅同步 Schema），可使用
# npx prisma db push
```

执行成功即表结构已就绪，SAE 内的应用启动后即可连库。

---

## 七、第五步：在 SAE 创建并配置应用

### 7.1 进入 SAE 控制台

1. 打开 [SAE 控制台](https://sae.console.aliyun.com/)。
2. 地域选择与 RDS、OSS、ACR 一致，如 **华东1（杭州）**。

### 7.2 创建应用

1. **应用列表** → **创建应用**。
2. **应用基本信息**：
   - **应用名称**：如 `nihongogpt`。
   - **命名空间**：选择或新建一个（如 `default`）。
   - **应用描述**：可选。

3. **应用部署配置**：
   - **部署方式**：**镜像**。
   - **镜像**：选择 **阿里云 ACR**，地域与命名空间选好，**镜像仓库** 选前面创建的（如 `nihongogpt/app`），**镜像版本** 选 `latest`。
   - **镜像拉取**：若为私有仓库，需在 **同一账号** 下，SAE 会使用当前账号拉取；跨账号需配置镜像仓库凭证。

4. **资源与实例**：
   - **CPU**：如 0.5 核。
   - **内存**：如 1 GiB。
   - **实例数**：最小 1，最大可按需调大（如 4），便于弹性伸缩。

5. **网络配置**：
   - **VPC**：选与 RDS **同一 VPC**，这样应用才能通过内网连 RDS。
   - **vSwitch**：选同一 VPC 下的交换机（可与 RDS 同可用区或同 VPC 下其他可用区）。
   - **公网访问**：勾选 **启用**，这样会分配公网 SLB 地址，可直接用该地址访问；若仅内网访问可不勾选。

6. **端口与健康检查**：
   - **应用端口**：`3000`（与 Dockerfile 中 `EXPOSE 3000` 一致）。
   - **协议**：HTTP。
   - **健康检查**：
     - 类型：**HTTP**。
     - 路径：`/api/health`（项目已提供该接口）。
     - 端口：`3000`。
     - 其他可默认（如检查间隔 10 秒、超时 5 秒、成功阈值 1、失败阈值 3）。

### 7.3 环境变量配置

在 **应用创建** 或 **应用详情 → 配置与部署 → 环境变量** 中，添加以下变量（值与前面步骤一致）：

| 键 | 说明 | 示例/备注 |
|----|------|-----------|
| `DATABASE_URL` | RDS 连接串 | `postgresql://user:pass@pg-xxx.pg.rds.aliyuncs.com:5432/nihongogpt` |
| `DIRECT_URL` | 同 DATABASE_URL 或直连地址 | 同上 |
| `AUTH_SECRET` | 随机密钥 | `openssl rand -base64 32` 生成 |
| `NEXTAUTH_URL` | 站点 URL | 先填 SAE 公网地址，见下节 |
| `STORAGE_PROVIDER` | 固定 | `aliyun-oss` |
| `OSS_REGION` | OSS 地域 | `oss-cn-hangzhou` |
| `OSS_BUCKET` | Bucket 名 | `nihongogpt-cn-audio` |
| `OSS_ACCESS_KEY_ID` | RAM 用户 AccessKey | 前面保存的 |
| `OSS_ACCESS_KEY_SECRET` | RAM 用户 Secret | 前面保存的 |
| `DASHSCOPE_API_KEY` | 灵积 API Key | 阿里云 DashScope 控制台获取 |
| `NEXT_PUBLIC_SITE_URL` | 前端站点 URL | 与 NEXTAUTH_URL 一致即可 |

可选：邮件、支付、Google 登录等，见 `.env.aliyun.example`。

生成 `AUTH_SECRET`：

```bash
openssl rand -base64 32
```

### 7.4 创建并发布

1. 确认配置无误后点击 **创建** 或 **确认**。
2. 应用创建后会进入 **版本详情** 或 **应用详情**。
3. 若未自动部署，在 **版本管理** 中为该版本点击 **部署**，选择 **部署策略**（如立即发布）。
4. 等待 **运行中**，在 **应用详情** 或 **公网访问** 处查看 **公网 SLB 地址**，形如：
   ```text
   http://xxxxx.cn-hangzhou.sae.aliyuncs.com
   ```
   或带端口，如 `http://xxxxx.cn-hangzhou.sae.aliyuncs.com:8080`（以控制台显示为准）。

### 7.5 设置 NEXTAUTH_URL 与 NEXT_PUBLIC_SITE_URL

拿到公网地址后（若为 80 端口可省略 `:80`）：

1. 在 SAE **环境变量** 中把 `NEXTAUTH_URL` 和 `NEXT_PUBLIC_SITE_URL` 设为该地址，例如：
   ```text
   NEXTAUTH_URL=http://xxxxx.cn-hangzhou.sae.aliyuncs.com
   NEXT_PUBLIC_SITE_URL=http://xxxxx.cn-hangzhou.sae.aliyuncs.com
   ```
2. 若使用 **HTTPS 或自有域名**，改为：
   ```text
   NEXTAUTH_URL=https://你的域名
   NEXT_PUBLIC_SITE_URL=https://你的域名
   ```
3. 修改环境变量后需 **重新部署** 当前版本或发布新版本才会生效。

---

## 八、第六步：验证与访问

1. 浏览器访问 **公网地址**（如 `http://xxxxx.cn-hangzhou.sae.aliyuncs.com`）。
2. 访问 `http://xxxxx.cn-hangzhou.sae.aliyuncs.com/api/health`，应返回：
   ```json
   { "status": "ok", "timestamp": "..." }
   ```
3. 正常打开首页、登录、生成卡片、TTS 等，确认数据库与 OSS 均正常。

---

## 九、使用自有域名（可选）

1. **备案**：域名需在阿里云完成 ICP 备案。
2. **解析**：在域名解析里添加 **CNAME**，指向 SAE 提供的 **公网 SLB 域名**（或按 SAE 文档绑定自定义域名）。
3. **SAE 绑定域名**：在 SAE 应用 **公网访问** / **域名绑定** 中绑定你的域名。
4. **HTTPS**：在 SAE 或 SLB 配置 **SSL 证书**（阿里云可申请免费 DV 证书）。
5. 将环境变量中的 `NEXTAUTH_URL`、`NEXT_PUBLIC_SITE_URL` 改为 `https://你的域名`，并重新部署。

---

## 十、后续发布（更新应用）

代码或配置变更后，重新构建并推送镜像，再在 SAE 用新镜像发布即可：

```bash
docker build -t nihongogpt-cn:latest .
docker tag nihongogpt-cn:latest registry.cn-hangzhou.aliyuncs.com/nihongogpt/app:latest
docker push registry.cn-hangzhou.aliyuncs.com/nihongogpt/app:latest
```

在 SAE 控制台：

1. **应用详情** → **版本管理** → **基于镜像创建新版本**（或重新选择镜像版本）。
2. **部署** 新版本，选择发布策略（灰度/分批/全量）。

若 Prisma 有新增迁移，需在能连 RDS 的环境再执行一次：

```bash
export DATABASE_URL="..."
npx prisma migrate deploy
```

---

## 十一、故障排查简表

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 应用一直重启 / 不健康 | 健康检查失败、端口不对 | 确认端口 3000、路径 `/api/health` 可访问；看 SAE 日志 |
| 无法连接数据库 | RDS 白名单、VPC 不同、连接串错误 | SAE 与 RDS 同 VPC；白名单包含 SAE 网段；检查 DATABASE_URL 编码 |
| TTS/上传失败 | OSS 配置错误、权限不足 | 核对 OSS_* 与 RAM 权限、Bucket 名与地域 |
| 登录/回调异常 | NEXTAUTH_URL 错误 | 与真实访问地址一致（含协议、端口、域名） |

---

## 十二、检查清单（上线前）

- [ ] RDS PostgreSQL 已创建，白名单允许 SAE 所在 VPC 访问
- [ ] OSS Bucket 与 RAM 密钥已创建，并已配置 STORAGE_PROVIDER=aliyun-oss 及 OSS_*
- [ ] 已在可访问 RDS 的机器执行 `prisma migrate deploy`（或 `db push`）
- [ ] Docker 镜像已构建并推送到 ACR，SAE 使用该镜像
- [ ] SAE 应用端口 3000、健康检查 `/api/health`、VPC 与 RDS 一致
- [ ] 所有必选环境变量已填（DATABASE_URL、AUTH_SECRET、NEXTAUTH_URL、OSS_*、DASHSCOPE_API_KEY）
- [ ] 公网访问或自有域名可打开站点，/api/health 返回 ok

完成以上步骤后，SAE 方案即可稳定运行；与 Vercel 国际版可共用同一代码库，仅部署目标与环境变量不同。
