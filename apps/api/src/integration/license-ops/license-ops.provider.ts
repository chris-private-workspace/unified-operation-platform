/**
 * Seam ② of ADR-0017 — the license *execution* boundary.
 *
 * The platform decides WHO gets WHICH license and enforces every gate (opco
 * scope, stage machine, sync gate, tenant seats, OpCo budget, ledger, audit).
 * This provider only carries out the decision. That is ADR-0017 D0 and it is
 * the reason every method here is imperative and none of them is allowed to
 * refuse on policy grounds: a provider that could say "no" would be making a
 * decision, and the two implementations would then drift apart in behaviour.
 *
 * Two implementations are planned:
 *   - GraphLicenseProvider (default, W38)      — Microsoft Graph directly
 *   - N8nLicenseProvider   (ADR-0017 庚)       — n8n workflows 2002/2003/2005
 *
 * ── Error contract (W38 decision, deviates from ADR-0017 D2 wording) ─────────
 * TRANSPORT failure (network / auth / throttle — "the vendor is down") THROWS.
 * Each implementation wraps its own vendor into a 503 the same way the direct
 * Graph callers already do (graphUnavailable, BUG-002). It is deliberately NOT
 * folded into AssignOutcome, because "Microsoft Graph is unreachable" is not an
 * outcome of this assignment — it is the absence of one, and the caller must
 * retry rather than interpret it.
 *
 * SEMANTIC results — the vendor answered, and the answer means something about
 * this particular assignment — come back as an AssignOutcome.
 *
 * ADR-0017 D2 reads as though graphUnavailable() should map into the vocabulary
 * too; Chris approved the split above on 2026-07-27 (plan §7 changelog). The
 * practical difference: assign.service keeps propagating the exact same 503 it
 * always did, so W38 stays a pure refactor.
 */

/** Seat counts for one tenant SKU. Deliberately narrower than Graph's
 * SubscribedSku — only what a seat check actually needs, so that a non-Graph
 * implementation is not forced to invent capabilityStatus / appliesTo. */
export interface TenantSkuSeats {
  /** GUID — the source-of-truth key (SkuCatalog.skuId). Never the part number. */
  skuId: string;
  /** Total purchased seats. */
  prepaidEnabled: number;
  /** Total assigned across the whole tenant. */
  consumedUnits: number;
}

/** The directory facts an assignment needs. No displayName / accountEnabled:
 * nothing in the assign path reads them, and they are PII we would rather not
 * carry across a seam (H4). */
export interface DirectoryUser {
  userPrincipalName: string;
  /** REQUIRED by the vendor before any license can be assigned. */
  usageLocation: string | null;
}

export interface AssignOptions {
  /** Applied first if the user has none. Caller resolves the value. */
  usageLocation?: string;
}

/**
 * The normalised result vocabulary — ADR-0017 calls this the core design work
 * of the whole seam, because the two implementations report success in shapes
 * that do not resemble each other:
 *
 *   graph.assignLicense()  throws, or returns void
 *   n8n 2003               returns already_assigned / not_synced as *success*
 *
 * Map both into this union or switching provider becomes a silent behaviour
 * change. H5's main battleground is: same case, both providers, same outcome.
 */
export type AssignOutcome =
  | { status: 'assigned' }
  /** Idempotent replay — the user already holds this SKU. Not an error. */
  | { status: 'already_assigned' }
  /** The user does not exist in the directory yet (Phase 1 sync gate). */
  | { status: 'not_synced' }
  /** No seat left on the tenant SKU. */
  | { status: 'no_seats' }
  /**
   * The provider answered, but the answer means the assignment failed for a
   * reason this vocabulary does not model (e.g. n8n 2003 returning
   * `{result: 'failed', reason: ...}`).
   *
   * H4: `details` is shown to operators and may be logged — it must never
   * carry the target UPN, an email, or any credential.
   */
  | { status: 'error'; details: string };

/**
 * Abstract class rather than an interface + string token: Nest can use the
 * class itself as the DI token, so wiring stays type-safe and there is no
 * magic string to keep in sync.
 *
 * Scope note (W38 OQ-1, Chris 2026-07-27) — this seam covers the ASSIGN path
 * only. Three other GraphService callers deliberately stay on the vendor
 * directly, and license-ops.boundary.spec.ts locks that in:
 *
 *   reconcile.service        drift's source of truth — a decision-maker, not an
 *                            executor. Routing it through a switchable seam
 *                            would make the drift baseline depend on which
 *                            provider is configured.
 *   integration-probe        probes the Graph connector itself; the thing it
 *                            must observe is precisely the executor this seam
 *                            swaps out.
 *   sync-sweep               ADR-0015 exists to upgrade azureSyncedAt from
 *                            "n8n claims it" to "the platform verified it".
 *                            Verifying via n8n would undo exactly that.
 */
export abstract class LicenseOperationsProvider {
  /** Tenant-wide seat inventory, for the pre-assign seat check. */
  abstract listTenantSkus(): Promise<TenantSkuSeats[]>;

  /** Null = the user genuinely does not exist (404), NOT a transport failure. */
  abstract findUser(upn: string): Promise<DirectoryUser | null>;

  abstract assignLicense(
    upn: string,
    skuId: string,
    options: AssignOptions,
  ): Promise<AssignOutcome>;
}
