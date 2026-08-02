import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { CatalogService } from './catalog.service';
import { ReconcileService } from './reconcile.service';
import { AllocationImportService } from './allocation-import.service';
import { AllocationResetService } from './allocation-reset.service';
import { LedgerFullResetService } from './ledger-full-reset.service';
import { LedgerReadService } from './ledger-read.service';
import { LedgerWriteService } from './ledger-write.service';
import { TenantOwnedService } from './tenant-owned.service';
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
  providers: [
    CatalogService,
    ReconcileService,
    AllocationImportService,
    // CH-016 — the reverse of the import: zero allocatedQuantity so a bad
    // upload can be redone. Separate service because the two share nothing but
    // the column they write, and only one of them is destructive.
    AllocationResetService,
    // CH-017 / ADR-0022 — zeroes BOTH numbers. Its own service rather than a
    // flag on the one above, so that service's "assignedQuantity never appears
    // in my write path" invariant stays true (ADR-0022 D2).
    LedgerFullResetService,
    LedgerReadService,
    LedgerWriteService,
    TenantOwnedService,
  ],
  exports: [
    CatalogService,
    ReconcileService,
    AllocationImportService,
    // CH-016 — the reverse of the import: zero allocatedQuantity so a bad
    // upload can be redone. Separate service because the two share nothing but
    // the column they write, and only one of them is destructive.
    AllocationResetService,
    // CH-017 / ADR-0022 — zeroes BOTH numbers. Its own service rather than a
    // flag on the one above, so that service's "assignedQuantity never appears
    // in my write path" invariant stays true (ADR-0022 D2).
    LedgerFullResetService,
    LedgerReadService,
    LedgerWriteService,
    TenantOwnedService,
  ],
})
export class LicenseModule {}
