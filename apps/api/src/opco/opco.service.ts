import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface OpcoOption {
  id: string;
  code: string;
  displayName: string;
}

@Injectable()
export class OpcoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active OpCos for picker selectors (id + code + displayName only). */
  listActive(): Promise<OpcoOption[]> {
    return this.prisma.opco.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, displayName: true },
    });
  }
}
