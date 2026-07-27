import { Injectable, Logger } from '@nestjs/common';
import { GraphService } from '../graph/graph.service';
import { graphUnavailable } from '../graph/graph-unavailable';
import {
  AssignOptions,
  AssignOutcome,
  DirectoryUser,
  LicenseOperationsProvider,
  TenantSkuSeats,
} from './license-ops.provider';

/**
 * The default LicenseOperationsProvider — Microsoft Graph, via the existing
 * GraphService (ADR-0017 D2, W38).
 *
 * This class owns no policy. It translates between the vendor's shapes and the
 * seam's vocabulary, and wraps transport failures the same way the direct Graph
 * callers already did (BUG-002 — a raw MSAL error carries status -1 and crashes
 * the Nest process if it reaches the exception filter).
 *
 * The `action` strings passed to graphUnavailable() are reproduced verbatim from
 * assign.service, because they end up in the 503 message the API returns. W38 is
 * a pure refactor: that message must not move by a single character.
 */
@Injectable()
export class GraphLicenseProvider extends LicenseOperationsProvider {
  private readonly logger = new Logger(GraphLicenseProvider.name);

  constructor(private readonly graph: GraphService) {
    super();
  }

  async listTenantSkus(): Promise<TenantSkuSeats[]> {
    let skus;
    try {
      skus = await this.graph.getSubscribedSkus();
    } catch (err) {
      throw graphUnavailable(
        this.logger,
        'read the tenant license inventory',
        err,
      );
    }
    // Narrow deliberately (see TenantSkuSeats): capabilityStatus / appliesTo are
    // Graph concepts, and nothing on the assign path reads them.
    return skus.map((s) => ({
      skuId: s.skuId,
      prepaidEnabled: s.prepaidEnabled,
      consumedUnits: s.consumedUnits,
    }));
  }

  async findUser(upn: string): Promise<DirectoryUser | null> {
    let user;
    try {
      user = await this.graph.findUser(upn);
    } catch (err) {
      throw graphUnavailable(this.logger, 'look up the target user', err);
    }
    // null means a genuine 404 — the user is not synced yet. Preserved as null
    // rather than turned into an outcome, because the caller distinguishes
    // "absent" from "present but unusable" (no usageLocation) itself.
    if (!user) return null;
    return {
      userPrincipalName: user.userPrincipalName,
      usageLocation: user.usageLocation,
    };
  }

  /**
   * 🔴 Graph can only ever produce `assigned` here, and that is not an omission.
   *
   *   not_synced / no_seats — the caller checks both BEFORE reaching this method
   *                           (sync gate + seat check in assign.service). They
   *                           stay there: moving them in would make this
   *                           provider a decision-maker, against ADR-0017 D0.
   *   already_assigned      — Graph's POST /assignLicense is idempotent and
   *                           reports nothing when the user already holds the
   *                           SKU, so this implementation genuinely CANNOT tell
   *                           the two apart. n8n 2003 CAN (it returns
   *                           already_assigned explicitly).
   *   error                 — Graph signals failure by throwing, and a throw
   *                           here is transport-level → 503, not an outcome.
   *
   * That last point is a real cross-provider asymmetry, not a gap to paper over
   * by guessing: on a replay, Graph will say `assigned` where n8n says
   * `already_assigned`. Whoever implements 庚 must decide whether the caller
   * should treat them identically (it does today — a replay is not an error) or
   * whether GraphLicenseProvider should start probing the user's licenses first,
   * which would cost an extra round-trip on every single assign. Do not "fix"
   * this by inventing a probe here without that decision.
   */
  async assignLicense(
    upn: string,
    skuId: string,
    options: AssignOptions,
  ): Promise<AssignOutcome> {
    try {
      await this.graph.assignLicense(upn, skuId, {
        usageLocation: options.usageLocation,
      });
    } catch (err) {
      throw graphUnavailable(
        this.logger,
        'assign the license in Microsoft Graph',
        err,
      );
    }
    return { status: 'assigned' };
  }
}
