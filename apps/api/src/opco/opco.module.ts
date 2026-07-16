import { Module } from '@nestjs/common';
import { OpcoController } from './opco.controller';
import { OpcoAdminController } from './opco-admin.controller';
import { OpcoService } from './opco.service';

/**
 * OpCo picker (GET /opcos) + admin management console (admin/opcos, CH-004).
 * Prisma from @Global.
 */
@Module({
  controllers: [OpcoController, OpcoAdminController],
  providers: [OpcoService],
})
export class OpcoModule {}
