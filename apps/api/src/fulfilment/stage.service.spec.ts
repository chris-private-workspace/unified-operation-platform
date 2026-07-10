import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type AppUser, LineItemStage, RequestStatus } from '@prisma/client';
import { StageService, aggregateRequestStatus } from './stage.service';
import { PrismaService } from '../prisma/prisma.service';

const S = LineItemStage;

// Actors (AUTH-3a): ADMIN.id = 'actor1' so the event's actorId assertion holds.
const ADMIN = { id: 'actor1', opcoScopeId: null } as unknown as AppUser;
const RHK_IT = { id: 'opco-u', opcoScopeId: 'opcoA' } as unknown as AppUser;
const OTHER_IT = { id: 'opco-b', opcoScopeId: 'opcoB' } as unknown as AppUser;

describe('aggregateRequestStatus (pure, OD4)', () => {
  it('empty → OPEN', () => {
    expect(aggregateRequestStatus([])).toBe(RequestStatus.OPEN);
  });
  it('all REQUESTED → OPEN', () => {
    expect(aggregateRequestStatus([S.REQUESTED, S.REQUESTED])).toBe(
      RequestStatus.OPEN,
    );
  });
  it('any in-flight → IN_PROGRESS', () => {
    expect(aggregateRequestStatus([S.REQUESTED, S.QUOTING])).toBe(
      RequestStatus.IN_PROGRESS,
    );
    expect(aggregateRequestStatus([S.READY])).toBe(RequestStatus.IN_PROGRESS);
  });
  it('all CANCELLED → CANCELLED', () => {
    expect(aggregateRequestStatus([S.CANCELLED, S.CANCELLED])).toBe(
      RequestStatus.CANCELLED,
    );
  });
  it('active items all ASSIGNED (cancelled ignored) → COMPLETED', () => {
    expect(aggregateRequestStatus([S.ASSIGNED, S.CANCELLED])).toBe(
      RequestStatus.COMPLETED,
    );
  });
});

describe('StageService.advanceStage', () => {
  let service: StageService;
  let prisma: {
    requestLineItem: Record<string, jest.Mock>;
    requestEvent: Record<string, jest.Mock>;
    request: Record<string, jest.Mock>;
  };

  const lineItem = (stage: LineItemStage) => ({
    id: 'li1',
    requestId: 'r1',
    stage,
    request: { opcoId: 'opcoA' },
  });

  beforeEach(async () => {
    prisma = {
      requestLineItem: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'li1' }),
        findMany: jest.fn().mockResolvedValue([]), // for recompute
      },
      requestEvent: { create: jest.fn() },
      request: { update: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [StageService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(StageService);
  });

  it('allows a legal procurement step REQUESTED → QUOTING (stamps quotedAt + event)', async () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(lineItem(S.REQUESTED));

    await service.advanceStage('li1', S.QUOTING, ADMIN);

    const updateArg = prisma.requestLineItem.update.mock.calls[0][0];
    expect(updateArg.data.stage).toBe(S.QUOTING);
    expect(updateArg.data.quotedAt).toBeInstanceOf(Date);
    expect(prisma.requestEvent.create).toHaveBeenCalledWith({
      data: {
        requestId: 'r1',
        lineItemId: 'li1',
        type: 'STAGE_CHANGE',
        fromStage: S.REQUESTED,
        toStage: S.QUOTING,
        actorId: 'actor1',
      },
    });
    expect(prisma.request.update).toHaveBeenCalled(); // recompute persisted
  });

  it('allows the short path REQUESTED → READY (stamps readyAt)', async () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(lineItem(S.REQUESTED));

    await service.advanceStage('li1', S.READY, ADMIN);

    const updateArg = prisma.requestLineItem.update.mock.calls[0][0];
    expect(updateArg.data.stage).toBe(S.READY);
    expect(updateArg.data.readyAt).toBeInstanceOf(Date);
  });

  it('rejects an illegal jump REQUESTED → OPCO_APPROVED (no writes)', async () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(lineItem(S.REQUESTED));

    await expect(
      service.advanceStage('li1', S.OPCO_APPROVED, ADMIN),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.requestLineItem.update).not.toHaveBeenCalled();
    expect(prisma.requestEvent.create).not.toHaveBeenCalled();
  });

  it('rejects → ASSIGNED (belongs to D-2)', async () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(lineItem(S.READY));

    await expect(
      service.advanceStage('li1', S.ASSIGNED, ADMIN),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.requestLineItem.update).not.toHaveBeenCalled();
  });

  it('allows cancelling a non-terminal item (READY → CANCELLED)', async () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(lineItem(S.READY));

    await service.advanceStage('li1', S.CANCELLED, ADMIN);

    expect(prisma.requestLineItem.update.mock.calls[0][0].data.stage).toBe(
      S.CANCELLED,
    );
  });

  it('throws NotFound when the line item does not exist', async () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(null);

    await expect(
      service.advanceStage('missing', S.READY, ADMIN),
    ).rejects.toThrow(NotFoundException);
  });

  // AUTH-3a scope guard (H5 critical path)
  it('OPCO_IT in its own OpCo may advance a stage', async () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(lineItem(S.REQUESTED));

    await service.advanceStage('li1', S.READY, RHK_IT); // scope opcoA == item opcoA

    expect(prisma.requestLineItem.update).toHaveBeenCalled();
  });

  it('OPCO_IT out of scope → 403, no writes (fail-closed)', async () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(lineItem(S.REQUESTED));

    await expect(
      service.advanceStage('li1', S.READY, OTHER_IT), // scope opcoB != item opcoA
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.requestLineItem.update).not.toHaveBeenCalled();
    expect(prisma.requestEvent.create).not.toHaveBeenCalled();
  });
});
