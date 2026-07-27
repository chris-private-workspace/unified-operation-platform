-- W36 / ADR-0016 — OpCo budget gate preflight.
--
-- WHAT IT ANSWERS: which OpCo x SKU combinations will be REFUSED the moment the
-- budget gate goes live, i.e. every row where `assigned + 1 > allocated`
-- (equivalently `assigned >= allocated`, the gate's own condition in
-- assign.service.ts).
--
-- WHY IT MATTERS: the gate does not warn — it returns 400. Run this BEFORE
-- deploying and hand the list to whoever assigns licences, or they find out one
-- refused request at a time (W36 plan R1).
--
-- Read-only. Safe to re-run at any time, on any environment.
--
-- Usage (local dev):
--   docker exec -i uop-postgres psql -U uop -d platform < docs/05-usage/sql/opco-budget-gate-preflight.sql
-- Usage (deployed):
--   psql "$DATABASE_URL" -f docs/05-usage/sql/opco-budget-gate-preflight.sql

\echo ''
\echo '=== [1] summary ==='

SELECT
  count(*)                                        AS ledger_rows,
  count(*) FILTER (WHERE l."assignedQuantity" >= l."allocatedQuantity")            AS at_or_over,
  -- Inactive SKUs cannot receive a NEW line item at all: intake.service.ts
  -- rejects them, so their rows can never reach the gate. They inflate the
  -- headline number without being a real operational problem.
  count(*) FILTER (WHERE l."assignedQuantity" >= l."allocatedQuantity"
                     AND s.active)                                                AS at_or_over_active,
  count(*) FILTER (WHERE l."assignedQuantity" > l."allocatedQuantity"
                     AND s.active)                                                AS strictly_over_active,
  -- allocated = 0 is the harshest case: D1 has no "unlimited by default", so
  -- these refuse EVERY assign, not just the next one.
  count(*) FILTER (WHERE l."allocatedQuantity" = 0 AND s.active)                   AS zero_allocation_active
FROM "OpcoSkuLedger" l
JOIN "SkuCatalog" s ON s.id = l."skuCatalogId";

\echo ''
\echo '=== [2] combinations that will be refused (active SKUs first) ==='

-- skuId (GUID), not the part number, is the identity — CLAUDE.md §13. A part
-- number is NOT unique in this table: a legacy subscription and its current
-- replacement can both be called SPE_E3, one active and one not. Reading the
-- name alone, "SPE_E3 — inactive, no action" looks like E3 is fine when a
-- DIFFERENT, active E3 row exists.
SELECT
  o.code                                          AS opco,
  s."skuId"                                       AS sku_id,
  s."skuPartNumber"                               AS sku,
  coalesce(s."businessAlias", s."displayName")    AS sku_label,
  s.active                                        AS sku_active,
  l."allocatedQuantity"                           AS allocated,
  l."assignedQuantity"                            AS assigned,
  l."assignedQuantity" - l."allocatedQuantity"    AS overage,
  CASE
    WHEN NOT s.active                THEN 'no action for THIS skuId — inactive, intake refuses new lines (check for an active twin of the same part number)'
    WHEN l."allocatedQuantity" = 0   THEN 'set an allocation — every assign is refused'
    WHEN l."assignedQuantity" = l."allocatedQuantity"
                                     THEN 'exactly full — the NEXT assign is the first refused'
    ELSE 'already over — raise the allocation to at least the assigned figure'
  END                                             AS what_to_do
FROM "OpcoSkuLedger" l
JOIN "Opco" o       ON o.id = l."opcoId"
JOIN "SkuCatalog" s ON s.id = l."skuCatalogId"
WHERE l."assignedQuantity" >= l."allocatedQuantity"
ORDER BY s.active DESC, overage DESC, o.code, s."skuPartNumber";

\echo ''
\echo '=== [3] rows with NO ledger entry are invisible above — count them too ==='
\echo '(a missing row = allocated 0 under D1, and there is no create endpoint yet — DD-3)'

-- Only OpCo x SKU pairs that some OPEN request actually wants are worth listing:
-- the full cross join is 23 OpCos x every SKU and means nothing.
SELECT
  o.code                                       AS opco,
  s."skuId"                                    AS sku_id,
  s."skuPartNumber"                            AS sku,
  count(*)                                     AS pending_line_items
FROM "RequestLineItem" li
JOIN "Request" r    ON r.id = li."requestId"
JOIN "Opco" o       ON o.id = r."opcoId"
JOIN "SkuCatalog" s ON s.id = li."skuCatalogId"
LEFT JOIN "OpcoSkuLedger" l
       ON l."opcoId" = r."opcoId" AND l."skuCatalogId" = li."skuCatalogId"
WHERE l.id IS NULL
  AND li.stage NOT IN ('ASSIGNED', 'CANCELLED')
GROUP BY o.code, s."skuId", s."skuPartNumber"
ORDER BY pending_line_items DESC, o.code;

\echo ''
\echo '=== [4] part numbers carried by MORE THAN ONE catalog row ==='
\echo '(legacy + replacement subscription; the lists above are keyed on skuId, read them that way)'

SELECT
  s."skuPartNumber"                                        AS sku,
  count(*)                                                 AS catalog_rows,
  count(*) FILTER (WHERE s.active)                         AS active_rows,
  string_agg(s."skuId" || CASE WHEN s.active THEN ' (active)' ELSE ' (inactive)' END,
             E'\n' ORDER BY s.active DESC)                 AS sku_ids
FROM "SkuCatalog" s
GROUP BY s."skuPartNumber"
HAVING count(*) > 1
ORDER BY s."skuPartNumber";
