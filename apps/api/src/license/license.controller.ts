import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { CatalogService } from './catalog.service';
import { CatalogImportService } from './catalog-import.service';
import { ReconcileService } from './reconcile.service';
import { AllocationImportService } from './allocation-import.service';
import { AllocationResetService } from './allocation-reset.service';
import { LedgerFullResetService } from './ledger-full-reset.service';
import { LedgerReadService } from './ledger-read.service';
import { LedgerWriteService } from './ledger-write.service';
import { TenantOwnedService } from './tenant-owned.service';
import {
  CatalogSyncResultDto,
  SkuCatalogDto,
  UpdateSkuCatalogDto,
} from './dto/catalog.dto';
import {
  CatalogImportRequestDto,
  CatalogImportResultDto,
} from './dto/catalog-import.dto';
import { DriftAlertDto, ReconcileResultDto } from './dto/reconcile.dto';
import {
  LedgerImportRequestDto,
  LedgerImportResultDto,
} from './dto/ledger-import.dto';
import {
  AllocationResetRequestDto,
  AllocationResetResultDto,
} from './dto/allocation-reset.dto';
import {
  LedgerFullResetRequestDto,
  LedgerFullResetResultDto,
} from './dto/ledger-full-reset.dto';
import { LedgerRowDto, LedgerStatsDto } from './dto/ledger-read.dto';
import { UpdateLedgerDto } from './dto/ledger-write.dto';
import { TenantSkuRowDto, TenantSkuStatsDto } from './dto/tenant-owned.dto';

/**
 * Module C surface — SKU catalog + total-level reconciliation.
 * The sync / reconcile POSTs are manual triggers this phase (OD1: daily @Cron
 * deferred to the orchestration phase). Controller default = ADMIN / REGIONAL
 * (ADR-0002); the read GETs also allow OPCO_IT (AUTH-3a OD2 — tenant totals are
 * not per-OpCo, so OPCO_IT may view them; the write POSTs stay ADMIN / REGIONAL).
 */
