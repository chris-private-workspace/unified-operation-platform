import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { CatalogService } from './catalog.service';
import { ReconcileService } from './reconcile.service';
import { AllocationImportService } from './allocation-import.service';
import { LedgerReadService } from './ledger-read.service';
import { CatalogSyncResultDto, SkuCatalogDto } from './dto/catalog.dto';
import { DriftAlertDto, ReconcileResultDto } from './dto/reconcile.dto';
import {
  LedgerImportRequestDto,
  LedgerImportResultDto,
} from './dto/ledger-import.dto';
import { LedgerRowDto, LedgerStatsDto } from './dto/ledger-read.dto';

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
    private readonly reconcile: ReconcileService,
    private readonly allocationImport: AllocationImportService,
    private readonly ledgerRead: LedgerReadService,
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

  @Post('reconcile')
  @ApiOkResponse({ type: ReconcileResultDto })
  runReconcile(): Promise<ReconcileResultDto> {
    return this.reconcile.reconcile();
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
    @Body() dto: LedgerImportRequestDto,
  ): Promise<LedgerImportResultDto> {
    return this.allocationImport.import(dto);
  }

  /**
   * Per-OpCo ledger read-model (BE-ledger-read / W14). Read GET → also allows
   * OPCO_IT; scopeWhere restricts OPCO_IT to its own OpCo (AUTH-3a).
   */
  @Get('ledger')
  @Roles(Role.ADMIN, Role.REGIONAL, Role.OPCO_IT)
  @ApiOkResponse({ type: [LedgerRowDto] })
  listLedger(@CurrentUser() actor: AuthUser): Promise<LedgerRowDto[]> {
    return this.ledgerRead.listLedger(actor);
  }

  @Get('ledger/stats')
  @Roles(Role.ADMIN, Role.REGIONAL, Role.OPCO_IT)
  @ApiOkResponse({ type: LedgerStatsDto })
  ledgerStats(@CurrentUser() actor: AuthUser): Promise<LedgerStatsDto> {
    return this.ledgerRead.ledgerStats(actor);
  }
}
