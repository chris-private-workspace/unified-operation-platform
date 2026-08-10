import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CatalogVariables,
  ServiceNowService,
} from '../integration/servicenow/servicenow.service';
import {
  RequestSubmissionProvider,
  SubmitLineItem,
  SubmitRequestPayload,
  SubmittedLineItem,
  SubmittedRequest,
} from './request-submission.provider';

/**
 * ADR-0008 D3 / Phase 乙, rewritten by ADR-0025 D2 (BUG-010).
 *
 * Opens the request through the **Service Catalog API**, not the Table API.
 * `POST /api/now/table/sc_request` is 403 for the integration account on this
 * instance — table-level ACL, proven with a single-field payload — so the old
 * implementation could never have worked here. The catalog route also produces
 * the REQ / RITM / one-active-catalog-task shape that ADR-0018 D3 depends on,
 * which hand-built inserts did not.
 */

/** Fixed for every request the platform raises (real value, read off live RITMs). */
const ACTION_TYPE = 'new_license_assignment';

/**
 * Which product family a licence line belongs to. ServiceNow keeps a SEPARATE
 * catalog item per family, and ordering a Dynamics licence off the O365 item
 * would raise a real, wrong ticket for a real customer.
 */
type Family = 'o365' | 'd365';

/**
 * 🔴 How the family is decided, and why this is the weakest part of the file.
 *
 * `SkuCatalog.category` cannot answer it: measured 2026-08-04, its values are
 * `Base` / `Add-on` / `Power Platform` / `Voice` — a licence ROLE taxonomy, not
 * a product family — and 91 of 99 active SKUs have none at all, including every
 * one of the 30 Dynamics SKUs. So the part number is the only signal available.
 *
 * Measured against all 99 active SKUs this separates cleanly: the 30 Dynamics
 * ones all start with one of these, and nothing else does. But it IS a
 * heuristic, and its failure mode is raising a wrong ticket, so it is
 * overridable from env without a deploy rather than frozen in code.
 */
const DEFAULT_D365_PREFIXES = ['D365', 'DYN365', 'Dynamics'];

@Injectable()
export class DirectServiceNowProvider extends RequestSubmissionProvider {
  private readonly logger = new Logger(DirectServiceNowProvider.name);

