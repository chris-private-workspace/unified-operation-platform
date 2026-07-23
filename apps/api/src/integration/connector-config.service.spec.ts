import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConnectorConfigService } from './connector-config.service';

/**
 * W34 / ADR-0013 (Model C). The two load-bearing guarantees are marked 🔴:
 *  - a secret value never reaches the read-model (describe) — G4;
 *  - a secret column can never be written through update — G4.
 * Everything else verifies DB-then-env precedence (G2), validation (G7) and that
 * a change is audited in the same transaction as the upsert (G6).
 */
describe('ConnectorConfigService', () => {
  let service: ConnectorConfigService;
  let prisma: {
    connectorConfig: { findUnique: jest.Mock; upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { logChange: jest.Mock };
  let env: Record<string, string>;

  const build = (
    opts: {
      row?: Record<string, unknown> | null;
      env?: Record<string, string>;
    } = {},
  ) => {
    env = opts.env ?? {};
    prisma = {
      connectorConfig: {
        findUnique: jest.fn().mockResolvedValue(opts.row ?? null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      // interactive $transaction runs the callback with the same client (W29 pattern)
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    audit = { logChange: jest.fn().mockResolvedValue(true) };
    service = new ConnectorConfigService(
      prisma as unknown as PrismaService,
      { get: (k: string) => env[k] } as unknown as ConfigService,
      audit as unknown as AuditService,
    );
  };

  beforeEach(() => build());

  // ── resolve: DB-then-env precedence (G2) ──
  describe('resolve (DB-then-env)', () => {
    it('uses the DB value when the column has one', async () => {
      build({
        row: { connector: 'graph', graphTenantId: 'db-tenant' },
        env: { GRAPH_TENANT_ID: 'env-tenant' },
      });
      expect(await service.resolve('graph', 'graphTenantId')).toBe('db-tenant');
    });

    it('falls back to env when the column is null', async () => {
      build({
        row: { connector: 'graph', graphTenantId: null },
        env: { GRAPH_TENANT_ID: 'env-tenant' },
      });
      expect(await service.resolve('graph', 'graphTenantId')).toBe(
        'env-tenant',
      );
    });

    it('falls back to env when no row exists', async () => {
      build({ row: null, env: { GRAPH_TENANT_ID: 'env-tenant' } });
      expect(await service.resolve('graph', 'graphTenantId')).toBe(
        'env-tenant',
      );
    });

    it('treats an empty-string column as unset (env wins)', async () => {
      build({
        row: { connector: 'graph', graphTenantId: '' },
        env: { GRAPH_TENANT_ID: 'env-tenant' },
      });
      expect(await service.resolve('graph', 'graphTenantId')).toBe(
        'env-tenant',
      );
    });

    it('returns undefined when neither DB nor env has a value', async () => {
      build({ row: null, env: {} });
      expect(await service.resolve('graph', 'graphTenantId')).toBeUndefined();
    });
  });

  // ── describe: read-model + 🔴 secret boundary (G4) ──
  describe('describe', () => {
    it('labels a non-secret field db / env by where the value came from', async () => {
      build({
        row: {
          connector: 'servicenow',
          serviceNowInstanceUrl: 'https://db.service-now.com',
        },
        env: { SERVICENOW_DEFAULT_TABLE: 'sc_req_item' }, // no instance url in env
      });
      const view = await service.describe('servicenow');
      const url = view.editable.find(
        (f) => f.column === 'serviceNowInstanceUrl',
      )!;
      const table = view.editable.find(
        (f) => f.column === 'serviceNowDefaultTable',
      )!;
      expect(url).toMatchObject({
        value: 'https://db.service-now.com',
        source: 'db',
      });
      expect(table).toMatchObject({ value: 'sc_req_item', source: 'env' });
    });

    it('reports unset with a null value when neither DB nor env has it', async () => {
      build({ row: null, env: {} });
      const view = await service.describe('graph');
      expect(
        view.editable.every((f) => f.source === 'unset' && f.value === null),
      ).toBe(true);
    });

    // 🔴 G4 — the load-bearing test: a secret value must never reach the view.
    it('never returns a secret value — only configured status', async () => {
      build({
        env: {
          GRAPH_CLIENT_SECRET: 'SECRET-GRAPH-DO-NOT-LEAK',
          SERVICENOW_USER: 'svc-account-do-not-leak',
          SERVICENOW_PASSWORD: 'SECRET-SNOW-DO-NOT-LEAK',
          N8N_OUTBOUND_WEBHOOK_KEY: 'SECRET-N8N-DO-NOT-LEAK',
          INTAKE_API_KEY: 'SECRET-INTAKE-DO-NOT-LEAK',
        },
      });
      for (const connector of [
        'graph',
        'servicenow',
        'n8n-outbound',
        'n8n-inbound',
      ] as const) {
        const view = await service.describe(connector);
        const serialised = JSON.stringify(view);
        expect(serialised).not.toContain('DO-NOT-LEAK');
        // secrets carry configured (a boolean) but never a value field.
        for (const s of view.secrets) {
          expect(s).not.toHaveProperty('value');
          expect(typeof s.configured).toBe('boolean');
        }
      }
    });

    it('reports a secret configured only when env has a value', async () => {
      build({ env: { GRAPH_CLIENT_SECRET: 'x' } });
      expect(
        (await service.describe('graph')).secrets.find(
          (s) => s.envKey === 'GRAPH_CLIENT_SECRET',
        )!.configured,
      ).toBe(true);

      build({ env: {} });
      expect(
        (await service.describe('graph')).secrets.find(
          (s) => s.envKey === 'GRAPH_CLIENT_SECRET',
        )!.configured,
      ).toBe(false);
    });
  });

  // ── update: validation + upsert + 🔴 secret boundary (G4 / G7) ──
  describe('update', () => {
    it('upserts a valid non-secret field', async () => {
      await service.update('servicenow', { serviceNowDefaultTable: 'sc_task' });
      expect(prisma.connectorConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { connector: 'servicenow' },
          create: {
            connector: 'servicenow',
            serviceNowDefaultTable: 'sc_task',
          },
          update: { serviceNowDefaultTable: 'sc_task' },
        }),
      );
    });

    // 🔴 G4 — a secret column can never be written through update.
    it('rejects a key that is not an editable field, and writes nothing', async () => {
      await expect(
        service.update('graph', { graphClientSecret: 'HACK' }),
      ).rejects.toThrow(/not an editable field/i);
      expect(prisma.connectorConfig.upsert).not.toHaveBeenCalled();
    });

    it('rejects an editable field that belongs to another connector', async () => {
      await expect(
        service.update('graph', {
          serviceNowInstanceUrl: 'https://x.service-now.com',
        }),
      ).rejects.toThrow(/not an editable field/i);
      expect(prisma.connectorConfig.upsert).not.toHaveBeenCalled();
    });

    it('rejects a bad URL', async () => {
      await expect(
        service.update('servicenow', { serviceNowInstanceUrl: 'not-a-url' }),
      ).rejects.toThrow(/URL/i);
    });

    it('rejects a bad GUID', async () => {
      await expect(
        service.update('graph', { graphTenantId: 'not-a-guid' }),
      ).rejects.toThrow(/GUID/i);
    });

    it('rejects an out-of-enum provider', async () => {
      await expect(
        service.update('n8n-outbound', {
          requestSubmissionProvider: 'carrier-pigeon',
        }),
      ).rejects.toThrow(/one of/i);
    });

    it('accepts a valid provider enum value', async () => {
      await service.update('n8n-outbound', {
        requestSubmissionProvider: 'n8n',
      });
      expect(prisma.connectorConfig.upsert).toHaveBeenCalled();
    });

    it('accepts a valid GUID', async () => {
      await service.update('graph', {
        graphTenantId: '4f63aaa0-5612-4fe8-8175-9f9f4d26c7b4',
      });
      expect(prisma.connectorConfig.upsert).toHaveBeenCalled();
    });

    it('clears an override when the value is empty', async () => {
      await service.update('servicenow', { serviceNowDefaultTable: '' });
      expect(prisma.connectorConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { serviceNowDefaultTable: null } }),
      );
    });

    it('rejects an empty patch', async () => {
      await expect(service.update('graph', {})).rejects.toThrow(
        /no editable fields/i,
      );
    });

    // 🔴 G6 — a change is recorded, in the same transaction as the upsert.
    it('records the change to the audit trail in one transaction', async () => {
      await service.update('servicenow', { serviceNowDefaultTable: 'sc_task' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(audit.logChange).toHaveBeenCalledWith(
        prisma, // tx === prisma in the mock
        expect.objectContaining({
          action: 'connector.config_update',
          targetType: 'ConnectorConfig',
          targetId: 'servicenow',
        }),
      );
    });

    it('passes the actor id through to the audit entry', async () => {
      await service.update(
        'servicenow',
        { serviceNowDefaultTable: 'sc_task' },
        'admin-123',
      );
      expect(audit.logChange).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ actorId: 'admin-123' }),
      );
    });

    it('opens no transaction when validation fails (secret key rejected first)', async () => {
      await expect(
        service.update('graph', { graphClientSecret: 'HACK' }),
      ).rejects.toThrow(/not an editable field/i);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
