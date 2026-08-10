# syntax=docker/dockerfile:1
#
# uop-web — LicenseOps SPA served by nginx, which also reverse-proxies /api/*
# to the api container so the whole app is ONE origin (ADR-0012: SameSite=Strict
# session cookie needs same-origin). Build context = repo ROOT — src/index.css
# @imports design_handoff_licenseops tokens from the root. From repo root:
#   docker build -f apps/web/Dockerfile -t uop-web .

# ---------- build ----------
FROM node:20-slim AS build
WORKDIR /app
# Both app manifests so the root lockfile resolves; --workspace scopes install to
# web (keeps api's argon2/prisma out of this image).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=@uop/web
COPY apps/web ./apps/web
# Read-only design tokens the web build @imports (NOT copied at dev time either).
COPY design_handoff_licenseops ./design_handoff_licenseops
WORKDIR /app/apps/web
# 🔴 No VITE_ENTRA_* build args since ADR-0028. SSO configuration (client id /
# tenant / redirect URI / secret) is read by the API from its own environment at
# RUNTIME, so this image is identical across every environment and an Entra
# config change no longer means a rebuild. VITE_API_BASE_URL defaults to '/api'
# (same-origin via nginx) so it is left unset too.
RUN npm run build            # tsc --noEmit && vite build -> apps/web/dist

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime
# envsubst template: the nginx image entrypoint renders templates/*.template into
# conf.d, substituting ${API_UPSTREAM} (an env var). nginx's own $uri/$host are
# NOT env vars, so they survive substitution.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
