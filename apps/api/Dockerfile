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
# BUG-008: the entrypoint runs `node dist/main`, and a green build does NOT mean
# that file exists — tsc silently relocates the emit root when a .ts outside src/
# joins the compile set. Every gate we had (626 tests, lint, nest build, az acr
# build) passed while shipping an image that crash-looped on every start. This
# line is the only one that would have caught it, so it stays.
RUN test -f dist/main.js

# ---------- runtime ----------
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# Full install WITH devDependencies: the entrypoint's optional self-migrate/seed
# (RUN_MIGRATIONS_ON_START / RUN_SEED_ON_START) needs the prisma CLI + ts-node,
# which are devDependencies. --include=dev is REQUIRED because ENV NODE_ENV=production
# (set above, needed at runtime for Secure cookies) would otherwise make npm ci omit
# them — leaving `npm run seed` (ts-node) with no ts-node. Fatter image, but it lets
# the container migrate + seed itself where the operator can't reach the DB (W33).
RUN npm ci --workspace=@uop/api --include=dev
# Generated Prisma client + query engine from the build stage (hoisted to the
# root node_modules by the workspace).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
# prisma schema + migrations + seed.ts — needed by the optional self-migrate/seed.
COPY apps/api/prisma ./apps/api/prisma
# tsconfig — the seed runs via ts-node (`npm run seed`), which needs it.
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./apps/api/
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
WORKDIR /app/apps/api
# main.ts listens on PORT ?? 3000; ACA ingress targetPort must match (default 3000).
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
