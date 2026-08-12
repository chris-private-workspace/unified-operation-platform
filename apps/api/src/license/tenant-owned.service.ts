import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantSkuRowDto, TenantSkuStatsDto } from './dto/tenant-owned.dto';
import { SEAT_MODEL } from './seat-model';

/**
 * BE-tenant-owned (W16) — tenant-level per-SKU read-model for the Assets
 * Platform mode. Three layers (DESIGN §5): owned (M365 prepaidUnits.enabled,
 * from the latest TenantSkuSnapshot) → allocatedToOpcos (Σ OpCo budget) →
 * assignedToUsers (Σ assigned). Read-only, tenant-wide (no per-OpCo scope — the
 * controller restricts it to ADMIN / REGIONAL). owned is the persisted snapshot
 * value; this service never calls Graph (OD4 — a GET has no side-effect / can't
 * crash on tenant unavailability).
 */
@Injectable()
export class TenantOwnedService {
  constructor(private readonly prisma: PrismaService) {}

  /** The per-SKU tenant rows — shared by both the list and the stats read. */
  private async rows(): Promise<TenantSkuRowDto[]> {
    // Latest snapshot per SKU: newest first, keep the first seen (snapshots are
    // small, so a JS first-seen map beats a correlated subquery — cf. W14).
    const snaps = await this.prisma.tenantSkuSnapshot.findMany({
      orderBy: { capturedAt: 'desc' },
      select: { skuCatalogId: true, prepaidEnabled: true, consumedUnits: true },
    });
    const latest = new Map<
      string,
      { prepaidEnabled: number; consumedUnits: number }
    >();
    for (const s of snaps) {
      if (!latest.has(s.skuCatalogId)) {
        latest.set(s.skuCatalogId, {
          prepaidEnabled: s.prepaidEnabled,
          consumedUnits: s.consumedUnits,
        });
      }
    }

    // Σ allocated / assigned per SKU across every OpCo (tenant-wide, no scope).
    const sums = await this.prisma.opcoSkuLedger.groupBy({
      by: ['skuCatalogId'],
      _sum: { allocatedQuantity: true, assignedQuantity: true },
    });
    const ledger = new Map<string, { allocated: number; assigned: number }>();
    for (const g of sums) {
      ledger.set(g.skuCatalogId, {
        allocated: g._sum.allocatedQuantity ?? 0,
        assigned: g._sum.assignedQuantity ?? 0,
      });
    }

    const catalog = await this.prisma.skuCatalog.findMany({
      where: { active: true },
      select: {
        id: true,
        skuId: true,
        skuPartNumber: true,
        displayName: true,
        category: true,
        seatModel: true,
      },
      orderBy: [{ category: 'asc' }, { skuPartNumber: 'asc' }],
    });

    const out: TenantSkuRowDto[] = [];
    for (const sku of catalog) {
      const snap = latest.get(sku.id);
      const led = ledger.get(sku.id);
      // Show a SKU only if it is owned (has a snapshot) or allocated (has ledger).
      if (!snap && !led) continue;

      // ADR-0032 D1 — `owned` itself is still the raw snapshot value; nothing
      // here rewrites what the tenant reported. What the seat model changes is
      // which DERIVATIONS of it mean anything.
      const unlimited = sku.seatModel === SEAT_MODEL.UNLIMITED;
      const owned = snap ? snap.prepaidEnabled : null;
      const tenantConsumed = snap ? snap.consumedUnits : null;
      const allocatedToOpcos = led?.allocated ?? 0;
      const assignedToUsers = led?.assigned ?? 0;
      /**
       * ADR-0032 D2 — derived, never curated: this is a STATE, not a seat
       * model, and the platform can see it without anyone maintaining it.
       *
       * 🔴 OQ-5 answered 2026-08-12 (read-only /subscribedSkus probe): all 15
       * such SKUs on the live tenant DO have seats. They sit in
       * `prepaidUnits.warning` (subscription lapsed — 11) or `.suspended`
       * (cancelled — 4), and `enabled` is the only one of the four fields
       * graph.service.ts reads. The name says what we measured (`enabled` is
       * 0); the labels around it must not claim the seats were never bought.
       */
      const noPrepaidSeats =
        !unlimited && owned === 0 && (tenantConsumed ?? 0) > 0;
      out.push({
        skuCatalogId: sku.id,
        sku: {
          skuId: sku.skuId,
          skuPartNumber: sku.skuPartNumber,
          displayName: sku.displayName,
          category: sku.category,
        },
        seatModel: sku.seatModel,
        owned,
        tenantConsumed,
        allocatedToOpcos,
        assignedToUsers,
        // null, not 0 (ADR-0032 D3): "0 left" is an answer, and it is the wrong
        // one for both of these — an unlimited SKU has no denominator, and a
        // SKU with no prepaid seats has nothing to leave unallocated either.
        unallocated:
          unlimited || noPrepaidSeats || owned === null
            ? null
            : owned - allocatedToOpcos,
        // An unlimited SKU cannot be over-allocated against a sentinel. A
        // noPrepaidSeats one still can (0 owned, seats handed to OpCos anyway),
        // and that stays visible — it is a real inconsistency.
        overAllocated: !unlimited && owned !== null && allocatedToOpcos > owned,
        noPrepaidSeats,
      });
    }
    return out;
  }

  async listTenantSkus(): Promise<TenantSkuRowDto[]> {
    return this.rows();
  }

  async tenantSkuStats(): Promise<TenantSkuStatsDto> {
    const rows = await this.rows();
    /**
     * ADR-0032 D3 / OQ-4 — the owned total counts prepaid SKUs only. On the
     * live tenant the sentinels alone contributed 4,220,000 against a largest
     * real purchase of 4,502: the old total was not "slightly off", it was
     * ~99% sentinel.
     *
     * 🔴 allocated / assigned are NOT filtered. Those are real numbers on an
     * unlimited SKU too — an OpCo budget still exists and still gates assigns
     * (D4 leaves the budget gate alone), and people really are using the
     * licence. Only the derivations OF `owned` have to shrink to the prepaid
     * world, which is why `totalUnallocated` subtracts the prepaid allocation
     * rather than the full one. `unlimitedSkus` is what stops that difference
     * from being a silent one.
     */
    const prepaid = rows.filter((r) => r.seatModel !== SEAT_MODEL.UNLIMITED);
    const totalOwned = prepaid.reduce((s, r) => s + (r.owned ?? 0), 0);
    const prepaidAllocated = prepaid.reduce(
      (s, r) => s + r.allocatedToOpcos,
      0,
    );
    return {
      totalOwned,
      totalAllocated: rows.reduce((s, r) => s + r.allocatedToOpcos, 0),
      totalAssigned: rows.reduce((s, r) => s + r.assignedToUsers, 0),
      totalUnallocated: totalOwned - prepaidAllocated,
      skusOverAllocated: rows.filter((r) => r.overAllocated).length,
      unlimitedSkus: rows.length - prepaid.length,
    };
  }
}
