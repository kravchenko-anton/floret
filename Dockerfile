
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S floret && adduser -S floret -G floret
COPY --from=build --chown=floret:floret /app/dist ./dist
COPY --from=build --chown=floret:floret /app/node_modules ./node_modules
COPY --from=build --chown=floret:floret /app/package.json ./package.json
USER floret
EXPOSE 3000
CMD ["node", "dist/main.js"]