@ApiTags('license')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.REGIONAL)
@Controller('license')
export class LicenseController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly catalogImport: CatalogImportService,
    private readonly reconcile: ReconcileService,
    private readonly allocationImport: AllocationImportService,
    private readonly allocationReset: AllocationResetService,
    private readonly ledgerFullReset: LedgerFullResetService,
    private readonly ledgerRead: LedgerReadService,
    private readonly ledgerWrite: LedgerWriteService,
    private readonly tenantOwned: TenantOwnedService,
  ) {}

  @Post('catalog/sync')
  @ApiOkResponse({ type: CatalogSyncResultDto })
  syncCatalog(): Promise<CatalogSyncResultDto> {
    return this.catalog.syncFromTenant();
  }

  @Get('catalog')
  @Roles(Role.ADMIN, Role.REGIONAL, Role.OPCO_IT)
  @ApiOkResponse({ type: [SkuCatalogDto] })
  listCatalog(): Promise<SkuCatalogDto[]> {
    return this.catalog.listCatalog();
  }

  /**
   * Human curation of one SKU (CH-003) — alias / category / base-flag only.
   * ADMIN / REGIONAL (inherits the class default); OPCO_IT can't curate the
   * shared dictionary. skuId / part number / display name stay system-owned.
   */
  @Patch('catalog/:id')
  @ApiOkResponse({ type: SkuCatalogDto })
  updateCatalog(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSkuCatalogDto,
  ): Promise<SkuCatalogDto> {
    return this.catalog.updateEntry(actor.id, id, dto);
  }

  /**
   * Bulk curation (CH-019 / ADR-0023) — the SKU Catalog export, edited and
   * uploaded back. Same three columns and same roles as the PATCH above; the
   * difference is scale, a dry-run preview, and two fail-closed gates (alias
   * collisions, alias clears). 200 rather than 201: a dry run creates nothing,
   * and a commit updates existing rows.
   */
  @Post('catalog/import')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CatalogImportResultDto })
  importCatalog(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CatalogImportRequestDto,
  ): Promise<CatalogImportResultDto> {
    return this.catalogImport.import(actor.id, dto);
  }

  @Post('reconcile')
  @ApiOkResponse({ type: ReconcileResultDto })
  runReconcile(@CurrentUser() actor: AuthUser): Promise<ReconcileResultDto> {
    return this.reconcile.reconcile(actor.id);
  }

  @Get('drift')
  @Roles(Role.ADMIN, Role.REGIONAL, Role.OPCO_IT)
  @ApiOkResponse({ type: [DriftAlertDto] })
  listDrift(): Promise<DriftAlertDto[]> {
    return this.reconcile.listDrift();
  }

  /**
   * Allocation import (ADR-0004 / W13). ADMIN / REGIONAL only — a central
   * all-OpCo op, so OPCO_IT is excluded (OD2). dry-run by default (OD4).
   */
  @Post('ledger/import')
  @Roles(Role.ADMIN, Role.REGIONAL)
  @ApiOkResponse({ type: LedgerImportResultDto })
  importAllocation(
    @CurrentUser() actor: AuthUser,
    @Body() dto: LedgerImportRequestDto,
  ): Promise<LedgerImportResultDto> {
    return this.allocationImport.import(actor.id, dto);
  }

  /**
   * Allocation reset (CH-016) — zero allocatedQuantity so a bad import can be
   * redone from scratch. Same roles as the import above: it is the same central
   * all-OpCo operation, in reverse.
   *
   * 200, not Nest's default 201: a dry-run creates nothing at all, and a commit
   * updates existing rows. Nothing here is a new resource.
   */
  @Post('ledger/allocation/reset')
  @Roles(Role.ADMIN, Role.REGIONAL)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AllocationResetResultDto })
  resetAllocation(
    @CurrentUser() actor: AuthUser,
    @Body() dto: AllocationResetRequestDto,
  ): Promise<AllocationResetResultDto> {
    return this.allocationReset.reset(actor.id, dto);
  }

  /**
   * Ledger full reset (CH-017 / ADR-0022) — zero BOTH numbers so the ledger can
   * be repopulated from scratch. Rows are never deleted.
   *
   * ADMIN only, unlike the allocation reset directly above, and the difference
   * is not tidiness: a wiped allocation comes back with an import, a wiped
   * assigned baseline does not (ADR-0004 #5) — it needs ADR-0014's script. The
   * two operations do not carry the same risk, so they do not carry the same
   * roles. `confirm` in the body is the second gate (ADR-0022 D6).
   */
  @Post('ledger/reset')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LedgerFullResetResultDto })
  resetLedger(
    @CurrentUser() actor: AuthUser,
    @Body() dto: LedgerFullResetRequestDto,
  ): Promise<LedgerFullResetResultDto> {
    return this.ledgerFullReset.reset(actor.id, dto);
  }

  /**
   * Per-OpCo ledger read-model (BE-ledger-read / W14). Read GET → also allows
   * OPCO_IT; scopeWhere restricts OPCO_IT to its own OpCo (AUTH-3a).
   * CH-008: 0/0 rows are excluded by default; ?includeEmpty=true brings them
   * back (mirrors the /admin/opcos ?includeInactive convention).
   */
  @Get('ledger')
  @Roles(Role.ADMIN, Role.REGIONAL, Role.OPCO_IT)
  @ApiQuery({ name: 'includeEmpty', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: [LedgerRowDto] })
  listLedger(
    @CurrentUser() actor: AuthUser,
    @Query('includeEmpty') includeEmpty?: string,
  ): Promise<LedgerRowDto[]> {
    return this.ledgerRead.listLedger(actor, includeEmpty === 'true');
  }

  @Get('ledger/stats')
  @Roles(Role.ADMIN, Role.REGIONAL, Role.OPCO_IT)
  @ApiQuery({ name: 'includeEmpty', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: LedgerStatsDto })
  ledgerStats(
    @CurrentUser() actor: AuthUser,
    @Query('includeEmpty') includeEmpty?: string,
  ): Promise<LedgerStatsDto> {
    return this.ledgerRead.ledgerStats(actor, includeEmpty === 'true');
  }

  /**
   * Manual per-row ledger correction (ADR-0007 / W23-A). The only per-cell
   * hand-edit path (import = bulk allocated; assign = +1 assigned). OPCO_IT is
   * allowed but scope-gated in the service (assertOpcoScope → own OpCo only,
   * 403 otherwise); each changed field is audited in LedgerAdjustment.
   */
  @Patch('ledger/:id')
  @Roles(Role.ADMIN, Role.REGIONAL, Role.OPCO_IT)
  @ApiOkResponse({ type: LedgerRowDto })
  updateLedger(
    @Param('id') id: string,
    @Body() dto: UpdateLedgerDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<LedgerRowDto> {
    return this.ledgerWrite.updateLedgerRow(actor, id, dto);
  }

  /**
   * Tenant-level per-SKU read-model for the Assets Platform mode (BE-tenant-owned
   * / W16). ADMIN / REGIONAL only — a tenant-wide owned/allocated/unallocated
   * planning view, gated like the prototype's `showPlatformMode` (OPCO_IT gets
   * the per-OpCo By-OpCo view instead; W15). No scope: totals span all OpCos.
   */
  @Get('tenant-skus')
  @ApiOkResponse({ type: [TenantSkuRowDto] })
  listTenantSkus(): Promise<TenantSkuRowDto[]> {
    return this.tenantOwned.listTenantSkus();
  }

  @Get('tenant-skus/stats')
  @ApiOkResponse({ type: TenantSkuStatsDto })
  tenantSkuStats(): Promise<TenantSkuStatsDto> {
    return this.tenantOwned.tenantSkuStats();
  }
}
