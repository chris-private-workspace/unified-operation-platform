import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { AgentApprovalService } from './agent-approval.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestService } from '../fulfilment/request.service';
import { AssignService } from '../fulfilment/assign.service';
import { AiAssistService } from '../agent/ai-assist.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import { AgentKillSwitchService } from '../agent/kill-switch.service';

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
  let assign: { assignLineItem: jest.Mock };
  let aiAssist: { resumeRun: jest.Mock };
  let audit: { log: jest.Mock };
  let killSwitch: { assertEnabled: jest.Mock };

  beforeEach(async () => {
    prisma = {
      agentProposal: { findUnique: jest.fn(), update: jest.fn() },
      agentRun: { findUnique: jest.fn() },
      skuCatalog: { findMany: jest.fn() },
    };
    requests = { addLineItem: jest.fn() };
    assign = { assignLineItem: jest.fn() };
    aiAssist = { resumeRun: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    prisma.agentProposal.findUnique.mockResolvedValue(pendingProposal());
    prisma.agentProposal.update.mockResolvedValue({});
    prisma.agentRun.findUnique.mockResolvedValue({ requestId: 'req-1' });
    prisma.skuCatalog.findMany.mockResolvedValue([
      { id: 'cat-a', skuId: GUID_A },
      { id: 'cat-b', skuId: GUID_B },
    ]);
    requests.addLineItem.mockResolvedValue({ id: 'line-1' });
    assign.assignLineItem.mockResolvedValue({
      outcome: 'assigned',
      steps: [{ key: 'directory', status: 'ok' }],
      lineItem: { id: 'line-1' },
    });
    aiAssist.resumeRun.mockResolvedValue({
      runId: 'run-1',
      status: 'completed',
      proposals: [],
    });

    // 期二 G3 — permits by default; the gate has its own describe below.
    killSwitch = { assertEnabled: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentApprovalService,
        { provide: PrismaService, useValue: prisma },
        { provide: RequestService, useValue: requests },
        { provide: AssignService, useValue: assign },
        { provide: AiAssistService, useValue: aiAssist },
        { provide: AuditService, useValue: audit },
        { provide: AgentKillSwitchService, useValue: killSwitch },
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

    /**
     * 🔴 G7 counts `failed` as an approval (`review-stats.service.ts`), and its
     * population is `decidedAt != null`. So a row written here WITHOUT an
     * approver enters the aggregate and lands in the per-reviewer table's
     * `null` bucket — the reviewer who pressed approve gets one approval fewer
     * than they made. That is the reassuring direction, the one R13 says a
     * review metric must never be wrong in.
     *
     * Asserted as a pair on purpose: `decidedAt` alone is what the platform's
     * own tidy-up paths (`abortRun`, run expiry) deliberately never write, so
     * the two columns only mean "a person decided this" together.
     */
    it('records WHO approved even though the domain path then threw', async () => {
      requests.addLineItem.mockRejectedValue(
        new ConflictException('This request is complete'),
      );

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        ConflictException,
      );

      const { data } = prisma.agentProposal.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data.approvedById).toBe('u-admin');
      expect(data.decidedAt).toBeInstanceOf(Date);
    });

    it('refuses a kind it cannot carry out', async () => {
      // 'assign' used to be this example. 期二 G1 made it real, so the test
      // moved to a kind nothing mints — the claim is about the default, not
      // about any particular unimplemented feature.
      prisma.agentProposal.findUnique.mockResolvedValue(
        pendingProposal({ kind: 'reprovision_mailbox' }),
      );

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(requests.addLineItem).not.toHaveBeenCalled();
      expect(assign.assignLineItem).not.toHaveBeenCalled();
    });
  });

  // ── 期二 G1 — approve an assign proposal ────────────────────

  /**
   * 🔴 The point of G1 is not that an agent can assign a licence. It is that
   * approving one changes NOTHING about how the assign runs: same service, same
   * eight gates, same actor rules — and the gates can still say no to a person
   * who already said yes.
   */
  describe('approve — assign (期二 G1)', () => {
    const assignProposal = (overrides: Record<string, unknown> = {}) =>
      pendingProposal({
        kind: 'assign',
        payload: { lineItemId: 'line-1' },
        ...overrides,
      });

    it('runs the existing assign path as the approver, with no override', async () => {
      prisma.agentProposal.findUnique.mockResolvedValue(assignProposal());

      await service.approve('p1', approver);

      // 🔴 Three arguments, and the fourth is the point: ADR-0016 D3's budget
      // override is ADMIN-only and needs a written reason, so it must never
      // arrive from this path. `toHaveBeenCalledWith` pins arity exactly —
      // a fourth argument appearing here fails.
      expect(assign.assignLineItem).toHaveBeenCalledWith(
        'line-1',
        undefined,
        approver,
      );
      // And the line-item path is untouched: an assign proposal creates nothing.
      expect(requests.addLineItem).not.toHaveBeenCalled();
    });

    it('marks it executed and resumes with approved: true', async () => {
      prisma.agentProposal.findUnique.mockResolvedValue(assignProposal());

      await service.approve('p1', approver);

      const update = prisma.agentProposal.update.mock.calls[0][0] as {
        data: { status: string; payload: Record<string, unknown> };
      };
      expect(update.data.status).toBe('executed');
      expect(update.data.payload.assign).toEqual({
        outcome: 'assigned',
        steps: [{ key: 'directory', status: 'ok' }],
      });

      expect(aiAssist.resumeRun).toHaveBeenCalledWith('run-1', [
        { ref: 'call-1', approved: true },
      ]);
    });

    /**
     * 🔴 The counter-intuitive half, and the one F8 puts on the screen in
     * words: approving decides that this SHOULD happen, never that it MAY.
     */
    describe('when the platform’s gates refuse', () => {
      const blocked = Object.assign(new BadRequestException('x'), {
        response: {
          outcome: 'blocked',
          failedAt: 'budget',
          steps: [],
          message: 'OpCo budget exceeded',
        },
      });

      beforeEach(() => {
        prisma.agentProposal.findUnique.mockResolvedValue(assignProposal());
        assign.assignLineItem.mockRejectedValue(blocked);
      });

      it('marks the proposal failed, never executed', async () => {
        await service.approve('p1', approver);

        const update = prisma.agentProposal.update.mock.calls[0][0] as {
          data: { status: string; rejectedReason: string | null };
        };
        // `executed` is what `propose_assign.execute` looks for. Marking a
        // blocked assign executed would let the tool report a success back to
        // the model for something that never happened.
        expect(update.data.status).toBe('failed');
        expect(update.data.rejectedReason).toContain('budget');
      });

      it('resumes with approved: false AND the real reason, not a human rejection', async () => {
        await service.approve('p1', approver);

        const [, decisions] = aiAssist.resumeRun.mock.calls[0] as [
          string,
          { approved: boolean; reason?: string }[],
        ];
        expect(decisions[0].approved).toBe(false);
        // "a person said no" and "the platform said no" are different facts.
        // The agent is told which one, so it can react to the gate instead of
        // re-proposing the same thing at a person.
        expect(decisions[0].reason).toContain('budget');
        expect(decisions[0].reason).toContain('OpCo budget exceeded');
      });

      it('still records the decision in the audit trail', async () => {
        await service.approve('p1', approver);

        expect(audit.log).toHaveBeenCalledWith(
          prisma,
          expect.objectContaining({
            action: AUDIT_ACTIONS.AGENT_PROPOSAL_DECIDED,
            actorId: approver.id,
          }),
        );
      });
    });

    /**
     * ⚠️ Only an ADR-0029 `blocked` body counts as a refusal. Anything else is
     * a real failure, and telling the agent "the platform refused" would be a
     * statement about what happened that is not true (INC-001).
     */
    it('rethrows a non-gate failure instead of reporting it as a refusal', async () => {
      prisma.agentProposal.findUnique.mockResolvedValue(assignProposal());
      assign.assignLineItem.mockRejectedValue(new Error('connection reset'));

      await expect(service.approve('p1', approver)).rejects.toThrow(
        'connection reset',
      );
      expect(aiAssist.resumeRun).not.toHaveBeenCalled();
    });

    it('refuses a payload that names no line item', async () => {
      prisma.agentProposal.findUnique.mockResolvedValue(
        assignProposal({ payload: { reasoning: 'looks ready to me' } }),
      );

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(assign.assignLineItem).not.toHaveBeenCalled();
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

  // ── 期二 G3 — the kill switch ───────────────────────────────

  /**
   * 🔴 THE branch a kill switch has to cover, and the one easiest to miss.
   *
   * Approving is where a real licence gets assigned (G1). An agent reported as
   * "switched off" while an approval could still push an assignment through
   * would be off in the reassuring sense and on in the only sense that matters
   * — and the screen would say OFF the whole time.
   */
  describe('🔴 G3 — approving is gated, rejecting is not', () => {
    const switchedOff = () =>
      killSwitch.assertEnabled.mockRejectedValue(
        new ConflictException('The AI-Assist agent is switched off.'),
      );

    it('refuses to approve, and touches no domain path at all', async () => {
      switchedOff();

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(requests.addLineItem).not.toHaveBeenCalled();
      expect(assign.assignLineItem).not.toHaveBeenCalled();
      expect(aiAssist.resumeRun).not.toHaveBeenCalled();
      // Before the proposal is even loaded — a decision on a capability that
      // is off does not depend on which proposal it was.
      expect(prisma.agentProposal.findUnique).not.toHaveBeenCalled();
    });

    it('refuses to approve an assign proposal too', async () => {
      switchedOff();
      prisma.agentProposal.findUnique.mockResolvedValue(
        pendingProposal({ kind: 'assign', payload: { lineItemId: 'line-1' } }),
      );

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(assign.assignLineItem).not.toHaveBeenCalled();
    });

    /**
     * 🔴 The asymmetry, asserted because it looks like an omission.
     *
     * Killing the agent stops it CAUSING things; it must not stop people
     * clearing up after it. Gating rejection too would strand every pending
     * proposal until somebody switched the agent back on — which is the
     * opposite of what an operator flipped it for, and would make the switch
     * something you hesitate to use.
     */
    it('still lets a person reject, so the queue can be cleared', async () => {
      switchedOff();

      await expect(
        service.reject('p1', 'Not while the agent is off', approver),
      ).resolves.toBeDefined();

      const { data } = prisma.agentProposal.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data.status).toBe('rejected');
    });
  });

  // ── F7 — audit ─────────────────────────────────────────────

  describe('F7 — agent.proposal_decided', () => {
    it('records approve and reject under ONE action, told apart by reason', async () => {
      await service.approve('p1', approver);
      const approved = audit.log.mock.calls[0][1] as Record<string, unknown>;

      audit.log.mockClear();
      prisma.agentProposal.findUnique.mockResolvedValue(pendingProposal());
      await service.reject('p1', 'wrong SKUs', approver);
      const rejected = audit.log.mock.calls[0][1] as Record<string, unknown>;

      // 🔴 Same action on purpose. R13 is that approvals degenerate into
      // rubber-stamping, and "how often does this person just say yes" has to
      // be ONE query — two actions would make it two queries and a subtraction,
      // which is how nobody runs it.
      expect(approved.action).toBe(AUDIT_ACTIONS.AGENT_PROPOSAL_DECIDED);
      expect(rejected.action).toBe(AUDIT_ACTIONS.AGENT_PROPOSAL_DECIDED);

      expect(approved).toMatchObject({
        targetType: 'AgentProposal',
        targetId: 'p1',
        actorId: 'u-admin',
      });
      expect((approved.metadata as { reason: string }).reason).toContain(
        'approved',
      );
      expect((rejected.metadata as { reason: string }).reason).toContain(
        'wrong SKUs',
      );
    });

    it('🔴 A11 — passes no before/after', async () => {
      await service.approve('p1', approver);

      const entry = audit.log.mock.calls[0][1] as Record<string, unknown>;
      expect(entry.before).toBeUndefined();
      expect(entry.after).toBeUndefined();
    });

    it('audits AFTER the decision is stored, not inside a transaction with it', async () => {
      await service.approve('p1', approver);

      /**
       * 🔴 The opposite choice from `agent.run_started`, and deliberately so.
       *
       * By this point line items EXIST. Rolling the decision back because an
       * audit write hiccuped would leave those line items created against a
       * proposal still marked `pending` — re-approving would create them twice.
       * `outbound-retry.service.ts:398-401` states the same rule for the same
       * reason: a repair that succeeded must not be undone by an audit hiccup.
       */
      expect(
        prisma.agentProposal.update.mock.invocationCallOrder[0],
      ).toBeLessThan(audit.log.mock.invocationCallOrder[0]);
    });

    it('writes no audit row when the decision itself was refused', async () => {
      prisma.agentProposal.findUnique.mockResolvedValue(
        pendingProposal({ status: 'executed' }),
      );

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('writes no audit row when the domain path threw', async () => {
      requests.addLineItem.mockRejectedValue(new ConflictException('nope'));

      await expect(service.approve('p1', approver)).rejects.toBeInstanceOf(
        ConflictException,
      );
      // No audit row, because an audit row states what HAPPENED — and nothing
      // did: no line item was created and the run did not resume.
      //
      // ⚠️ Which is NOT the same as "nobody decided". The proposal still
      // carries `approvedById` + `decidedAt`, because a person did press
      // approve. The two records answer different questions, and this is the
      // one path where they legitimately disagree.
      expect(audit.log).not.toHaveBeenCalled();
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
