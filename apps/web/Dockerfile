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
# VITE_* are build-time — vite bakes them into the bundle. Azure UAT uses Entra
# SSO (ADR-0012 D2), so pass the app-registration values as --build-args; they are
# public identifiers (SPA has NO client secret), safe to bake (H4). VITE_API_BASE_URL
# defaults to '/api' (same-origin via nginx) so it is left unset. Leaving the ENTRA
# args empty falls back to the break-glass local-login flow.
ARG VITE_ENTRA_CLIENT_ID=""
ARG VITE_ENTRA_TENANT_ID=""
ARG VITE_ENTRA_API_SCOPE=""
ARG VITE_ENTRA_REDIRECT_URI=""
ENV VITE_ENTRA_CLIENT_ID=$VITE_ENTRA_CLIENT_ID \
    VITE_ENTRA_TENANT_ID=$VITE_ENTRA_TENANT_ID \
    VITE_ENTRA_API_SCOPE=$VITE_ENTRA_API_SCOPE \
    VITE_ENTRA_REDIRECT_URI=$VITE_ENTRA_REDIRECT_URI
RUN npm run build            # tsc --noEmit && vite build -> apps/web/dist

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime
# envsubst template: the nginx image entrypoint renders templates/*.template into
# conf.d, substituting ${API_UPSTREAM} (an env var). nginx's own $uri/$host are
# NOT env vars, so they survive substitution.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
