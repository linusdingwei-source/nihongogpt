# 中国大陆版本：从 Vercel 迁移到阿里云

本文说明如何将本项目部署到阿里云，作为面向中国大陆用户的版本（与 Vercel 国际版可并行存在）。

## 一、架构对比

| 能力       | Vercel 国际版        | 阿里云中国大陆版           |
|------------|----------------------|----------------------------|
| 计算       | Vercel Serverless    | SAE / ECS / 函数计算       |
| 数据库     | Supabase (AWS)       | 阿里云 RDS PostgreSQL      |
| 文件存储   | Vercel Blob          | 阿里云 OSS                 |
| 大模型/TTS | DashScope（可继续用）| 阿里云灵积 DashScope       |

项目已支持多存储（`STORAGE_PROVIDER=aliyun-oss`）和多环境，迁移主要是**换运行环境 + 数据库 + 存储**，代码无需大改。

## 二、前置准备

### 1. 阿里云账号与资源

- 阿里云账号（完成实名）
- 若对外提供 Web 服务且使用域名，需完成 **ICP 备案**
- 开通：
  - **RDS PostgreSQL**（数据库）
  - **OSS**（对象存储，用于 TTS 等文件）
  - **SAE（Serverless 应用引擎）** 或 **ECS**（运行 Next.js 应用）

### 2. 本地/CI 环境

- Node 20、npm
- 已安装依赖：`npm install`（已包含 `ali-oss`，用于 OSS 上传）

## 三、数据库（RDS PostgreSQL）

1. 在 RDS 控制台创建 **PostgreSQL** 实例（建议 15 或以上），选择与 SAE/ECS 同地域（如华东1）。
2. 创建数据库和账号，记下：
   - 内网地址：`rm-xxxxx.pg.rds.aliyuncs.com`
   - 端口：`5432`
   - 数据库名、用户名、密码
3. 配置 **白名单**：将运行应用的 SAE/ECS 的 IP 或 VPC 网段加入 RDS 白名单。
4. 环境变量（应用直连，用于 Prisma 查询）：
   ```bash
   DATABASE_URL="postgresql://用户名:密码@rm-xxxxx.pg.rds.aliyuncs.com:5432/数据库名"
   ```
   迁移/建表若需直连，可再设：
   ```bash
   DIRECT_URL="postgresql://用户名:密码@rm-xxxxx.pg.rds.aliyuncs.com:5432/数据库名"
   ```
5. 在**能访问该 RDS 的机器**上执行迁移（与 Vercel 构建环境分离）：
   ```bash
   export DATABASE_URL="postgresql://..."
   export DIRECT_URL="postgresql://..."   # 可选
   npx prisma migrate deploy
   # 或首次建表：npx prisma db push
   ```

## 四、对象存储（OSS）

1. 在 OSS 控制台创建 **Bucket**（如华东1），选“公共读”或按需配置读写策略。
2. 创建 **RAM 用户**，授予该 Bucket 的读写权限（如 `AliyunOSSFullAccess` 或自定义策略），拿到 AccessKeyId / AccessKeySecret。
3. 在应用环境变量中配置：
   ```bash
   STORAGE_PROVIDER=aliyun-oss
   OSS_REGION=oss-cn-hangzhou
   OSS_BUCKET=your-bucket-name
   OSS_ACCESS_KEY_ID=xxx
   OSS_ACCESS_KEY_SECRET=xxx
   ```
   TTS 等上传会走 OSS，不再依赖 Vercel Blob。

## 五、部署 Next.js 应用

### 方式 A：SAE（Serverless 应用引擎，推荐）

1. **构建镜像**  
   在项目根目录：
   ```bash
   docker build -t nihongogpt-cn:latest .
   ```
   推送到 **ACR（容器镜像服务）**：
   ```bash
   docker tag nihongogpt-cn:latest registry.cn-hangzhou.aliyuncs.com/你的命名空间/nihongogpt-cn:latest
   docker push registry.cn-hangzhou.aliyuncs.com/你的命名空间/nihongogpt-cn:latest
   ```

2. **创建 SAE 应用**  
   - 应用来源：选择“镜像”，使用上一步的 ACR 镜像。  
   - 端口：`3000`。  
   - 环境变量：把 `.env.aliyun.example` 中的变量在 SAE “应用配置”里逐项添加（或使用“配置文件”挂载）。  
   - 健康检查：HTTP 路径如 `/` 或 `/api/health`（若你有），端口 3000。

