import { readFileSync } from 'fs';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { AgentToolRegistry, MAX_AUTONOMOUS_TOOL_CALLS } from './tool-registry';
import { AgentBlastRadiusExceededError } from './agent-tool';
import { PrismaService } from '../prisma/prisma.service';

/**
 * W46 A3 / A9 — the allow-list and the GUID rule, pinned.
 *
 * These are not "tests for the registry", they are the registry's enforcement.
 * ADR-0036 D2 puts the security boundary here rather than in any SDK's
 * `allowedTools`, and a boundary that only exists in prose is one refactor away
 * from not existing. Adding a tool without touching this file must fail.
 */

const GUID = '11111111-2222-3333-4444-555555555555';
const OTHER_GUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const admin = { id: 'u-admin', opcoScopeId: null } as unknown as AppUser;
const opcoIt = { id: 'u-opco', opcoScopeId: 'opco-a' } as unknown as AppUser;

/**
 * W48 F3-4 — `requestId` defaults to a request, because every test below is
 * about what a tool DOES once it runs, and a run has always had one. The
 * context-free case has its own describe at the bottom, where it is the subject
 * rather than the setup.
 */
const ctx = (user: AppUser, requestId: string | null = 'req-1') => ({
  runId: 'run-1',
  user,
  requestId,
});

