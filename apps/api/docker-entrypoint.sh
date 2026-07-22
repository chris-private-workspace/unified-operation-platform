#!/bin/sh
# API container entrypoint. By default just runs the app (the clean design —
# migrations run from the operator/pipeline per docs/13-deployment/04-deploy-runbook.md).
#
# For the Azure UAT bring-up the operator machine CANNOT reach the DB data-plane
# (corporate proxy blocks it — see docs/01-planning/W33-deploy-exec/progress.md),
# so migrations must run from inside Azure. Setting RUN_MIGRATIONS_ON_START=true
# (and RUN_SEED_ON_START=true) makes the container self-migrate before starting.
# Both prisma migrate deploy (pending-only) and the seed (upserts) are idempotent,
# and the api runs single-replica in UAT, so there is no multi-writer race.
#
# Migrate/seed failures are logged but NON-FATAL: the app still starts, so the
# container never crash-loops just because bootstrap data couldn't load (which,
# with container logs unreachable behind the proxy, would be invisible). A failed
# migrate surfaces as 500s on DB routes; a failed seed as "no admin" — both
# diagnosable over HTTP once the app is up.
cd /app/apps/api

if [ "$RUN_MIGRATIONS_ON_START" = "true" ]; then
  echo "[entrypoint] prisma migrate deploy"
  npx prisma migrate deploy || echo "[entrypoint] WARN: migrate deploy failed (continuing)"
fi

if [ "$RUN_SEED_ON_START" = "true" ]; then
  echo "[entrypoint] seeding (idempotent upserts)"
  npm run seed || echo "[entrypoint] WARN: seed failed (continuing)"
fi

echo "[entrypoint] starting api (node dist/main)"
exec node dist/main
