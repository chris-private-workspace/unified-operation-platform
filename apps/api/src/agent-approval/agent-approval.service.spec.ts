import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { AgentApprovalService } from './agent-approval.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestService } from '../fulfilment/request.service';
import { AiAssistService } from '../agent/ai-assist.service';

/**
 * W46 A10 — approve creates the line items and the run carries on; reject
 * changes nothing and says why.
 *
 * 🔴 The claim this file is really pinning is the ORDER and the ACTOR. Both are
 * invisible in a passing feature and expensive when wrong:
 *   - the proposal is marked `executed` BEFORE the resume, because
 *     `propose_line_items.execute` refuses when it cannot find that row, and
 *     that refusal is the second layer under D2;
 *   - the domain write is done as the APPROVER, while the agent's read scope
 *     stays the run starter's. Collapsing those two people would let an
 *     approval widen what the agent can see.
 */

const GUID_A = '11111111-2222-3333-4444-555555555555';
const GUID_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const approver = { id: 'u-admin', opcoScopeId: null } as unknown as AppUser;

const pendingProposal = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  runId: 'run-1',
  kind: 'line_items',
  status: 'pending',
  interruptionRef: 'call-1',
  payload: {
    requestId: 'req-1',
    items: [{ skuId: GUID_A, quantity: 2 }],
  },
  run: { status: 'awaiting_approval' },
  ...overrides,
});

