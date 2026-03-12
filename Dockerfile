# 阿里云部署用 Dockerfile（中国大陆版本）
# 构建: docker build -t nihongogpt-cn .
# 指定 ACR 基础镜像: docker build --build-arg BASE_IMAGE=bgil-pai-eas-registry.cn-shanghai.cr.aliyuncs.com/<namespace>/node:20-alpine -t nihongogpt-cn .
# 运行: docker run -p 3000:3000 --env-file .env.aliyun nihongogpt-cn

#ARG BASE_IMAGE=bgil-pai-eas-registry.cn-shanghai.cr.aliyuncs.com/qwen-vl-7b/node:20-alpine
#FROM ${BASE_IMAGE} AS base
FROM node:20-alpine AS base

# 依赖阶段
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm config set registry https://registry.npmmirror.com && npm ci --ignore-scripts
# 构建阶段（不需要数据库连接）
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 仅生成 Prisma Client，迁移/建表在部署时或启动脚本执行
RUN npx prisma generate
RUN DATABASE_URL="postgresql://mock:mock@localhost:5432/mock" \
    AUTH_SECRET="mock_secret" \
    NEXTAUTH_URL="http://localhost:3000" \
    GOOGLE_CLIENT_ID="mock_client_id" \
    GOOGLE_CLIENT_SECRET="mock_client_secret" \
    npx next build

# 生产运行阶段
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# 确保 prisma schema 在运行时存在，以便执行迁移
COPY --from=builder /app/prisma ./prisma
# 复制 Prisma 配置文件
COPY --from=builder /app/prisma.config.ts ./
# 确保动态加载的 OSS 依赖在镜像中（standalone 可能未包含）
RUN npm install ali-oss --omit=dev --ignore-scripts && rm -rf /root/.npm
RUN chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
