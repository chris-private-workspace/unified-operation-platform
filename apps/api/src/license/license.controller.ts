import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CatalogService } from './catalog.service';
import { ReconcileService } from './reconcile.service';
import { CatalogSyncResultDto, SkuCatalogDto } from './dto/catalog.dto';
import { DriftAlertDto, ReconcileResultDto } from './dto/reconcile.dto';

/**
 * Module C surface — SKU catalog + total-level reconciliation.
 * The sync / reconcile POSTs are manual triggers this phase (OD1: daily @Cron
 * deferred to the orchestration phase). Guarded to ADMIN / REGIONAL (ADR-0002).
 */
@ApiTags('license')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.REGIONAL)
@Controller('license')
export class LicenseController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly reconcile: ReconcileService,
  ) {}

  @Post('catalog/sync')
  @ApiOkResponse({ type: CatalogSyncResultDto })
  syncCatalog(): Promise<CatalogSyncResultDto> {
    return this.catalog.syncFromTenant();
  }

  @Get('catalog')
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
  @ApiOkResponse({ type: [DriftAlertDto] })
  listDrift(): Promise<DriftAlertDto[]> {
    return this.reconcile.listDrift();
  }
}
