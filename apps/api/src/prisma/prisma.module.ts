import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global so PrismaService is injectable everywhere without re-importing.
 * State layer (see docs/architecture.md §3): the single DB access point.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
