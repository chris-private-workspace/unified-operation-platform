import { Module } from '@nestjs/common';

/**
 * Module D — onboarding request lifecycle (triage → sync gate → assign →
 * ledger → ServiceNow write-back). Empty shell for W01 bootstrap so AppModule
 * compiles; services land in a later phase (see BACKLOG MOD-D, DESIGN.md §11).
 */
@Module({})
export class FulfilmentModule {}
