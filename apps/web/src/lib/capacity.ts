import type { LedgerRow, TenantSkuRow } from './api-types';

// CH-009 — capacity lookup for the request-detail assign flow. Pure so it is
// unit-testable; the component only maps + renders (mirrors lib/ledger.ts).
//
// TWO layers, deliberately NOT merged into one number — they have different
// sources AND different freshness guarantees (spec D1):
//
//   OpCo budget  → OpcoSkuLedger, live from the platform DB, per-actor scoped
//                  (AUTH-3a). This is the layer ADR-0016 will gate on.
//   Tenant seats → TenantSkuSnapshot, as-of the last catalog sync / reconcile.
//                  tenant-owned.service never calls Graph on a GET, so this is
//                  INDICATIVE, not authoritative — the real assign gate reads
//                  live Graph subscribedSkus. The UI must say "last sync".
//
// Neither figure gates anything here: the backend stays the only authority
// (assign.service.ts fails closed). Showing a stale number can mislead, but it
// can never cause a wrong assign.

/** Composite key for one OpCo × one SKU. cuid()s contain no ':'. */
function ledgerKey(opcoId: string, skuCatalogId: string): string {
  return `${opcoId}:${skuCatalogId}`;
}

/**
 * Index the scoped ledger once per render so each line item is an O(1) lookup.
 * A request can carry many line items — per-item queries would be an N+1 (D4).
 */
export function buildLedgerIndex(rows: LedgerRow[]): Map<string, LedgerRow> {
  const index = new Map<string, LedgerRow>();
  for (const row of rows) {
    index.set(ledgerKey(row.opcoId, row.skuCatalogId), row);
  }
  return index;
}

export interface OpcoCapacity {
  /**
   * false = no ledger row for this OpCo × SKU. Two ways to get here and they
   * mean the same thing — nothing is budgeted: (a) a row was never created
   * (DD-3: there is no explicit create endpoint), or (b) it is a 0/0 row that
   * CH-008 excludes by default. Either way: allocated = 0 (spec D5).
   */
  present: boolean;
  allocated: number;
  assigned: number;
  /** allocated - assigned. NEGATIVE when the OpCo is already over budget. */
  headroom: number;
  /**
   * No room for one more seat. Mirrors ADR-0016's gate condition
   * (assigned + 1 > allocated ⇔ assigned >= allocated).
   * ⚠️ ADR-0016 is Accepted but NOT yet implemented — today nothing blocks on
   * this. It is a display-layer warning only, so the wording must state the
   * fact ("no headroom"), never promise a block that does not happen yet.
   */
  exhausted: boolean;
}

/** OpCo budget for one line item. Missing row → allocated/assigned = 0 (D5). */
export function opcoCapacity(
  index: Map<string, LedgerRow>,
  opcoId: string,
  skuCatalogId: string,
): OpcoCapacity {
  const row = index.get(ledgerKey(opcoId, skuCatalogId));
  const allocated = row?.allocatedQuantity ?? 0;
  const assigned = row?.assignedQuantity ?? 0;
  return {
    present: row !== undefined,
    allocated,
    assigned,
    headroom: allocated - assigned,
    exhausted: assigned >= allocated,
  };
}

/** Index tenant rows by SKU. ADMIN / REGIONAL only — OPCO_IT never fetches. */
export function buildTenantIndex(
  rows: TenantSkuRow[],
): Map<string, TenantSkuRow> {
  const index = new Map<string, TenantSkuRow>();
  for (const row of rows) index.set(row.skuCatalogId, row);
  return index;
}

export interface TenantCapacity {
  /**
   * false = this SKU has no TenantSkuSnapshot yet, so owned / consumed are
   * genuinely unknown. The caller must render "unknown", NOT 0 — a 0 here reads
   * as "no seats left", which is a different (and dangerous) claim.
   */
  known: boolean;
  owned: number;
  consumed: number;
  /** owned - consumed, floored at 0 for display. */
  available: number;
  /** Mirrors the existing live gate (consumedUnits >= prepaidEnabled). */
  exhausted: boolean;
}

const UNKNOWN_TENANT: TenantCapacity = {
  known: false,
  owned: 0,
  consumed: 0,
  available: 0,
  exhausted: false,
};

/**
 * Tenant seats for one SKU, as-of the last snapshot. A row can exist with null
 * owned / consumed (a ledger-only SKU that the tenant does not own), so check
 * the fields rather than just the row.
 */
export function tenantCapacity(
  index: Map<string, TenantSkuRow>,
  skuCatalogId: string,
): TenantCapacity {
  const row = index.get(skuCatalogId);
  if (!row || row.owned === null || row.tenantConsumed === null) {
    return UNKNOWN_TENANT;
  }
  const remaining = row.owned - row.tenantConsumed;
  return {
    known: true,
    owned: row.owned,
    consumed: row.tenantConsumed,
    available: Math.max(0, remaining),
    exhausted: remaining <= 0,
  };
}
