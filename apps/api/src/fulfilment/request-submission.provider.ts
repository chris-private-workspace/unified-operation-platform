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
  /**
   * ADR-0030 D1/D3 — a `sys_user` sysId the caller ALREADY holds, so the
   * requester never has to be looked up by e-mail.
   *
   * Only the intake path can supply it: it resolves the incoming REQ anyway
   * (`resolveReqSysId`) and that record carries its own `opened_by`. The
   * outbound path (IT raising a request from the platform) has no REQ yet —
   * the ticket IS what it is about to create — so it leaves this undefined and
   * keeps using `requesterEmail`.
   *
   * 🔴 Present-but-wrong must fail, not fall back: a lookup revived behind a
   * supplied sysId would be a 0%-measured path (W44 — three consecutive n8n
   * intakes died in it) quietly pretending to be a repair mechanism.
   */
  requesterSysId?: string;
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
