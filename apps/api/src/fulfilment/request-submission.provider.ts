/**
 * Outbound write-integration abstraction (ADR-0008 D3). Given a platform-built
 * license request, create the corresponding ServiceNow ticket(s) and return the
 * SN identifiers — the caller then builds the local mirror (D4). Pluggable:
 * DirectServiceNowProvider (Phase 乙, Table API) now; N8nWorkflowProvider
 * (Phase 丙, webhook) later. The abstract class doubles as the Nest DI token.
 */

export interface SubmitLineItem {
  skuId: string; // SkuCatalog.skuId GUID
  skuPartNumber?: string; // for a readable ticket line
  quantity: number;
}

export interface SubmitRequestPayload {
  targetUpn: string; // the user the licenses are for
  opcoCode: string;
  requesterEmail?: string;
  remark?: string;
  lineItems: SubmitLineItem[];
}

export interface SubmittedLineItem {
  skuId: string;
  quantity: number;
  serviceNowSysId: string; // sc_req_item (RITM) sysId
  serviceNowNumber?: string;
}

export interface SubmittedRequest {
  serviceNowSysId: string; // sc_request (REQ) sysId
  serviceNowNumber?: string;
  lineItems: SubmittedLineItem[];
}

export abstract class RequestSubmissionProvider {
  abstract submit(payload: SubmitRequestPayload): Promise<SubmittedRequest>;
}