  constructor(
    private readonly snow: ServiceNowService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async submit(payload: SubmitRequestPayload): Promise<SubmittedRequest> {
    // 1. Which catalog item — resolved BEFORE anything is written, so an
    //    unconfigured or mixed request fails without touching ServiceNow.
    const itemSysId = this.resolveCatalogItem(payload.lineItems);

    // 2. Somebody real for the two mandatory reference variables. Fail-closed:
    //    a request whose requester we cannot identify is one a human should
    //    look at, not one we quietly attach to a fallback account (ADR-0025 D3).
    //
    //    ADR-0030 D3 — the intake path already holds a sysId (the REQ's own
    //    `opened_by`) and hands it over, so it never reaches the e-mail lookup.
    //    The outbound path has no REQ yet — the ticket IS what it is creating —
    //    so it still resolves by address.
    //
    //    🔴 Deliberately NOT a fallback chain. `??` only covers a caller that
    //    supplied nothing; it must never rescue a supplied-but-rejected id.
    //    W44 measured the e-mail lookup at 0% for intake (n8n sends the Outlook
    //    trigger's sender, which is not a ServiceNow user) — reviving it behind
    //    a miss would hide the next failure exactly as it hid those three.
    const requesterSysId =
      payload.requesterSysId ??
      (await this.resolveRequester(payload.requesterEmail));

    // 3. Place the order. One line orders directly; several go through the cart
    //    so they land under ONE request (ADR-0025 OQ-3).
    const requestNumber =
      payload.lineItems.length === 1
        ? (
            await this.snow.orderNow(
              itemSysId,
              this.variables(payload, requesterSysId),
              payload.lineItems[0].quantity,
            )
          ).requestNumber
        : await this.orderViaCart(payload, itemSysId, requesterSysId);

    // 4. The catalog API answers with a REQ number and nothing else — the
    //    workflow, not us, created the items — so read back what it made.
    return this.describeOrder(requestNumber, payload.lineItems);
  }

  // ── steps ────────────────────────────────────────────────────────────────

  private async orderViaCart(
    payload: SubmitRequestPayload,
    itemSysId: string,
    requesterSysId: string,
  ): Promise<string> {
    /**
     * 🔴 The cart belongs to the integration ACCOUNT and `submit_order` submits
     * all of it. A leftover item from another process would be ordered under
     * our REQ, against the requester we just named. Refuse rather than clear:
     * deleting someone else's pending order is not the platform's call.
     */
    const existing = await this.snow.cartItemCount();
    if (existing > 0) {
      throw new Error(
        `The ServiceNow integration account's cart already holds ${existing} item(s); ` +
          'submitting would include them. Clear the cart in ServiceNow, then retry.',
      );
    }

    for (const line of payload.lineItems) {
      await this.snow.addToCart(
        itemSysId,
        this.variables(payload, requesterSysId),
        line.quantity,
      );
    }
    const order = await this.snow.submitCartOrder();
    return order.requestNumber;
  }

  /**
   * REQ number → the identifiers the caller mirrors locally.
   *
   * 🔴 Items are zipped to payload lines BY INDEX, which is only sound because
   * of the two guards here: the count must match exactly, and the items are read
   * back in creation order (which is the order they were added to the cart).
   * A mismatch means the workflow created something we did not ask for, and
   * guessing which item is which line would attach the wrong RITM to the wrong
   * SKU — invisible until someone closes the wrong ticket. Fail closed instead.
   */
  private async describeOrder(
    requestNumber: string,
    lines: SubmitLineItem[],
  ): Promise<SubmittedRequest> {
    const req = await this.snow.getRecordByNumber(requestNumber, 'sc_request');
    if (!req?.sys_id) {
      throw new Error(
        `ServiceNow accepted the order (${requestNumber}) but the request cannot be read back`,
      );
    }
    const items = await this.snow.query(
      `request=${String(req.sys_id)}^ORDERBYsys_created_on`,
      'sc_req_item',
      50,
    );
    if (items.length !== lines.length) {
      throw new Error(
        `ServiceNow request ${requestNumber} has ${items.length} item(s) but ${lines.length} line(s) were ordered`,
      );
    }

    const lineItems: SubmittedLineItem[] = lines.map((line, i) => ({
      skuId: line.skuId,
      quantity: line.quantity,
      serviceNowSysId: String(items[i].sys_id),
      serviceNowNumber:
        typeof items[i].number === 'string' ? items[i].number : undefined,
    }));

    // H4: REQ number + count only, never the target UPN (PII).
    this.logger.log(
      `Ordered ServiceNow request ${requestNumber} (${lineItems.length} RITM)`,
    );
    return {
      serviceNowSysId: String(req.sys_id),
      serviceNowNumber:
        typeof req.number === 'string' ? req.number : requestNumber,
      lineItems,
    };
  }

  // ── mapping ──────────────────────────────────────────────────────────────

  /**
   * The four mandatory variables, plus the two optional ones worth setting.
   * Names and real values were read off live RITMs (CH-014 D2), not invented.
   *
   * 🔴 `target_user` carries the REQUESTER, not the new joiner (ADR-0025 D3).
   * It is a mandatory reference to `sys_user`, and the whole point of gate ② is
   * that the new joiner does not exist there yet. `target_users_email` is what
   * says who the request is FOR, and it is the field to backfill from — nothing
   * downstream may identify the target user from `target_user` until gate ②
   * has replaced it.
   *
   * `license_type` is deliberately absent: it is `mandatory=false` (measured),
   * and its 48 choices have no mapping to `skuPartNumber` yet (ADR-0025 D7).
   * Sending a guess would be worse than sending nothing.
   *
   * ⚠️ Consequence worth knowing: because nothing here varies per line, a
   * multi-line request sends IDENTICAL variables for every item. The lines are
   * still distinct records (and distinct quantities), but ServiceNow cannot tell
   * from the variables which licence each one is for. That gap closes when the
   * license_type mapping lands, not before.
   */
  private variables(
    payload: SubmitRequestPayload,
    requesterSysId: string,
  ): CatalogVariables {
    const opco = payload.opcoCode.toLowerCase();
    return {
      requester_name: requesterSysId,
      target_user: requesterSysId,
      target_users_email: payload.targetUpn,
      target_user_opcos: opco,
      opcos: opco,
      action_type: ACTION_TYPE,
    };
  }

  private async resolveRequester(email: string | undefined): Promise<string> {
    if (!email) {
      throw new Error(
        'ServiceNow requires a requester, but the request carries no requester e-mail',
      );
    }
    const sysId = await this.snow.findUserSysIdByEmail(email);
    if (!sysId) {
      // H4: never log the address itself.
      throw new Error(
        'The requester was not found in ServiceNow, so the request cannot be raised',
      );
    }
    return sysId;
  }

  /**
   * One catalog item for the whole request.
   *
   * Mixed families fail closed rather than splitting into two requests: the
   * caller mirrors ONE `serviceNowSysId` per request (ADR-0008 D6), so a split
   * has nowhere to be recorded and the second REQ would exist in ServiceNow
   * with nothing in the platform pointing at it.
   */
  private resolveCatalogItem(lines: SubmitLineItem[]): string {
    const families = new Set(lines.map((l) => this.family(l)));
    if (families.size > 1) {
      throw new Error(
        'A single request cannot mix O365 and D365 licence lines — raise them separately',
      );
    }
    const family: Family = families.has('d365') ? 'd365' : 'o365';
    const envKey =
      family === 'd365'
        ? 'SERVICENOW_D365_CATALOG_ITEM_SYS_ID'
        : 'SERVICENOW_O365_CATALOG_ITEM_SYS_ID';
    const itemSysId = this.config.get<string>(envKey);
    if (!itemSysId) {
      throw new Error(
        `ServiceNow ${family.toUpperCase()} catalog item is not configured (${envKey})`,
      );
    }
    return itemSysId;
  }

  private family(line: SubmitLineItem): Family {
    const raw = this.config.get<string>('SERVICENOW_D365_SKU_PREFIXES');
    const prefixes = (raw ? raw.split(',') : DEFAULT_D365_PREFIXES)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    const part = (line.skuPartNumber ?? '').toLowerCase();
    return prefixes.some((p) => part.startsWith(p)) ? 'd365' : 'o365';
  }
}
