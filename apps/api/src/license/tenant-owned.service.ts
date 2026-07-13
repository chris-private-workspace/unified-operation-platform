import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantSkuRowDto, TenantSkuStatsDto } from './dto/tenant-owned.dto';

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
      },
      orderBy: [{ category: 'asc' }, { skuPartNumber: 'asc' }],
    });

    const out: TenantSkuRowDto[] = [];
    for (const sku of catalog) {
      const snap = latest.get(sku.id);
      const led = ledger.get(sku.id);
      // Show a SKU only if it is owned (has a snapshot) or allocated (has ledger).
      if (!snap && !led) continue;

      const owned = snap ? snap.prepaidEnabled : null;
      const allocatedToOpcos = led?.allocated ?? 0;
      const assignedToUsers = led?.assigned ?? 0;
      out.push({
        skuCatalogId: sku.id,
        sku: {
          skuId: sku.skuId,
          skuPartNumber: sku.skuPartNumber,
          displayName: sku.displayName,
          category: sku.category,
        },
        owned,
        tenantConsumed: snap ? snap.consumedUnits : null,
        allocatedToOpcos,
        assignedToUsers,
        unallocated: owned !== null ? owned - allocatedToOpcos : null,
        overAllocated: owned !== null && allocatedToOpcos > owned,
      });
    }
    return out;
  }

  async listTenantSkus(): Promise<TenantSkuRowDto[]> {
    return this.rows();
  }

  async tenantSkuStats(): Promise<TenantSkuStatsDto> {
    const rows = await this.rows();
    const totalOwned = rows.reduce((s, r) => s + (r.owned ?? 0), 0);
    const totalAllocated = rows.reduce((s, r) => s + r.allocatedToOpcos, 0);
    const totalAssigned = rows.reduce((s, r) => s + r.assignedToUsers, 0);
    return {
      totalOwned,
      totalAllocated,
      totalAssigned,
      totalUnallocated: totalOwned - totalAllocated,
      skusOverAllocated: rows.filter((r) => r.overAllocated).length,
    };
  }
}
