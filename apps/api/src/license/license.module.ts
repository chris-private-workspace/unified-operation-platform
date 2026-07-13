import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { CatalogService } from './catalog.service';
import { ReconcileService } from './reconcile.service';
import { AllocationImportService } from './allocation-import.service';
import { LicenseController } from './license.controller';

/**
 * Module C — SKU catalog dictionary + total-level reconciliation.
 * Consumes tenant subscribedSkus (via GraphService) to seed SkuCatalog and
 * detect SKU-total drift (Option 甲). PrismaService comes from the @Global
 * PrismaModule. Ledger writes / assignment belong to Module D (W03/04).
 */
@Module({
  imports: [IntegrationModule], // GraphService
  controllers: [LicenseController],
  providers: [CatalogService, ReconcileService, AllocationImportService],
  exports: [CatalogService, ReconcileService, AllocationImportService],
})
export class LicenseModule {}
