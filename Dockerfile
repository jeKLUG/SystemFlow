# Systemhaus-Ess – API + gebautes Frontend
FROM node:22-bookworm-slim AS build

WORKDIR /app
# Kleine VPS: TypeScript/Vite brauchen ausreichend Heap (sonst „hängt“ tsc im Swap)
ENV NODE_OPTIONS="--max-old-space-size=2048"

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm install

COPY apps/api ./apps/api
COPY apps/web ./apps/web

RUN echo "==> Web bauen…" \
  && npm run build -w @systemhaus/web \
  && echo "==> API bauen (tsc)…" \
  && npm run build -w @systemhaus/api \
  && echo "==> DevDependencies entfernen…" \
  && npm prune --omit=dev \
  && echo "==> Build fertig"

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/systemhaus.sqlite \
    WEB_DIST=/app/apps/web/dist

RUN apt-get update && apt-get install -y --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "apps/api/dist/index.js"]
