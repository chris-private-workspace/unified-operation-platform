import { Test } from '@nestjs/testing';
import { OpcoService } from './opco.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OpcoService', () => {
  let service: OpcoService;
  let prisma: { opco: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { opco: { findMany: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [OpcoService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(OpcoService);
  });

  it('lists active OpCos, code-sorted, id/code/displayName only', async () => {
    prisma.opco.findMany.mockResolvedValue([
      { id: 'o1', code: 'RHK', displayName: 'Ricoh HK' },
    ]);

    const res = await service.listActive();

    expect(res).toEqual([{ id: 'o1', code: 'RHK', displayName: 'Ricoh HK' }]);
    expect(prisma.opco.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, displayName: true },
    });
  });
});
