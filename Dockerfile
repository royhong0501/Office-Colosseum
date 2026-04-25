# ---------- Stage 1: builder ----------
FROM node:22-alpine AS builder
WORKDIR /app

# Prisma 在 alpine 上需要 openssl 才能找到 libssl3，不然 runtime 會 fallback 到 openssl-1.1.x binary 而崩潰
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
RUN npm ci

COPY packages ./packages
# Prisma client 必須在打包前 generate（runtime 也會 generate 一次以對齊 OS libs）
RUN npx --workspace @office-colosseum/server prisma generate
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

# Prisma engine runtime 也要 libssl3
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
RUN npm ci --omit=dev

COPY packages/shared/src ./packages/shared/src
COPY packages/server/src ./packages/server/src
COPY packages/server/prisma ./packages/server/prisma
COPY --from=builder /app/packages/client/dist ./packages/client/dist

# Runtime image 也跑一次 prisma generate（OpenSSL / libc 對齊）
RUN npx --workspace @office-colosseum/server prisma generate

EXPOSE 3000

# 啟動：migrate deploy → seed（idempotent）→ 啟 server
CMD ["sh", "-c", "npx --workspace @office-colosseum/server prisma migrate deploy && npm run db:seed --workspace @office-colosseum/server || true; node packages/server/src/index.js"]
