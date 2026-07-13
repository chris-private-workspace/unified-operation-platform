// Hand-written mirrors of the apps/api response DTOs (OD2-A: no generated
// client, no new dep). Keep in sync with:
//   apps/api/src/license/dto/{catalog,reconcile}.dto.ts
//   apps/api/src/fulfilment/dto/request-view.dto.ts
// Date fields arrive as ISO strings over JSON, so they are typed `string`.

export type DriftStatus = 'OPEN' | 'RESOLVED';

export type RequestStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type LineItemStage =
  | 'REQUESTED'
  | 'QUOTING'
  | 'OPCO_APPROVED'
  | 'AWAITING_VENDOR'
  | 'READY'
  | 'ASSIGNED'
  | 'CANCELLED';

export type EventType =
  'STAGE_CHANGE' | 'ASSIGN' | 'SYNC' | 'RECONCILE' | 'NOTE';

/** GET /license/catalog → SkuCatalogDto[] */
export interface SkuCatalog {
  id: string;
  skuId: string; // M365 GUID — source of truth
  skuPartNumber: string;
  displayName: string;
  businessAlias: string | null;
  category: string | null;
  isBaseLicense: boolean;
  active: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
}

/** POST /license/catalog/sync → CatalogSyncResultDto */
export interface CatalogSyncResult {
  created: number;
  updated: number;
  deactivated: number;
  snapshots: number;
}

/** POST /license/reconcile → ReconcileResultDto */
export interface ReconcileResult {
  checked: number; // active SKUs checked
  opened: number;
  updated: number;
  resolved: number;
  drift: number; // OPEN drift alerts remaining after this run
}

/** POST /license/ledger/import → LedgerImportResultDto (ADR-0004). */
export interface LedgerImportChange {
  opcoCode: string;
  skuBusinessAlias: string;
  skuPartNumber: string;
  before: number;
  target: number;
  delta: number;
}

export interface LedgerImportSummary {
  opcoColumns: number;
  skuRows: number;
  mappedSkuRows: number;
  changes: number;
}

export interface LedgerImportResult {
  dryRun: boolean;
  committed: number;
  summary: LedgerImportSummary;
  changes: LedgerImportChange[];
  skippedSkuLabels: string[];
  unknownOpcoHeaders: string[];
}

/** OpCo reference embedded in a ledger row (GET /license/ledger). */
export interface LedgerOpcoRef {
  code: string;
  displayName: string;
}

/** SKU reference embedded in a ledger row. */
export interface LedgerSkuRef {
  skuId: string;
  skuPartNumber: string;
  displayName: string;
  category: string | null;
}

/**
 * GET /license/ledger → LedgerRowDto[] (W14). Two-layer numbers per DESIGN §5:
 * allocatedQuantity = owned/budget, assignedQuantity = assigned. headroom /
 * overAllocated are backend-derived; utilization % is a display-layer concern.
 */
export interface LedgerRow {
  id: string;
  opcoId: string;
  skuCatalogId: string;
  allocatedQuantity: number;
  assignedQuantity: number;
  headroom: number; // allocatedQuantity - assignedQuantity
  overAllocated: boolean; // assignedQuantity > allocatedQuantity
  opco: LedgerOpcoRef;
  sku: LedgerSkuRef;
}

/** GET /license/ledger/stats → LedgerStatsDto (scoped aggregate for the KPIs). */
export interface LedgerStats {
  totalAllocated: number;
  totalAssigned: number;
  totalHeadroom: number;
  skusTracked: number;
  opcosTracked: number;
  overAllocatedCount: number;
}

/** GET /license/drift → DriftAlertDto[] */
export interface DriftSkuRef {
  skuId: string;
  skuPartNumber: string;
  displayName: string;
}

export interface DriftAlert {
  id: string;
  skuCatalogId: string;
  ledgerAssignedSum: number;
  tenantConsumed: number;
  delta: number; // tenantConsumed - ledgerAssignedSum
  status: DriftStatus;
  note: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  sku: DriftSkuRef;
}

/** OpCo reference (service include: { code, displayName }). */
export interface OpcoRef {
  code: string;
  displayName: string;
}

/** SKU reference embedded in a detail line item (service include). */
export interface LineItemSkuRef {
  skuId: string;
  skuPartNumber: string;
  displayName: string;
}

/** A per-SKU line item (stage lives here). `sku` present on the detail view. */
export interface RequestLineItem {
  id: string;
  requestId: string;
  skuCatalogId: string;
  quantity: number;
  procurementRequired: boolean;
  stage: LineItemStage;
  quoteRef: string | null;
  poRef: string | null;
  quotedAt: string | null;
  opcoApprovedAt: string | null;
  vendorOrderedAt: string | null;
  readyAt: string | null;
  assignedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  sku?: LineItemSkuRef;
}

/** An operational-history event (detail view). */
export interface RequestEvent {
  id: string;
  requestId: string;
  lineItemId: string | null;
  type: EventType;
  fromStage: LineItemStage | null;
  toStage: LineItemStage | null;
  message: string | null;
  actorId: string | null;
  createdAt: string;
}

/**
 * GET /fulfilment/requests → the service returns the full Request plus `opco`
 * and `lineItems` (richer than RequestDto). Fields beyond the DTO are real.
 */
export interface OnboardingRequest {
  id: string;
  serviceNowSysId: string | null;
  serviceNowNumber: string | null;
  serviceNowStatus: string | null;
  rawRequestText: string | null;
  requesterEmail: string | null;
  targetUpn: string;
  targetDisplayName: string | null;
  opcoId: string;
  status: RequestStatus;
  handledById: string | null;
  accountCreatedAt: string | null;
  azureSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  opco?: OpcoRef;
  lineItems?: RequestLineItem[];
}

/** GET /fulfilment/requests/:id → adds line-item `sku` + the event timeline. */
export interface RequestDetail extends OnboardingRequest {
  lineItems: RequestLineItem[];
  events: RequestEvent[];
}