3. **发布与访问**  
   - 发布版本后，SAE 会分配公网/私网地址，可将 `NEXTAUTH_URL` 设为该地址；若用自有域名，在 SAE 绑定域名并配置解析（需备案）。

### 方式 B：ECS + Docker

1. 购买 ECS（建议与 RDS、OSS 同地域），系统选 Linux（如 Alibaba Cloud Linux 2）。
2. 安装 Docker，拉取并运行镜像：
   ```bash
   docker pull registry.cn-hangzhou.aliyuncs.com/你的命名空间/nihongogpt-cn:latest
   docker run -d -p 3000:3000 --env-file /path/to/.env.aliyun --name nihongogpt nihongogpt-cn:latest
   ```
3. 使用 Nginx/Caddy 做反向代理并配置 HTTPS（建议用阿里云 SSL 证书）。

### 方式 C：函数计算（FC）

适合轻量、无状态接口；Next.js 全栈（SSR、API、Prisma）需要自定义运行时或封装为 HTTP 函数，配置相对复杂。若你已有 FC 经验，可基于当前 `output: 'standalone'` 构建产物制作自定义运行时镜像并配置 HTTP 触发器。

## 六、环境变量汇总（中国大陆版）

必配项：

- `DATABASE_URL`：RDS PostgreSQL 连接串  
- `DIRECT_URL`：（可选）迁移用直连  
- `AUTH_SECRET`：随机密钥（如 `openssl rand -base64 32`）  
- `NEXTAUTH_URL`：站点完整 URL  
- `STORAGE_PROVIDER=aliyun-oss`  
- `OSS_REGION`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`  
- `DASHSCOPE_API_KEY`：灵积（DashScope）API Key  

可选：

- 邮件（验证码）：`RESEND_*` 或改为阿里云 DM/SMTP  
- 支付：Stripe 相关（大陆可改用支付宝等，需自行对接）  
- `NEXT_PUBLIC_SITE_URL`、Google 登录等  

完整示例见 **`.env.aliyun.example`**。

## 七、与 Vercel 的差异与注意点

1. **构建**  
   - 当前 Vercel 使用 `regions: ["hkg1"]` 和 `prisma db push`。  
   - 阿里云镜像构建时**不连数据库**，仅执行 `prisma generate` + `next build`；数据库迁移在 RDS 上单独执行（见第三节）。

2. **Prisma**  
   - 项目使用 `@prisma/adapter-pg` + `DATABASE_URL`，无需 Vercel Data Proxy；在阿里云直接连 RDS 即可。

3. **存储**  
   - Vercel 使用 `@vercel/blob`；大陆版通过 `STORAGE_PROVIDER=aliyun-oss` 使用 OSS，代码已支持，只需配置 OSS 环境变量。

4. **域名与备案**  
   - 在中国大陆对公提供 Web 服务需 ICP 备案；仅内网或测试可暂不备案。

5. **双版本并行**  
   - 国际版继续用 Vercel + Supabase + Vercel Blob；大陆版使用阿里云 RDS + OSS + SAE/ECS，两套环境变量、两套部署流水线即可。

## 八、简要检查清单

- [ ] RDS PostgreSQL 已创建，白名单已放行 SAE/ECS  
- [ ] `DATABASE_URL` / `DIRECT_URL` 已配置，并已执行 `prisma migrate deploy` 或 `db push`  
- [ ] OSS Bucket 已创建，RAM 密钥已配置，`STORAGE_PROVIDER=aliyun-oss` 及 OSS_* 已设置  
- [ ] `AUTH_SECRET`、`NEXTAUTH_URL` 已设置  
- [ ] `DASHSCOPE_API_KEY` 已配置（TTS/LLM）  
- [ ] Docker 镜像已构建并推送到 ACR，SAE/ECS 使用该镜像并注入上述环境变量  
- [ ] 若对外使用域名，已完成备案并配置解析与 HTTPS  

完成以上步骤后，即可在中国大陆独立运行本项目；与 Vercel 版本可共享同一代码仓库，仅通过不同环境变量和部署目标区分。