describe('AgentToolRegistry', () => {
  let registry: AgentToolRegistry;
  let prisma: {
    request: { findMany: jest.Mock; findUnique: jest.Mock };
    skuCatalog: { findMany: jest.Mock; findUnique: jest.Mock };
    opcoSkuLedger: { findUnique: jest.Mock };
    agentProposal: { findFirst: jest.Mock };
    requestLineItem: { findUnique: jest.Mock };
    // 期二 G3 — the blast-radius counter reads the step ledger before every
    // autonomous tool call. Defaults to 0 below: these tests are about what the
    // tools do, and a budget that bites would make every one of them fail for
    // the wrong reason. The budget has its own describe.
    agentStep: { count: jest.Mock };
  };

  const tool = (name: string) => {
    const found = registry.get(name);
    if (!found) throw new Error(`tool ${name} is not registered`);
    return found;
  };

  beforeEach(async () => {
    prisma = {
      request: { findMany: jest.fn(), findUnique: jest.fn() },
      skuCatalog: { findMany: jest.fn(), findUnique: jest.fn() },
      opcoSkuLedger: { findUnique: jest.fn() },
      agentProposal: { findFirst: jest.fn() },
      requestLineItem: { findUnique: jest.fn() },
      agentStep: { count: jest.fn().mockResolvedValue(0) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentToolRegistry,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    registry = moduleRef.get(AgentToolRegistry);
  });

  // ── A3 — the allow-list, word for word ─────────────────────

  describe('allow-list (A3 / D2)', () => {
    /**
     * Name AND approval flag together. Splitting them would let a write tool
     * quietly become `needsApproval: false` while a "the tools are unchanged"
     * test stayed green — which is the failure this pins, not a typo in a name.
     *
     * 🔴 W48 F3-4 added `requestScoped` to the same string, for the identical
     * reason. It decides whether a chat with no request can reach a tool, and a
     * new tool declaring it wrong is exactly the silent failure this format
     * exists to catch — `name:needsApproval:requestScoped`.
     */
    const ALLOW_LIST = [
      'list_pending_requests:false:true',
      'get_request:false:true',
      'search_catalog:false:false',
      'get_ledger:false:false',
      'propose_line_items:true:true',
      'propose_assign:true:true',
    ];

    it('exposes exactly these tools, in this order, with these flags', () => {
      expect(
        registry
          .all()
          .map((t) => `${t.name}:${t.needsApproval}:${t.requestScoped}`),
      ).toEqual(ALLOW_LIST);
    });

    /**
     * plan §3.3 — the four that must never exist. Not "not implemented yet":
     * each one is a decision. assign_license and update_ledger would be direct
     * side-effects (D3 / ADR-0004 #5); shell and file tools are precisely the
     * batch Claude Agent SDK issue #115 fails to restrict (D9); the audit log
     * is ADMIN-only and full of PII (plan OQ-4).
     */
    it.each([
      'assign_license',
      'update_ledger',
      'bash',
      'run_command',
      'read_file',
      'write_file',
      'edit_file',
      'get_audit_log',
      'code_interpreter',
      'file_search',
    ])('never exposes %s', (name) => {
      expect(registry.get(name)).toBeUndefined();
    });

    /**
     * 期二 G1 — `propose_assign` landed. The line that used to assert its
     * ABSENCE was deleted deliberately, which is what it was there for.
     *
     * 🔴 What replaces it is the narrower claim that now matters: it is here,
     * and it can only ever name a line item. The parameters it does NOT have
     * are the gates it cannot talk its way past — ADR-0016 D3's budget
     * override above all, which is ADMIN-only and demands a written reason.
     */
    it('exposes propose_assign, and it can name nothing but a line item', () => {
      const assign = registry.get('propose_assign');

      expect(assign?.needsApproval).toBe(true);
      expect(Object.keys(assign!.parameters.properties).sort()).toEqual([
        'lineItemId',
        'reasoning',
      ]);
    });

    /**
     * 期二 G3 / plan B4 — the blast-radius limit.
     *
     * 🔴 The claim is NOT "there is a constant somewhere". It is that a run
     * which has spent its budget cannot make another autonomous call, that the
     * budget is read from the platform's own step ledger, and that a tool a
     * PERSON has approved is exempt — three facts, and the third is the one a
     * reader will assume is a bug unless it is asserted on purpose.
     */
    describe('🔴 G3 — the blast-radius limit', () => {
      const budgetSpent = () =>
        prisma.agentStep.count.mockResolvedValue(MAX_AUTONOMOUS_TOOL_CALLS);

      it('refuses an autonomous tool once the run has spent its budget', async () => {
        budgetSpent();

        await expect(
          tool('search_catalog').execute({ query: 'e5' }, ctx(admin)),
        ).rejects.toBeInstanceOf(AgentBlastRadiusExceededError);

        // 🔴 And it refused BEFORE doing the work. A limit that runs the query
        // and then throws has capped nothing that costs anything.
        expect(prisma.skuCatalog.findMany).not.toHaveBeenCalled();
      });

      it('counts only successful autonomous calls, per run', async () => {
        budgetSpent();
        await tool('search_catalog')
          .execute({ query: 'e5' }, ctx(admin))
          .catch(() => undefined);

        // Each half of this `where` is load-bearing and each was a decision:
        // scoped to THIS run; `ok` only, so one flaky read cannot exhaust a
        // run's allowance; and the names come from `needsApproval`, so a new
        // autonomous tool is counted because of what it is.
        expect(prisma.agentStep.count).toHaveBeenCalledWith({
          where: {
            runId: 'run-1',
            status: 'ok',
            key: {
              in: [
                'list_pending_requests',
                'get_request',
                'search_catalog',
                'get_ledger',
              ],
            },
          },
        });
      });

      /**
       * 🔴 The exemption, asserted rather than left to be discovered.
       *
       * A `propose_*` call is bounded by a person having said yes, which is a
       * stronger limit than a counter. Capping it too would mean the platform
       * could do the real work on an approval and then have a counter refuse
       * the tool that reports the outcome back — a failure invented by the
       * limit itself.
       */
      it('never caps a tool a person had to approve', async () => {
        budgetSpent();
        prisma.agentProposal.findFirst.mockResolvedValue({
          id: 'p1',
          status: 'executed',
          approvedById: 'u-admin',
          payload: {},
        });
        prisma.requestLineItem.findUnique.mockResolvedValue({
          id: 'line-1',
          stage: 'READY',
          request: { opcoId: 'opco-a' },
        });

        await expect(
          tool('propose_assign').execute(
            { lineItemId: 'line-1', reasoning: 'ready' },
            ctx(admin),
          ),
        ).resolves.toMatchObject({ proposalId: 'p1' });

        // Not merely "it did not throw": the budget was never even consulted.
        expect(prisma.agentStep.count).not.toHaveBeenCalled();
      });

      it('lets an autonomous call through while budget remains', async () => {
        prisma.agentStep.count.mockResolvedValue(MAX_AUTONOMOUS_TOOL_CALLS - 1);
        prisma.skuCatalog.findMany.mockResolvedValue([]);

        await expect(
          tool('search_catalog').execute({ query: 'e5' }, ctx(admin)),
        ).resolves.toEqual([]);
      });

      it('reports what a run has spent', async () => {
        prisma.agentStep.count.mockResolvedValue(3);
        await expect(registry.blastRadius('run-1')).resolves.toEqual({
          used: 3,
          limit: MAX_AUTONOMOUS_TOOL_CALLS,
          exceeded: false,
        });
      });
    });

    it('gives every tool a strict-mode-shaped schema', () => {
      for (const t of registry.all()) {
        expect(t.parameters.type).toBe('object');
        expect(t.parameters.additionalProperties).toBe(false);
        // Every declared property is required — OpenAI strict mode's rule, and
        // also the one that stops a model from silently omitting an argument a
        // gate depends on.
        expect([...t.parameters.required].sort()).toEqual(
          Object.keys(t.parameters.properties).sort(),
        );
      }
    });
  });

  // ── W48 F3-4 / ADR-0041 D3 — no request, no request tools ──

  /**
   * 🔴 The security boundary of this phase, and the only structural one it has.
   *
   * D3 requires that a conversation with no request cannot REACH request data —
   * not that it asks and is refused. So the assertions below are about what
   * `list()` returns, because that is what a model is shown, and a tool a model
   * was never shown is a tool it cannot call.
   *
   * ⚠️ Worth stating what is NOT claimed: this does not narrow OpCo scope. A
   * chat WITH a request keeps every tool a run has always had, including
   * `get_request` on a different request in the same OpCo — a pre-existing
   * property of the tool's model-supplied `requestId`, not something W48 chose.
   */
  describe('request scope (W48 F3-4 / ADR-0041 D3)', () => {
    const REQUEST_TOOLS = [
      'list_pending_requests',
      'get_request',
      'propose_line_items',
      'propose_assign',
    ];

    it('drops every request tool when there is no request', () => {
      const names = registry.list(ctx(admin, null)).map((t) => t.name);
      expect(names).toEqual(['search_catalog', 'get_ledger']);
    });

    it('keeps every tool when there is a request', () => {
      expect(registry.list(ctx(admin, 'req-1')).map((t) => t.name)).toEqual(
        registry.all().map((t) => t.name),
      );
    });

    /**
     * Pins the two lists against each other rather than repeating the names, so
     * a tool added with `requestScoped: true` is covered here the day it is
     * declared — the failure being guarded is a NEW tool, not these four.
     */
    it('drops exactly the tools that declare themselves request-scoped', () => {
      const dropped = registry
        .all()
        .filter((t) => t.requestScoped)
        .map((t) => t.name);
      expect(dropped).toEqual(REQUEST_TOOLS);

      const kept = registry.list(ctx(admin, null)).map((t) => t.name);
      for (const name of dropped) expect(kept).not.toContain(name);
    });

    /**
     * 🔴 `list_pending_requests` gets its own assertion because it is the one a
     * reasonable person would leave in: it takes no request id, so it looks
     * unrelated to "this conversation has no request". It RETURNS request ids,
     * which is the whole starting point — leave it and a context-free chat can
     * enumerate the OpCo and then open each request, making D3 true in wording
     * and false in effect.
     */
    it('drops list_pending_requests, which returns ids even though it takes none', () => {
      expect(
        registry.list(ctx(admin, null)).map((t) => t.name),
      ).not.toContain('list_pending_requests');
    });
  });

  /**
   * The static half of A5 (zero side-effects). The behavioural half needs a
   * whole run and lands in F5; this one answers a question no behavioural test
   * can — not "this path did not write" but "there is no write in the file".
   *
   * 🔴 Deliberately banned outright rather than restricted to non-Agent tables:
   * even AgentProposal is written by the PLATFORM, not by a tool (D3 / D4). A
   * tool that writes its own proposal row would be an agent recording its own
   * evidence, which is exactly what INC-001 says cannot be trusted.
   *
   * ⚠️ Known weakness, same one W39 had to loosen the license-ops boundary spec
   * for: this matches SOURCE TEXT, so a comment that merely mentions `.create(`
   * fails it. That is a false positive, not a finding — if it fires on prose,
   * reword the prose rather than weakening the list.
   */
  it('contains no database write at all (A5, static half)', () => {
    const src = readFileSync(join(__dirname, 'tool-registry.ts'), 'utf8');
    for (const write of [
      '.create(',
      '.createMany(',
      '.update(',
      '.updateMany(',
      '.upsert(',
      '.delete(',
      '.deleteMany(',
      '$transaction',
      '$executeRaw',
    ]) {
      expect(src).not.toContain(write);
    }
  });

  // ── read tools ─────────────────────────────────────────────

  describe('list_pending_requests', () => {
    beforeEach(() =>
      prisma.request.findMany.mockResolvedValue([
        {
          id: 'r1',
          opcoId: 'opco-a',
          status: 'OPEN',
          targetUpn: 'new.joiner@rhk.com',
          createdAt: new Date('2026-08-15T00:00:00Z'),
          opco: { code: 'RHK' },
          lineItems: [{ stage: 'REQUESTED' }, { stage: 'REQUESTED' }],
        },
      ]),
    );

    it('redacts the target address (plan §3.1) — the list needs existence, not identity', async () => {
      const [row] = (await tool('list_pending_requests').execute(
        {},
        ctx(admin),
      )) as { targetUpn: string }[];

      expect(row.targetUpn).toBe('[redacted-email]');
      // The positive half: asserting only "no @" would also pass if the field
      // were dropped, and a missing field is a different bug from a leaked one.
      expect(row.targetUpn).not.toMatch(/@/);
    });

    it('restricts an OPCO_IT caller to their own OpCo', async () => {
      await tool('list_pending_requests').execute({}, ctx(opcoIt));
      expect(prisma.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ opcoId: 'opco-a' }),
        }),
      );
    });

    it('does not restrict ADMIN / REGIONAL (null scope)', async () => {
      await tool('list_pending_requests').execute({}, ctx(admin));
      const [call] = prisma.request.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(call.where).not.toHaveProperty('opcoId');
    });
  });

  describe('get_request', () => {
    const row = {
      id: 'r1',
      opcoId: 'opco-b',
      status: 'OPEN',
      targetUpn: 'new.joiner@rhk.com',
      targetDisplayName: 'New Joiner',
      rawRequestText: 'please give them E5 and Visio',
      opco: { code: 'RHK', displayName: 'Ricoh HK' },
      lineItems: [],
    };

    it('403s a scoped caller reading another OpCo — never an empty result', async () => {
      prisma.request.findUnique.mockResolvedValue(row);
      await expect(
        tool('get_request').execute({ requestId: 'r1' }, ctx(opcoIt)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s an unknown request', async () => {
      prisma.request.findUnique.mockResolvedValue(null);
      await expect(
        tool('get_request').execute({ requestId: 'nope' }, ctx(admin)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    /**
     * The raw wording is returned UNSCRUBBED on purpose — parsing it is the
     * whole AI-Assist task. Pinned so that a future "scrub everything" sweep
     * has to argue with a test instead of quietly blanking the input.
     */
    it('returns the original wording intact', async () => {
      prisma.request.findUnique.mockResolvedValue(row);
      const result = (await tool('get_request').execute(
        { requestId: 'r1' },
        ctx(admin),
      )) as { rawRequestText: string };
      expect(result.rawRequestText).toBe('please give them E5 and Visio');
    });

    it('rejects a missing requestId rather than guessing', async () => {
      await expect(
        tool('get_request').execute({}, ctx(admin)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.request.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('get_ledger', () => {
    it('distinguishes "no ledger row" from "allocated zero"', async () => {
      prisma.skuCatalog.findUnique.mockResolvedValue({ id: 'sku-1' });
      prisma.opcoSkuLedger.findUnique.mockResolvedValue(null);

      const result = (await tool('get_ledger').execute(
        { opcoId: 'opco-a', skuId: GUID },
        ctx(admin),
      )) as { exists: boolean; allocatedQuantity: number };

      expect(result.exists).toBe(false);
      expect(result.allocatedQuantity).toBe(0);
    });

    it('403s out of scope before reading anything', async () => {
      await expect(
        tool('get_ledger').execute(
          { opcoId: 'opco-z', skuId: GUID },
          ctx(opcoIt),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.skuCatalog.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── A9 — propose_line_items takes GUIDs and nothing else ───

  describe('propose_line_items (A9 / R15)', () => {
    const propose = (items: unknown) =>
      tool('propose_line_items').execute(
        { requestId: 'r1', items, reasoning: 'because the request says so' },
        ctx(admin),
      );

    it('refuses a SKU named by part number instead of guessing which E5 it is', async () => {
      await expect(
        propose([{ skuId: 'SPE_E5', quantity: 1 }]),
      ).rejects.toBeInstanceOf(BadRequestException);
      // It never reached the database: a name is rejected on shape, so no
      // lookup exists that could "resolve" it into a product.
      expect(prisma.request.findUnique).not.toHaveBeenCalled();
    });

    /**
     * 🔴 F10-2 — both tests below used to assert only `BadRequestException`,
     * and both passed with the existence check DELETED.
     *
     * The reason is worth keeping: two gates further down, `propose_line_items`
     * refuses again when no approved proposal exists, and it refuses with the
     * SAME exception type. `agentProposal.findFirst` is a bare mock returning
     * undefined, so every one of these cases reached that second gate and threw
     * there. The tests looked strict, named the right thing, and pinned
     * nothing.
     *
     * So each now asserts the MESSAGE (hardcoded, not derived from the code
     * under test) and that execution never reached the next gate. Either alone
     * would be weaker: the message alone would still pass if the order of the
     * two gates were swapped.
     */
    it('refuses a GUID that is not in the catalogue (hallucinated id)', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'opco-a',
      });
      prisma.skuCatalog.findMany.mockResolvedValue([]);

      await expect(propose([{ skuId: GUID, quantity: 1 }])).rejects.toThrow(
        /Unknown or inactive skuId/,
      );
      expect(prisma.agentProposal.findFirst).not.toHaveBeenCalled();
    });

    it('refuses a SKU that exists but is inactive', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'opco-a',
      });
      // The query filters on active: true, so an inactive row simply is not
      // returned — this asserts the caller treats "not returned" as a refusal.
      prisma.skuCatalog.findMany.mockResolvedValue([{ skuId: OTHER_GUID }]);

      await expect(
        propose([
          { skuId: OTHER_GUID, quantity: 1 },
          { skuId: GUID, quantity: 1 },
        ]),
      ).rejects.toThrow(/Unknown or inactive skuId/);
      expect(prisma.agentProposal.findFirst).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty list', []],
      ['a zero quantity', [{ skuId: GUID, quantity: 0 }]],
      ['a fractional quantity', [{ skuId: GUID, quantity: 1.5 }]],
      ['a quantity as text', [{ skuId: GUID, quantity: '1' }]],
    ])('refuses %s', async (_label, items) => {
      await expect(propose(items)).rejects.toBeInstanceOf(BadRequestException);
    });

    /**
     * 🔴 The second layer under D2. If `needsApproval` ever stops stopping the
     * run, this is what happens next: nothing.
     */
    it('refuses to run at all when no human has approved a proposal', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'opco-a',
      });
      prisma.skuCatalog.findMany.mockResolvedValue([{ skuId: GUID }]);
      prisma.agentProposal.findFirst.mockResolvedValue(null);

      await expect(
        propose([{ skuId: GUID, quantity: 1 }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reports the outcome back once a person has approved and the platform executed it', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'opco-a',
      });
      prisma.skuCatalog.findMany.mockResolvedValue([{ skuId: GUID }]);
      prisma.agentProposal.findFirst.mockResolvedValue({
        id: 'p1',
        status: 'executed',
        approvedById: 'u-admin',
        payload: { createdLineItemIds: ['li-1'] },
      });

      const result = (await propose([{ skuId: GUID, quantity: 1 }])) as {
        proposalId: string;
        approvedById: string;
      };

      expect(result.proposalId).toBe('p1');
      // Who approved it travels back to the agent: the run's own transcript
      // then records that a named person, not the model, authorised the write.
      expect(result.approvedById).toBe('u-admin');
      expect(prisma.agentProposal.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            runId: 'run-1',
            status: 'executed',
          }),
        }),
      );
    });

    /**
     * 期二 G1 — the same second layer, on the tool that can cause a real
     * licence assignment.
     *
     * 🔴 It matters more here than on `propose_line_items`. If `needsApproval`
     * ever stops stopping the run, the next thing that happens on this path is
     * a licence leaving the tenant. So `execute` refuses unless a person has
     * already decided AND the platform already did the work.
     */
    describe('propose_assign (G1)', () => {
      const runAssign = (args: Record<string, unknown>, user = admin) =>
        tool('propose_assign').execute(args, ctx(user));

      const line = {
        id: 'line-1',
        stage: 'READY',
        request: { opcoId: 'opco-a' },
      };

      it('refuses when no person has approved an assign for this run', async () => {
        prisma.requestLineItem.findUnique.mockResolvedValue(line);
        prisma.agentProposal.findFirst.mockResolvedValue(null);

        await expect(
          runAssign({ lineItemId: 'line-1', reasoning: 'ready' }),
        ).rejects.toThrow(/No approved assign proposal/);
      });

      it('will not accept a proposal the gates refused', async () => {
        prisma.requestLineItem.findUnique.mockResolvedValue(line);
        prisma.agentProposal.findFirst.mockResolvedValue(null);

        await expect(
          runAssign({ lineItemId: 'line-1', reasoning: 'ready' }),
        ).rejects.toThrow(/No approved assign proposal/);

        // The query is the assertion: a blocked assign is stored as `failed`,
        // so asking only for `executed` is what keeps a refusal from reading
        // back to the model as a success.
        expect(prisma.agentProposal.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              runId: 'run-1',
              kind: 'assign',
              status: 'executed',
            }),
          }),
        );
      });

      it('403s a scoped caller naming another OpCo’s line item', async () => {
        prisma.requestLineItem.findUnique.mockResolvedValue({
          ...line,
          request: { opcoId: 'opco-z' },
        });

        await expect(
          runAssign({ lineItemId: 'line-1', reasoning: 'ready' }, opcoIt),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.agentProposal.findFirst).not.toHaveBeenCalled();
      });

      it('refuses an unknown line item', async () => {
        prisma.requestLineItem.findUnique.mockResolvedValue(null);

        await expect(
          runAssign({ lineItemId: 'nope', reasoning: 'ready' }),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    it('403s a scoped caller proposing onto another OpCo request', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'opco-z',
      });
      await expect(
        tool('propose_line_items').execute(
          {
            requestId: 'r1',
            items: [{ skuId: GUID, quantity: 1 }],
            reasoning: 'x',
          },
          ctx(opcoIt),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.skuCatalog.findMany).not.toHaveBeenCalled();
    });
  });
});
