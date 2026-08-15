import { readFileSync } from 'fs';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { AgentToolRegistry } from './tool-registry';
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

const ctx = (user: AppUser) => ({ runId: 'run-1', user });

describe('AgentToolRegistry', () => {
  let registry: AgentToolRegistry;
  let prisma: {
    request: { findMany: jest.Mock; findUnique: jest.Mock };
    skuCatalog: { findMany: jest.Mock; findUnique: jest.Mock };
    opcoSkuLedger: { findUnique: jest.Mock };
    agentProposal: { findFirst: jest.Mock };
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
     */
    const ALLOW_LIST = [
      'list_pending_requests:false',
      'get_request:false',
      'search_catalog:false',
      'get_ledger:false',
      'propose_line_items:true',
    ];

    it('exposes exactly these tools, in this order, with these approval flags', () => {
      expect(
        registry.list().map((t) => `${t.name}:${t.needsApproval}`),
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
     * Different reason from the list above: propose_assign IS planned (G1), it
     * just carries action power that期一 has not earned yet. When it lands, this
     * line has to be deleted deliberately — which is the point.
     */
    it('does not expose propose_assign yet (G1, 期二)', () => {
      expect(registry.get('propose_assign')).toBeUndefined();
    });

    it('gives every tool a strict-mode-shaped schema', () => {
      for (const t of registry.list()) {
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

    it('refuses a GUID that is not in the catalogue (hallucinated id)', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        opcoId: 'opco-a',
      });
      prisma.skuCatalog.findMany.mockResolvedValue([]);

      await expect(
        propose([{ skuId: GUID, quantity: 1 }]),
      ).rejects.toBeInstanceOf(BadRequestException);
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
      ).rejects.toBeInstanceOf(BadRequestException);
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
