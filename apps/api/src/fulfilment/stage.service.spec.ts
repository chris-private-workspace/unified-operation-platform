import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LineItemStage, RequestStatus } from '@prisma/client';
import { StageService, aggregateRequestStatus } from './stage.service';
import { PrismaService } from '../prisma/prisma.service';

const S = LineItemStage;

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

    await service.advanceStage('li1', S.QUOTING, 'actor1');

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

    await service.advanceStage('li1', S.READY);

    const updateArg = prisma.requestLineItem.update.mock.calls[0][0];
    expect(updateArg.data.stage).toBe(S.READY);
    expect(updateArg.data.readyAt).toBeInstanceOf(Date);
  });

  it('rejects an illegal jump REQUESTED → OPCO_APPROVED (no writes)', async () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(lineItem(S.REQUESTED));

    await expect(service.advanceStage('li1', S.OPCO_APPROVED)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.requestLineItem.update).not.toHaveBeenCalled();
    expect(prisma.requestEvent.create).not.toHaveBeenCalled();
  });

  it('rejects → ASSIGNED (belongs to D-2)', async () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(lineItem(S.READY));

    await expect(service.advanceStage('li1', S.ASSIGNED)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.requestLineItem.update).not.toHaveBeenCalled();
  });

  it('allows cancelling a non-terminal item (READY → CANCELLED)', async () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(lineItem(S.READY));

    await service.advanceStage('li1', S.CANCELLED);

    expect(prisma.requestLineItem.update.mock.calls[0][0].data.stage).toBe(
      S.CANCELLED,
    );
  });

  it('throws NotFound when the line item does not exist', async () => {
    prisma.requestLineItem.findUnique.mockResolvedValue(null);

    await expect(service.advanceStage('missing', S.READY)).rejects.toThrow(
      NotFoundException,
    );
  });
});
