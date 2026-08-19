import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type AppUser } from '@prisma/client';
import {
  AgentProfileService,
  MAX_PROMPT_LENGTH,
} from './agent-profile.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';

/**
 * W47 F2 — the registry.
 *
 * 🔴 The two claims this file exists to pin are both about REFUSING, not about
 * storing:
 *   - `resolveForRun` never silently picks a model. Every ambiguous or
 *     unavailable case throws, because the failure mode of a quiet default is a
 *     system that looks like it works while running on the wrong thing.
 *   - a prompt edit is audited with before/after (W47 `R1`), and a no-op edit
 *     writes nothing — otherwise the one query R1 depends on fills with noise.
 */

const actor = { id: 'u-admin' } as unknown as AppUser;

const profile = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  principalId: 'pr1',
  name: 'ai-assist (gpt-4o)',
  model: 'gpt-4o',
  prompt: null,
  active: true,
  createdAt: new Date('2026-08-17T00:00:00Z'),
  updatedAt: new Date('2026-08-17T00:00:00Z'),
  ...overrides,
});

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('AgentProfileService', () => {
  let service: AgentProfileService;
  let prisma: {
    agentProfile: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    agentPrincipal: { findUnique: jest.Mock };
  };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      agentProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(profile()),
        create: jest.fn().mockResolvedValue(profile()),
        update: jest.fn().mockResolvedValue(profile()),
      },
      agentPrincipal: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pr1' }),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentProfileService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(AgentProfileService);
  });

  describe('create', () => {
    it('audits the new profile, prompt included (W47 R1 / OQ-C)', async () => {
      prisma.agentProfile.create.mockResolvedValue(
        profile({ prompt: 'be careful' }),
      );

      await service.create({ name: 'n', model: 'gpt-4o' }, actor);

      const [, entry] = audit.log.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(entry.action).toBe(AUDIT_ACTIONS.AGENT_PROFILE_CREATE);
      expect(entry.targetType).toBe('AgentProfile');
      expect(entry.actorId).toBe('u-admin');
      // The prompt is the whole reason this target is not event-only.
      expect(entry.after).toMatchObject({
        model: 'gpt-4o',
        prompt: 'be careful',
      });
    });

    it('refuses a duplicate name with 409, not a raw Prisma error', async () => {
      prisma.agentProfile.create.mockRejectedValue(uniqueViolation());

      await expect(
        service.create({ name: 'dup', model: 'gpt-4o' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows a non-unique database failure untouched', async () => {
      // Reporting an arbitrary failure as "that name is taken" would be a lie
      // about what happened — INC-001 is this project's record of what that costs.
      prisma.agentProfile.create.mockRejectedValue(
        new Error('connection lost'),
      );

      await expect(
        service.create({ name: 'n', model: 'gpt-4o' }, actor),
      ).rejects.toThrow('connection lost');
    });

    it('refuses when the agent does not exist', async () => {
      prisma.agentPrincipal.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ name: 'n', model: 'gpt-4o' }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.agentProfile.create).not.toHaveBeenCalled();
    });

    it('caps the prompt in the SERVICE, not only the DTO', async () => {
      await expect(
        service.create(
          { name: 'n', model: 'm', prompt: 'x'.repeat(MAX_PROMPT_LENGTH + 1) },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.agentProfile.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('audits a prompt change with BEFORE and AFTER', async () => {
      prisma.agentProfile.findUnique.mockResolvedValue(
        profile({ prompt: 'old' }),
      );
      prisma.agentProfile.update.mockResolvedValue(profile({ prompt: 'new' }));

      await service.update('p1', { prompt: 'new' }, actor);

      const [, entry] = audit.log.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(entry.action).toBe(AUDIT_ACTIONS.AGENT_PROFILE_UPDATE);
      expect(entry.before).toEqual({ prompt: 'old' });
      expect(entry.after).toEqual({ prompt: 'new' });
    });

    it('🔴 writes NO audit row when nothing whitelisted changed', async () => {
      // R1's query is "show me every prompt change". No-op edits filling that
      // list is how a monitoring surface stops being read.
      prisma.agentProfile.findUnique.mockResolvedValue(profile());
      prisma.agentProfile.update.mockResolvedValue(profile());

      await service.update('p1', { model: 'gpt-4o' }, actor);

      expect(audit.log).not.toHaveBeenCalled();
    });

    it('audits retirement, because active IS the audited change', async () => {
      prisma.agentProfile.findUnique.mockResolvedValue(profile());
      prisma.agentProfile.update.mockResolvedValue(profile({ active: false }));

      await service.update('p1', { active: false }, actor);

      const [, entry] = audit.log.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(entry.before).toEqual({ active: true });
      expect(entry.after).toEqual({ active: false });
    });

    it('refuses an unknown id before writing anything', async () => {
      prisma.agentProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nope', { model: 'm' }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.agentProfile.update).not.toHaveBeenCalled();
    });
  });

  /**
   * 🔴 The heart of the file. Plan F3-2 sketched a "default profile"; this
   * behaviour deliberately has none (see the service docblock + plan changelog).
   */
  describe('resolveForRun — never picks silently', () => {
    it('uses the only active profile when none was named', async () => {
      prisma.agentProfile.findMany.mockResolvedValue([profile()]);

      const chosen = await service.resolveForRun(undefined, 'pr1');

      expect(chosen.id).toBe('p1');
    });

    it('🔴 refuses when there is more than one, and says how many', async () => {
      prisma.agentProfile.findMany.mockResolvedValue([
        profile(),
        profile({ id: 'p2', name: 'ai-assist (gpt-4o-mini)' }),
      ]);

      await expect(service.resolveForRun(undefined, 'pr1')).rejects.toThrow(
        /2 active profiles/,
      );
    });

    it('refuses when the agent has no active profile at all', async () => {
      // Falling back to whatever is in the environment would make a switched-off
      // registry look like a working one.
      prisma.agentProfile.findMany.mockResolvedValue([]);

      await expect(
        service.resolveForRun(undefined, 'pr1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a profile belonging to a DIFFERENT agent', async () => {
      prisma.agentProfile.findUnique.mockResolvedValue(
        profile({ principalId: 'other' }),
      );

      await expect(service.resolveForRun('p1', 'pr1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('🔴 refuses a retired profile instead of quietly substituting one', async () => {
      prisma.agentProfile.findUnique.mockResolvedValue(
        profile({ active: false }),
      );

      await expect(service.resolveForRun('p1', 'pr1')).rejects.toThrow(
        /switched off/,
      );
      // And it must not fall through to the "only active one" branch.
      expect(prisma.agentProfile.findMany).not.toHaveBeenCalled();
    });

    it('refuses an id that does not exist', async () => {
      prisma.agentProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.resolveForRun('ghost', 'pr1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('list', () => {
    it('hides retired profiles unless asked', async () => {
      await service.list();
      expect(prisma.agentProfile.findMany.mock.calls[0][0].where).toEqual({
        active: true,
      });

      await service.list(true);
      expect(prisma.agentProfile.findMany.mock.calls[1][0].where).toEqual({});
    });
  });

  /**
   * W48 `F5-8` — the read behind the "which agent" picker.
   *
   * 🔴 Two claims, and they fail in opposite directions. Offering a retired
   * profile would move the refusal from the pick to the first turn, where it
   * reads as the chat being broken rather than as a choice being unavailable.
   * Carrying `prompt` would hand every prompt on the platform to a REGIONAL,
   * because this is the one profile read they can reach (`G5`).
   */
  describe('listOptions', () => {
    it('offers active profiles only, with no way to ask for retired ones', async () => {
      await service.listOptions();

      const call = prisma.agentProfile.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ active: true });
      expect(call.select).not.toHaveProperty('prompt');
      expect(Object.keys(call.select)).toEqual(['id', 'name', 'model']);
    });
  });
});
