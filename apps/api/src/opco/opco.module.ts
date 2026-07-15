import { Module } from '@nestjs/common';
import { OpcoController } from './opco.controller';
import { OpcoService } from './opco.service';

/** OpCo lookup for picker selectors (GET /opcos). Prisma from @Global. */
@Module({
  controllers: [OpcoController],
  providers: [OpcoService],
})
export class OpcoModule {}
