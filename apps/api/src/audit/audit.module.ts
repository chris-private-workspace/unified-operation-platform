import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Platform audit trail (ADR-0009).
 *
 * @Global, like PrismaModule: the audit trail cuts across identity, OpCo,
 * catalog and reconciliation, so making every one of those modules declare an
 * import would be churn without benefit — and each edit is a chance to touch
 * something unrelated (§1.3). AuditService holds no state of its own; it only
 * writes through the transaction handle its caller supplies.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
