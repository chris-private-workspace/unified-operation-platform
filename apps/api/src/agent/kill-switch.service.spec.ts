import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { AgentKillSwitchService } from './kill-switch.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';

/**
 * 期二 G3 / plan B5 — the kill switch.
 *
 * 🔴 The claim being pinned is not "a boolean can be set". It is the SECOND
 * fact: switching the agent off does not remove the runs already parked for
 * approval, so "off" and "stopped" are different states and the platform has
 * to report both. That is `SeamRuntimeRegistry`'s shape (saved ≠ live) applied
 * to a different pair, and the reason it earns its own test is that the
 * one-boolean version passes every obvious check while telling an operator in
 * an incident that the agent has stopped when it has not.
 */

const admin = { id: 'u-admin' } as unknown as AppUser;

describe('AgentKillSwitchService', () => {
  let service: AgentKillSwitchService;
  let prisma: {
    agentPrincipal: { findUnique: jest.Mock; upsert: jest.Mock };
    agentRun: { count: jest.Mock };
    agentProposal: { count: jest.Mock };
  };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      agentPrincipal: { findUnique: jest.fn(), upsert: jest.fn() },
      agentRun: { count: jest.fn().mockResolvedValue(0) },
      agentProposal: { count: jest.fn().mockResolvedValue(0) },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    prisma.agentPrincipal.findUnique.mockResolvedValue({
      id: 'principal-1',
      active: true,
      createdAt: new Date('2026-08-16T00:00:00Z'),
    });
    prisma.agentPrincipal.upsert.mockResolvedValue({
      id: 'principal-1',
      active: false,
      createdAt: new Date('2026-08-16T00:00:00Z'),
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentKillSwitchService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AgentKillSwitchService);
  });

  // ── 配置 vs 真相 ────────────────────────────────────────────

  describe('🔴 B5 — "switched off" and "stopped" are two facts', () => {
    it('is not settled while runs are still parked, even with the switch off', async () => {
      prisma.agentPrincipal.findUnique.mockResolvedValue({
        active: false,
        createdAt: new Date(),
      });
      prisma.agentRun.count.mockResolvedValue(3);
      prisma.agentProposal.count.mockResolvedValue(2);

      const status = await service.status();

      expect(status.enabled).toBe(false);
      // 🔴 The whole point. An operator reading only `enabled` would conclude
      // the agent had stopped — while three runs sit waiting to become live
      // again the moment somebody switches it back on, one of which may hold a
      // proposal that assigns a real licence (G1).
      expect(status.settled).toBe(false);
      expect(status.liveRuns).toBe(3);
      expect(status.pendingProposals).toBe(2);
    });

    it('is settled only when it is off AND nothing is left', async () => {
      prisma.agentPrincipal.findUnique.mockResolvedValue({
        active: false,
        createdAt: new Date(),
      });

      await expect(service.status()).resolves.toMatchObject({
        enabled: false,
        settled: true,
      });
    });

    it('is never settled while the switch is on, however quiet it is', async () => {
      // Quiet is not stopped: the next person to press the button starts a run.
      await expect(service.status()).resolves.toMatchObject({
        enabled: true,
        liveRuns: 0,
        settled: false,
      });
    });

    /**
     * 🔴 "Never used" is not "switched off", and defaulting the other way would
     * report a brand-new deployment as having a disabled agent.
     */
    it('reports enabled when no principal row exists yet', async () => {
      prisma.agentPrincipal.findUnique.mockResolvedValue(null);

      await expect(service.status()).resolves.toMatchObject({
        enabled: true,
        updatedAt: null,
      });
    });

    it('counts only runs that have not finished', async () => {
      await service.status();

      expect(prisma.agentRun.count).toHaveBeenCalledWith({
        where: {
          status: { in: ['running', 'awaiting_approval', 'approved'] },
        },
      });
      expect(prisma.agentProposal.count).toHaveBeenCalledWith({
        where: { status: 'pending' },
      });
    });
  });

  // ── flipping it ────────────────────────────────────────────

  describe('set', () => {
    it('writes the flag and audits who did it, with before and after', async () => {
      await service.set(false, admin, 'Suspected runaway run');

      expect(prisma.agentPrincipal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { active: false } }),
      );

      const [, entry] = audit.log.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(entry.action).toBe(AUDIT_ACTIONS.AGENT_KILL_SWITCH_SET);
      expect(entry.targetType).toBe('AgentPrincipal');
      expect(entry.actorId).toBe('u-admin');
      // 🔴 Which way it was flipped. An audit row saying only "somebody set the
      // kill switch" cannot answer the one question anyone will ask of it.
      expect(entry.before).toEqual({ active: true });
      expect(entry.after).toEqual({ active: false });
      expect(entry.metadata).toEqual({ reason: 'Suspected runaway run' });
    });

    /**
     * The row is created by the first RUN, so without this an admin could not
     * switch the agent off on a deployment where nobody had used it yet —
     * precisely the moment a switch that only worked after first use would be
     * least helpful.
     */
    it('can switch the agent off before it has ever been used', async () => {
      prisma.agentPrincipal.findUnique.mockResolvedValueOnce(null);

      await service.set(false, admin);

      const call = prisma.agentPrincipal.upsert.mock.calls[0][0] as {
        create: Record<string, unknown>;
      };
      expect(call.create.active).toBe(false);
      // ⚠️ Not a guessed runtime. `startRun` overwrites it with the provider
      // that actually booted (BUG-011); a plausible value here would survive
      // until then looking like a fact.
      expect(call.create.runtime).toBe('unknown');

      const [, entry] = audit.log.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(entry.before).toBeUndefined();
    });
  });

  // ── the gate ───────────────────────────────────────────────

  describe('assertEnabled', () => {
    it('refuses while the agent is switched off', async () => {
      prisma.agentPrincipal.findUnique.mockResolvedValue({ active: false });

      await expect(service.assertEnabled()).rejects.toBeInstanceOf(
        ConflictException,
      );
      // The message has to tell the reader what to do about it: this refusal
      // reaches a REGIONAL operator who cannot see the switch endpoint.
      await expect(service.assertEnabled()).rejects.toThrow(/admin can turn/i);
    });

    it('permits while it is on', async () => {
      await expect(service.assertEnabled()).resolves.toBeUndefined();
    });

    it('permits when no principal exists yet', async () => {
      prisma.agentPrincipal.findUnique.mockResolvedValue(null);

      await expect(service.assertEnabled()).resolves.toBeUndefined();
    });
  });
});
