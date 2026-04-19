# ---------- Stage 1: builder ----------
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
RUN npm ci

COPY packages ./packages
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
RUN npm ci --omit=dev

COPY packages/shared/src ./packages/shared/src
COPY packages/server/src ./packages/server/src
COPY --from=builder /app/packages/client/dist ./packages/client/dist

EXPOSE 3000

CMD ["node", "packages/server/src/index.js"]