describe('AgentApprovalService', () => {
  let service: AgentApprovalService;
  let prisma: {
    agentProposal: { findUnique: jest.Mock; update: jest.Mock };
    agentRun: { findUnique: jest.Mock };
    skuCatalog: { findMany: jest.Mock };
  };
  let requests: { addLineItem: jest.Mock };
  let aiAssist: { resumeRun: jest.Mock };

  beforeEach(async () => {
    prisma = {
      agentProposal: { findUnique: jest.fn(), update: jest.fn() },
      agentRun: { findUnique: jest.fn() },
      skuCatalog: { findMany: jest.fn() },
    };
    requests = { addLineItem: jest.fn() };
    aiAssist = { resumeRun: jest.fn() };

    prisma.agentProposal.findUnique.mockResolvedValue(pendingProposal());
    prisma.agentProposal.update.mockResolvedValue({});
    prisma.agentRun.findUnique.mockResolvedValue({ requestId: 'req-1' });
    prisma.skuCatalog.findMany.mockResolvedValue([
      { id: 'cat-a', skuId: GUID_A },
      { id: 'cat-b', skuId: GUID_B },
    ]);
    requests.addLineItem.mockResolvedValue({ id: 'line-1' });
    aiAssist.resumeRun.mockResolvedValue({
      runId: 'run-1',
      status: 'completed',
      proposals: [],
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentApprovalService,
        { provide: PrismaService, useValue: prisma },
        { provide: RequestService, useValue: requests },
        { provide: AiAssistService, useValue: aiAssist },
      ],
    }).compile();
    service = moduleRef.get(AgentApprovalService);
  });

  // ── A10 first half — approve ───────────────────────────────

  describe('approve', () => {
    it('creates the line items through the existing path and resumes the run', async () => {
      const result = await service.approve('p1', approver);

      expect(requests.addLineItem).toHaveBeenCalledTimes(1);
      expect(requests.addLineItem).toHaveBeenCalledWith(
        'req-1',
        { skuCatalogId: 'cat-a', quantity: 2 },
        approver,
      );
      expect(aiAssist.resumeRun).toHaveBeenCalledWith('run-1', [
        { ref: 'call-1', approved: true },
      ]);
      expect(result.status).toBe('completed');
    });

    it('passes the APPROVER as the domain actor, not the run starter', async () => {
      await service.approve('p1', approver);

      // The third argument is who the domain path holds accountable for the
      // write. The run starter's identity governs what the AGENT may read
      // (AiAssistService.resumeRun) and has no business authorising anything.
      expect(requests.addLineItem.mock.calls[0][2]).toBe(approver);
    });

    it('marks the proposal executed BEFORE resuming', async () => {
      await service.approve('p1', approver);

      // Not decoration: propose_line_items.execute looks for an `executed`
      // proposal and throws when there is none. Resuming first would make the
      // tool refuse the very work that had just been done.
      expect(
        prisma.agentProposal.update.mock.invocationCallOrder[0],
      ).toBeLessThan(aiAssist.resumeRun.mock.invocationCallOrder[0]);

      const { data } = prisma.agentProposal.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data.status).toBe('executed');
      expect(data.approvedById).toBe('u-admin');
      expect(data.decidedAt).toBeInstanceOf(Date);
    });

    it('resolves every SKU before creating anything', async () => {
      prisma.agentProposal.findUnique.mockResolvedValue(
        pendingProposal({
          payload: {
            requestId: 'req-1',
            items: [
              { skuId: GUID_A, quantity: 1 },
              { skuId: GUID_B, quantity: 1 },
            ],
          },
        }),
      );
      // The second one went inactive between proposal and approval — the case
      // an overnight approval makes real.
      prisma.skuCatalog.findMany.mockResolvedValue([
        { id: 'cat-a', skuId: GUID_A },
      ]);

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      // 🔴 ZERO, not one. Resolving lazily would have created the first line
      // and then failed, leaving a request half-changed by a proposal that was
      // never carried out.
      expect(requests.addLineItem).not.toHaveBeenCalled();
      expect(aiAssist.resumeRun).not.toHaveBeenCalled();
    });

    it('takes the request from the RUN row and refuses a payload that disagrees', async () => {
      prisma.agentProposal.findUnique.mockResolvedValue(
        pendingProposal({
          payload: {
            requestId: 'req-SOMEONE-ELSE',
            items: [{ skuId: GUID_A, quantity: 1 }],
          },
        }),
      );

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(requests.addLineItem).not.toHaveBeenCalled();
    });

    it('marks the proposal failed and does not resume when the domain path throws', async () => {
      requests.addLineItem.mockRejectedValue(
        new ConflictException('This request is complete'),
      );

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        ConflictException,
      );

      const { data } = prisma.agentProposal.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data.status).toBe('failed');
      // Resuming would tell the agent its proposal went through.
      expect(aiAssist.resumeRun).not.toHaveBeenCalled();
    });

    it('refuses a kind it cannot carry out yet', async () => {
      prisma.agentProposal.findUnique.mockResolvedValue(
        pendingProposal({ kind: 'assign' }),
      );

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(requests.addLineItem).not.toHaveBeenCalled();
    });
  });

  // ── A10 second half — reject ───────────────────────────────

  describe('reject', () => {
    it('changes nothing, records the reason, and lets the agent react', async () => {
      const reason = 'These are add-ons; the request only asks for the base.';

      await service.reject('p1', reason, approver);

      expect(requests.addLineItem).not.toHaveBeenCalled();

      const { data } = prisma.agentProposal.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data.status).toBe('rejected');
      expect(data.rejectedReason).toBe(reason);
      expect(data.approvedById).toBe('u-admin');

      // The reason travels to the model as well as into the row: a rejection it
      // cannot read is one it will simply re-propose.
      expect(aiAssist.resumeRun).toHaveBeenCalledWith('run-1', [
        { ref: 'call-1', approved: false, reason },
      ]);
    });
  });

  // ── refusals shared by both ────────────────────────────────

  describe('refusals', () => {
    it.each(['executed', 'rejected', 'failed'])(
      'refuses a proposal that was already %s',
      async (status) => {
        prisma.agentProposal.findUnique.mockResolvedValue(
          pendingProposal({ status }),
        );

        await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(requests.addLineItem).not.toHaveBeenCalled();
      },
    );

    it('refuses when the run behind it is no longer waiting', async () => {
      prisma.agentProposal.findUnique.mockResolvedValue(
        pendingProposal({ run: { status: 'failed' } }),
      );

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(requests.addLineItem).not.toHaveBeenCalled();
    });

    it('refuses a proposal with no runtime reference', async () => {
      // Without it the decision cannot be matched back to the tool call the
      // runtime paused on — approving "some pause" approves nothing.
      prisma.agentProposal.findUnique.mockResolvedValue(
        pendingProposal({ interruptionRef: null }),
      );

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses when the run is attached to no request', async () => {
      prisma.agentRun.findUnique.mockResolvedValue({ requestId: null });

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(requests.addLineItem).not.toHaveBeenCalled();
    });
  });
});
