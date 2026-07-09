import { Module } from '@nestjs/common';

/**
 * Module C — SKU catalog + total-level reconciliation + per-OpCo ledger.
 * Empty shell for W01 bootstrap so AppModule compiles; catalog/reconcile
 * services land in a later phase (see BACKLOG MOD-C, licenseops/DESIGN.md §11).
 */
@Module({})
export class LicenseModule {}
