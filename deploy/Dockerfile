# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/extension/package.json ./apps/extension/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build -w @privacylens/api && npm run build -w @privacylens/web

# Separate, manually invoked release job; not the runtime service's startup.
FROM build AS migration
USER node
CMD ["npm", "run", "db:migrate", "-w", "@privacylens/api"]

FROM build AS runtime-deps
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS api
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
COPY --from=runtime-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/packages/shared ./packages/shared
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/ready',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]

FROM caddy:2-alpine AS web
COPY --from=build /app/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
