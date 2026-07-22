# syntax=docker/dockerfile:1
#
# uop-api — NestJS System of Action (ADR-0012 UAT topology).
# Build context = repo ROOT (npm workspace). From repo root:
#   docker build -f apps/api/Dockerfile -t uop-api .
#
# Migrations/seed are NOT run inside this image. Run `prisma migrate deploy`
# from the operator/pipeline against the UAT DB — see
# docs/13-deployment/04-deploy-runbook.md. This image only runs the app.

# ---------- build ----------
FROM node:20-slim AS build
WORKDIR /app
# openssl: required by the Prisma engine at generate time.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# Workspace manifests first for layer caching. Both app manifests are copied so
# the single root lockfile resolves; --workspace scopes the actual install.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=@uop/api
# API source (includes prisma/schema.prisma) then generate client + compile.
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build            # nest build -> apps/api/dist

# ---------- runtime ----------
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace=@uop/api
# Generated Prisma client + query engine from the build stage (hoisted to the
# root node_modules by the workspace). @prisma/client itself comes from npm ci.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
# main.ts listens on PORT ?? 3000; ACA ingress targetPort must match (default 3000).
EXPOSE 3000
CMD ["node", "dist/main"]
