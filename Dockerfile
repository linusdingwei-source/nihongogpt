# 阿里云部署用 Dockerfile（中国大陆版本）
# 构建: docker build -t nihongogpt-cn .
# 运行: docker run -p 3000:3000 --env-file .env.aliyun nihongogpt-cn

FROM node:20-alpine AS base

# 依赖阶段
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# 构建阶段（不需要数据库连接）
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 仅生成 Prisma Client，迁移/建表在部署时或启动脚本执行
RUN npx prisma generate
RUN npx next build

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
# 确保动态加载的 OSS 依赖在镜像中（standalone 可能未包含）
RUN npm install ali-oss --omit=dev --ignore-scripts && rm -rf /root/.npm
RUN chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
