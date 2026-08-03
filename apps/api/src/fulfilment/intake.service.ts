import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LineItemStage, Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { N8nIntakeRequestDto } from './dto/n8n-intake.dto';

type ResolvedLine = {
  skuCatalogId: string;
  quantity: number;
  serviceNowSysId: string | null;
  serviceNowNumber: string | null;
  serviceNowTaskSysId: string | null;
  serviceNowTaskNumber: string | null;
};

/**
 * CH-020 / ADR-0024 D1 — the catalog task the caller wants closed once these
 * lines are assigned.
 *
 * 🔴 A SECOND PARAMETER rather than two more fields on N8nIntakeRequestDto, and
 * that is a security decision, not a style one. Only the flat n8n path (which
 * genuinely receives a task sys_id from workflow 1001) may put the platform on
 * the by-task close route, because that route bypasses ADR-0018 D3's
 * "exactly one active task under this RITM" protection by construction. Leaving
 * it off the public DTO means no external canonical caller can reach it.
 */
export type IntakeTaskRef = {
  sysId: string;
  number: string | null;
};

/**
 * ADR-0008 Phase 甲 — inbound intake from the n8n onboarding workflow.
 * Builds a local Request + RequestLineItem mirror in one atomic nested write,
 * carrying the ServiceNow REQ/RITM two-level linkage (CONTRACT §4) and the
 * Phase 1 sync gate. m2m (IntakeKeyGuard) — no user actor, so no AUTH-3a scope.
 * Idempotent on the REQ sysId (@unique, AGENDA A1/B5): a repeat push returns the
 * existing request without creating a duplicate — including a concurrent retry
 * that races past the pre-check (P2002 → return existing).
 */
@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * `taskRef` is applied to EVERY line this call creates. Today that is at most
   * one: the flat path is the only caller that passes it, and 1001 sends no
   * licence lines, so the single line is always the ADR-0020 injection. If that
   * ever changes, each line would attempt the same close — the first succeeds
   * and the rest are refused by the `active` gate (ADR-0024 D5) rather than
   * double-closing anything, but they would show up as delivery failures.
   */
  async intake(dto: N8nIntakeRequestDto, taskRef?: IntakeTaskRef) {
    // ── Idempotency (B5): REQ sysId is @unique — repeat push = skip, no double ──
    const existing = await this.findByReq(dto.serviceNowSysId);
    if (existing) {
      this.logger.log(
        `Intake skip: request already exists for REQ ${dto.serviceNowSysId} (${existing.id})`,
      );
      return existing;
    }

    // ── Resolve OpCo by code (B2) ──
    const opco = await this.prisma.opco.findUnique({
      where: { code: dto.opcoCode },
    });
    if (!opco) {
      throw new NotFoundException(`OpCo code '${dto.opcoCode}' not found`);
    }

    // ── Resolve every SKU by GUID (B1) BEFORE any write (fail fast) ──
    const resolved: ResolvedLine[] = [];
    for (const line of dto.lineItems) {
      const sku = await this.prisma.skuCatalog.findUnique({
        where: { skuId: line.skuId },
      });
      if (!sku || !sku.active) {
        throw new BadRequestException(
          `SKU '${line.skuId}' not found or inactive`,
        );
      }
      resolved.push({
        skuCatalogId: sku.id,
        quantity: line.quantity,
        serviceNowSysId: line.serviceNowRitmSysId ?? null,
        serviceNowNumber: line.serviceNowRitmNumber ?? null,
        serviceNowTaskSysId: taskRef?.sysId ?? null,
        serviceNowTaskNumber: taskRef?.number ?? null,
      });
    }

    // ── Atomic mirror: Request (REQ + sync gate) + line items (RITM) ──
    // Nested create is transactional; the @unique on serviceNowSysId is the
    // backstop for a concurrent retry that raced past the pre-check above.
    try {
      const created = await this.prisma.request.create({
        data: {
          targetUpn: dto.targetUpn,
          targetDisplayName: dto.targetDisplayName ?? null,
          opcoId: opco.id,
          requesterEmail: dto.requesterEmail ?? null,
          rawRequestText: dto.rawRequestText ?? null,
          status: RequestStatus.OPEN,
          handledById: null, // unassigned → Regional queue (AGENDA B6 / A2)
          // ServiceNow parent REQ (two-level, CONTRACT §4)
          serviceNowSysId: dto.serviceNowSysId,
          serviceNowNumber: dto.serviceNowNumber ?? null,
          // Phase 1 sync gate — n8n-claimed; assign still needs findUser (RISK R3)
          accountCreatedAt: dto.accountCreatedAt
            ? new Date(dto.accountCreatedAt)
            : null,
          azureSyncedAt: dto.azureSyncedAt ? new Date(dto.azureSyncedAt) : null,
          lineItems: {
            create: resolved.map((r) => ({
              skuCatalogId: r.skuCatalogId,
              quantity: r.quantity,
              stage: LineItemStage.REQUESTED,
              serviceNowSysId: r.serviceNowSysId,
              serviceNowNumber: r.serviceNowNumber,
              serviceNowTaskSysId: r.serviceNowTaskSysId,
              serviceNowTaskNumber: r.serviceNowTaskNumber,
            })),
          },
        },
        include: { lineItems: true },
      });
      // H4: id + opco code + count only, never the target UPN (PII).
      this.logger.log(
        `Intake created request ${created.id} (opco ${opco.code}, ${resolved.length} line items)`,
      );
      return created;
    } catch (err) {
      // Concurrent retry raced past the pre-check → unique violation on REQ sysId.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this.findByReq(dto.serviceNowSysId);
        if (raced) {
          this.logger.log(
            `Intake skip (race): request already created for REQ ${dto.serviceNowSysId} (${raced.id})`,
          );
          return raced;
        }
      }
      throw err;
    }
  }

  private findByReq(serviceNowSysId: string) {
    return this.prisma.request.findUnique({
      where: { serviceNowSysId },
      include: { lineItems: true },
    });
  }
}
