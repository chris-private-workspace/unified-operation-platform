import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import type { AuthUser } from '../auth/current-user.decorator';
import {
  LookedUpRequest,
  ServiceNowLookupService,
} from '../integration/servicenow/servicenow-lookup.service';
import { IntakeService } from './intake.service';
import { N8nIntakeRequestDto } from './dto/n8n-intake.dto';
import {
  ImportFromServiceNowDto,
  LookupRequestView,
} from './dto/servicenow-import.dto';

/**
 * CH-013 / ADR-0021 — turn a real ServiceNow REQ number into a platform request,
 * driven by a named ADMIN rather than by the m2m intake key.
 *
 * This is the second caller of `IntakeService`. The first (n8n) authenticates
 * with a shared secret; this one authenticates as a person. Nothing about the
 * canonical contract changes — the payload assembled below is the same
 * `N8nIntakeRequestDto` the LOCKED route takes (ADR-0021 D2).
 */
@Injectable()
export class ServiceNowImportService {
  private readonly logger = new Logger(ServiceNowImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: ServiceNowLookupService,
    private readonly intake: IntakeService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Read-only preview. Writes nothing, so it is safe to call repeatedly.
   *
   * Every field the client sees is picked by name — `LookedUpRitm.activeTasks`
   * carries raw instance records that must not reach a browser.
   */
  async preview(reqNumber: string): Promise<LookupRequestView> {
    const found = await this.mustFind(reqNumber);
    return {
      number: found.number,
      shortDescription: found.shortDescription,
      openedAt: found.openedAt,
      items: found.items.map((item) => ({
        number: item.number,
        title: item.title,
        activeTaskCount: item.activeTaskCount,
        importable: item.importable,
        blockedReason: item.blockedReason,
        tasks: item.activeTasks.map((t) => ({
          number: typeof t.number === 'string' ? t.number : '',
          state: typeof t.state === 'string' ? t.state : '',
        })),
      })),
    };
  }

  async import(dto: ImportFromServiceNowDto, actor: AuthUser) {
    // Re-read from ServiceNow rather than trusting the body (D5). The client
    // names RITMs; which sys_id each one is stays the server's answer.
    const found = await this.mustFind(dto.reqNumber);

    const selected = dto.items.map((choice) => {
      const match = found.items.find((i) => i.number === choice.ritmNumber);
      if (!match) {
        throw new BadRequestException(
          `${choice.ritmNumber} is not an item of ${found.number}`,
        );
      }
      // ADR-0018 D3 — refuse now rather than at fulfilment, where the failure
      // would arrive after a licence has already been assigned.
      if (!match.importable) {
        throw new BadRequestException(
          `${choice.ritmNumber} cannot be imported: ${match.blockedReason}`,
        );
      }
      return { choice, match };
    });

    const canonical: N8nIntakeRequestDto = {
      targetUpn: dto.targetUpn.trim(),
      targetDisplayName: dto.targetDisplayName?.trim() || undefined,
      opcoCode: dto.opcoCode.trim(),
      rawRequestText: found.shortDescription || `imported from ${found.number}`,
      serviceNowSysId: found.sysId,
      serviceNowNumber: found.number,
      /**
       * azureSyncedAt is deliberately absent.
       *
       * Nothing about "an admin imported this" says Entra can see the user, and
       * the sync gate exists precisely to stop that inference (RISK R3). It
       * opens when ADR-0015's sweep confirms against Graph, or when a human
       * uses the documented break-glass — not here.
       */
      lineItems: selected.map(({ choice, match }) => ({
        skuId: choice.skuId,
        quantity: choice.quantity ?? 1,
        serviceNowRitmSysId: match.sysId,
        serviceNowRitmNumber: match.number,
      })),
    };

    /**
     * Idempotency belongs to IntakeService (REQ sysId is @unique — a repeat
     * returns the existing request). Asking first is only so the audit row
     * below records an import that actually happened: re-importing the same REQ
     * creates nothing, and an audit trail that says otherwise is worse than no
     * audit trail.
     */
    const existing = await this.prisma.request.findUnique({
      where: { serviceNowSysId: found.sysId },
      select: { id: true },
    });

    const request = await this.intake.intake(canonical);

    if (!existing) {
      /**
       * Separate transaction from the intake write, unavoidably: the canonical
       * service owns its own `$transaction` and ADR-0021 D2 forbids touching it.
       * So the failure mode is "request created, audit row missing" rather than
       * the atomic pair W29 achieved elsewhere.
       *
       * Accepted rather than worked around, because the alternative — reaching
       * into IntakeService to thread a tx through — is the exact edit the ADR
       * rules out. Recorded here so nobody reads the asymmetry as an oversight.
       */
      await this.prisma.$transaction(async (tx) => {
        await this.audit.log(tx, {
          action: AUDIT_ACTIONS.INTAKE_FROM_SERVICENOW,
          targetType: 'Request',
          targetId: request.id,
          actorId: actor.id,
          // H4: REQ number, OpCo and counts only. The target UPN is on the
          // request itself, under its own (wider) read permission.
          metadata: {
            reason: `imported from ServiceNow ${found.number} — ${canonical.lineItems.length} line item(s), OpCo ${canonical.opcoCode}`,
            source: 'servicenow-import',
          },
        });
      });
    }

    // H4: never the target UPN. REQ number / OpCo / counts are safe.
    this.logger.log(
      `ServiceNow import: ${found.number} → opco ${canonical.opcoCode}, ${canonical.lineItems.length} line item(s)${existing ? ' (already existed — nothing created)' : ''}`,
    );

    return request;
  }

  private async mustFind(reqNumber: string): Promise<LookedUpRequest> {
    const found = await this.lookup.lookupByNumber(reqNumber.trim());
    if (!found) {
      /**
       * "Not found" and "not visible to you" are the same empty answer from the
       * Table API, and on this instance the second one is a real, observed case
       * (workflow 2004's own note records fixture rows invisible to this
       * credential). Saying only "not found" sends the operator hunting for a
       * typo that is not there.
       */
      throw new NotFoundException(
        `${reqNumber} was not found in ServiceNow. Check the number — and note that a request the integration account cannot see (row-level ACL) is indistinguishable from one that does not exist.`,
      );
    }
    return found;
  }
}
