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
