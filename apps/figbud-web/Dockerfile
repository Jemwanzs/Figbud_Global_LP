# syntax=docker/dockerfile:1.7
# Build context: repository root (the app depends on shared workspace packages).
#   docker build -f apps/figbud-web/Dockerfile -t figbud-web .

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/figbud-web/package.json apps/figbud-web/
COPY packages/brand/package.json packages/brand/
COPY packages/i18n/package.json packages/i18n/
COPY packages/ui/package.json packages/ui/
RUN npm ci --workspace figbud-web --include-workspace-root

FROM node:22-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined at build time, so they are build arguments.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ALLOW_INDEXING=false
ARG NEXT_PUBLIC_ZIRAHR_URL
ARG NEXT_PUBLIC_JASIRI_URL
ARG NEXT_PUBLIC_EXPENSE_NOW_URL
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT_STANDALONE=true
RUN npm run build -w figbud-web

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S figbud && adduser -S figbud -G figbud
COPY --from=build --chown=figbud:figbud /repo/apps/figbud-web/.next/standalone ./
COPY --from=build --chown=figbud:figbud /repo/apps/figbud-web/.next/static ./apps/figbud-web/.next/static
COPY --from=build --chown=figbud:figbud /repo/apps/figbud-web/public ./apps/figbud-web/public
USER figbud
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
    CMD wget -qO- "http://127.0.0.1:${PORT}/en" >/dev/null || exit 1
CMD ["node", "apps/figbud-web/server.js"]
