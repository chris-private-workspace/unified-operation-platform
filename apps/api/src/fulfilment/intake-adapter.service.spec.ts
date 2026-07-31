import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IntakeAdapterService } from './intake-adapter.service';
import { IntakeService } from './intake.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { ConnectorConfigService } from '../integration/connector-config.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-fields';
import {
  N8N_INTAKE_EVENT,
  type N8nNativeIntakeDto,
} from './dto/n8n-native-intake.dto';
import {
  KNOWN_JOB_FUNCTIONS,
  OPCO_BY_JOB_FUNCTION,
} from './opco-department-map';

const REQ_NUMBER = 'REQ0043858';
const REQ_SYS_ID = 'req-sys-abc';
const TARGET_EMAIL = 'jane.doe@rapo.com.hk';

/** Representative WF1 envelope, post the n8n-side change (jobFunction + validated). */
const basePayload = (): N8nNativeIntakeDto => ({
  event: N8N_INTAKE_EVENT,
  idempotencyKey: REQ_NUMBER,
  sentAt: '2026-07-27T02:00:00.000Z',
  request: {
    requestId: REQ_NUMBER,
    openedDate: '2026-07-26T09:00:00.000Z',
    remarks: 'New hire — standard onboarding bundle',
    department: 'RHK IT',
    source: { subject: '[REQ] onboarding', sender: 'it.rhk@rapo.com.hk' },
  },
  targetUser: {
    raw: 'Jane Doe',
    firstName: 'Jane',
    lastName: 'Doe',
    username: 'jane.doe',
    sAMAccountName: 'jdoe',
    email: TARGET_EMAIL,
    validated: true,
  },
  licenseItems: [
    {
      ritmNumber: 'RITM0012345',
      ritmSysId: 'ritm-sys-1',
      ritmTitle: 'O365 License Request',
      licenseCode: 'E5',
      variables: { License: 'E5' },
    },
  ],
});

describe('IntakeAdapterService (ADR-0017 D4)', () => {
  let adapter: IntakeAdapterService;
  let prisma: {
    request: Record<string, jest.Mock>;
    opco: Record<string, jest.Mock>;
    skuCatalog: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let snow: { getRecordByNumber: jest.Mock };
  let connectorConfig: { resolve: jest.Mock };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      request: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      opco: { findUnique: jest.fn() },
      skuCatalog: { findUnique: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    snow = { getRecordByNumber: jest.fn() };
    // Default: no default SKU configured. Every pre-W42 test carries licence
    // lines, so injection never runs for them either way.
    connectorConfig = { resolve: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn() };

    // The REAL IntakeService is wired in on purpose: "nothing was written" then
    // means the whole path stayed dry, not just that a mock went uncalled.
    const moduleRef = await Test.createTestingModule({
      providers: [
        IntakeAdapterService,
        IntakeService,
        { provide: PrismaService, useValue: prisma },
        { provide: ServiceNowService, useValue: snow },
        { provide: ConnectorConfigService, useValue: connectorConfig },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    adapter = moduleRef.get(IntakeAdapterService);
  });

  /** Everything resolves: active OpCo, one SKU hit, REQ found. */
  const happyMocks = () => {
    prisma.opco.findUnique.mockResolvedValue({
      id: 'o-rhk',
      code: 'RHK',
      active: true,
    });
    prisma.skuCatalog.findMany.mockResolvedValue([
      { skuId: 'guid-e5', skuPartNumber: 'SPE_E5' },
    ]);
    prisma.skuCatalog.findUnique.mockResolvedValue({
      id: 'c-e5',
      skuId: 'guid-e5',
      active: true,
    });
    snow.getRecordByNumber.mockResolvedValue({ sys_id: REQ_SYS_ID });
    prisma.request.create.mockImplementation(({ data }: any) => ({
      id: 'r1',
      ...data,
      lineItems: [],
    }));
  };

  // ── happy path ───────────────────────────────────────────────

  it('resolves Job Function, licence code and REQ number, then builds the mirror', async () => {
    happyMocks();

    const res = await adapter.intakeNative(basePayload());

    expect(res).toMatchObject({ id: 'r1' });
    const { data } = prisma.request.create.mock.calls[0][0];
    expect(data).toMatchObject({
      opcoId: 'o-rhk', // 'RHK IT' → RHK
      targetUpn: TARGET_EMAIL,
      targetDisplayName: 'Jane Doe',
      requesterEmail: 'it.rhk@rapo.com.hk',
      serviceNowSysId: REQ_SYS_ID, // reverse-looked-up, not the number
      serviceNowNumber: REQ_NUMBER,
    });
    expect(data.lineItems.create[0]).toMatchObject({
      skuCatalogId: 'c-e5',
      quantity: 1, // n8n sends no quantity; one RITM = one seat
      serviceNowSysId: 'ritm-sys-1',
    });
    // REQ number, not sysId, is what n8n had — assert we asked the right table.
    expect(snow.getRecordByNumber).toHaveBeenCalledWith(
      REQ_NUMBER,
      'sc_request',
    );
  });

  it('leaves the sync gate shut: accountCreatedAt / azureSyncedAt stay null', async () => {
    happyMocks();

    await adapter.intakeNative(basePayload());

    // n8n does not send them. Deriving "synced" from `sentAt` would open the
    // assign gate on n8n's posting time rather than on Graph actually seeing
    // the user, so both stay null by design.
    const { data } = prisma.request.create.mock.calls[0][0];
    expect(data.accountCreatedAt).toBeNull();
    expect(data.azureSyncedAt).toBeNull();
  });

  it('falls back to skuPartNumber when no businessAlias matches', async () => {
    happyMocks();
    prisma.skuCatalog.findMany
      .mockResolvedValueOnce([]) // businessAlias: miss
      .mockResolvedValueOnce([{ skuId: 'guid-e5', skuPartNumber: 'SPE_E5' }]);
    const dto = basePayload();
    dto.licenseItems[0].licenseCode = 'SPE_E5';

    await adapter.intakeNative(dto);

    expect(prisma.request.create).toHaveBeenCalledTimes(1);
  });

  // ── 🔴 hard red line: ambiguity must never be resolved by guessing ──

  it('REJECTS an ambiguous licence code and writes NOTHING', async () => {
    happyMocks();
    // Today "E5" is unique only because the no-Teams variant was never curated.
    // The moment someone curates it, this is the shape we get.
    prisma.skuCatalog.findMany.mockResolvedValue([
      { skuId: 'guid-e5', skuPartNumber: 'SPE_E5' },
      {
        skuId: 'guid-e5-noteams',
        skuPartNumber: 'Microsoft_365_E5_(no_Teams)',
      },
    ]);

    await expect(adapter.intakeNative(basePayload())).rejects.toThrow(
      BadRequestException,
    );

    // The point of the test: no request, no line items, nothing partial.
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  it('names both candidates so an operator can tell them apart', async () => {
    happyMocks();
    prisma.skuCatalog.findMany.mockResolvedValue([
      { skuId: 'guid-e5', skuPartNumber: 'SPE_E5' },
      {
        skuId: 'guid-e5-noteams',
        skuPartNumber: 'Microsoft_365_E5_(no_Teams)',
      },
    ]);

    await expect(adapter.intakeNative(basePayload())).rejects.toThrow(
      /SPE_E5.*Microsoft_365_E5_\(no_Teams\)|Microsoft_365_E5_\(no_Teams\).*SPE_E5/,
    );
  });

  // ── fail-closed on every resolver ────────────────────────────

  it('REJECTS an unknown licence code and writes nothing', async () => {
    happyMocks();
    prisma.skuCatalog.findMany.mockResolvedValue([]);
    const dto = basePayload();
    dto.licenseItems[0].licenseCode = 'Microsoft 365 E5 (Full)';

    await expect(adapter.intakeNative(dto)).rejects.toThrow(
      /Microsoft 365 E5 \(Full\)/,
    );
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  it('REJECTS an unknown Job Function instead of falling back to a default OpCo', async () => {
    happyMocks();
    const dto = basePayload();
    // This is exactly what n8n's own resolveOU() would silently map to RAPO/IT.
    dto.request.department = 'RHK/Information Technology';

    await expect(adapter.intakeNative(dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.request.create).not.toHaveBeenCalled();
    // Never reached the DB or ServiceNow — cheapest check really is first.
    expect(prisma.opco.findUnique).not.toHaveBeenCalled();
    expect(snow.getRecordByNumber).not.toHaveBeenCalled();
  });

  it('REJECTS an inactive OpCo (N8N-INTAKE-HANDOFF §7 #5)', async () => {
    happyMocks();
    prisma.opco.findUnique.mockResolvedValue({
      id: 'o-x',
      code: 'RHK',
      active: false,
    });

    await expect(adapter.intakeNative(basePayload())).rejects.toThrow(
      /inactive/,
    );
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  it('REJECTS when the REQ number is not in ServiceNow', async () => {
    happyMocks();
    snow.getRecordByNumber.mockResolvedValue(null);

    await expect(adapter.intakeNative(basePayload())).rejects.toThrow(
      new RegExp(REQ_NUMBER),
    );
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  it('reports an unreachable ServiceNow as 503, not as a bad request', async () => {
    happyMocks();
    snow.getRecordByNumber.mockRejectedValue(new Error('fetch failed'));

    // The split matters operationally: 400 means fix the payload, 503 means
    // retry later (same reasoning as BUG-003).
    await expect(adapter.intakeNative(basePayload())).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.request.create).not.toHaveBeenCalled();
  });

  // ── H4 ───────────────────────────────────────────────────────

  it('never echoes the target UPN in a rejection message', async () => {
    happyMocks();
    prisma.skuCatalog.findMany.mockResolvedValue([]);

    const err = await adapter.intakeNative(basePayload()).catch((e) => e);

    // Licence code / Job Function / REQ number are safe to quote; the person is not.
    expect(err.message).not.toContain(TARGET_EMAIL);
    expect(err.message).not.toContain('jane.doe');
  });

  it('drops a malformed requesterEmail rather than persisting it', async () => {
    happyMocks();
    const dto = basePayload();
    // The canonical DTO declares this as an email but we build it in code, so no
    // ValidationPipe runs — anything odd out of Outlook would land in the DB.
    dto.request.source = { sender: 'Ricoh IT Helpdesk' };

    await adapter.intakeNative(dto);

    const { data } = prisma.request.create.mock.calls[0][0];
    expect(data.requesterEmail).toBeNull();
  });

  // ── idempotency (delegated, not re-implemented) ──────────────

  it('is idempotent on the resolved REQ sysId', async () => {
    happyMocks();
    await adapter.intakeNative(basePayload());
    expect(prisma.request.create).toHaveBeenCalledTimes(1);

    // Second push: the mirror now exists.
    prisma.request.findUnique.mockResolvedValue({ id: 'r1', lineItems: [] });
    const again = await adapter.intakeNative(basePayload());

    expect(again).toMatchObject({ id: 'r1' });
    expect(prisma.request.create).toHaveBeenCalledTimes(1); // still one
  });

  // ── default onboarding SKU (W42 / ADR-0020) ──────────────────

  describe('default onboarding SKU', () => {
    const DEFAULT_GUID = '06ebc4ee-1bb5-47dd-8120-11324bc54e06';

    /** Same as happyMocks but the envelope carries no licence line at all. */
    const noLicenceMocks = () => {
      prisma.opco.findUnique.mockResolvedValue({
        id: 'o-rhk',
        code: 'RHK',
        active: true,
      });
      snow.getRecordByNumber.mockResolvedValue({ sys_id: REQ_SYS_ID });
      // The created request echoes back the line it was told to create, so the
      // audit step has a real line-item id to point at.
      prisma.request.create.mockImplementation(({ data }: any) => ({
        id: 'r1',
        ...data,
        lineItems: (data.lineItems?.create ?? []).map((l: any, i: number) => ({
          id: `li-${i}`,
          ...l,
        })),
      }));
    };

    const emptyPayload = (): N8nNativeIntakeDto => ({
      ...basePayload(),
      licenseItems: [],
    });

    const configureDefault = () => {
      connectorConfig.resolve.mockResolvedValue(DEFAULT_GUID);
      prisma.skuCatalog.findUnique.mockResolvedValue({
        id: 'c-e5',
        skuId: DEFAULT_GUID,
        skuPartNumber: 'SPE_E5',
        active: true,
      });
    };

    it('injects the default when ServiceNow carried no licence line', async () => {
      noLicenceMocks();
      configureDefault();

      await adapter.intakeNative(emptyPayload());

      const { data } = prisma.request.create.mock.calls[0][0];
      expect(data.lineItems.create).toHaveLength(1);
      expect(data.lineItems.create[0]).toMatchObject({
        skuCatalogId: 'c-e5',
        quantity: 1,
        // Nothing in ServiceNow asked for this line, so it has no RITM.
        serviceNowSysId: null,
      });
    });

    it('audits the injection — the platform authored a line nobody requested', async () => {
      noLicenceMocks();
      configureDefault();

      await adapter.intakeNative(emptyPayload());

      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log.mock.calls[0][1]).toMatchObject({
        action: AUDIT_ACTIONS.INTAKE_DEFAULT_SKU,
        targetType: 'RequestLineItem',
        targetId: 'li-0',
        actorId: null, // m2m intake — no user to attribute it to
      });
    });

    it('does NOT inject when a licence line is already present', async () => {
      // An E3 request stays an E3 request: ServiceNow stated a choice and the
      // platform does not second-guess it (D2).
      happyMocks();

      await adapter.intakeNative(basePayload());

      const { data } = prisma.request.create.mock.calls[0][0];
      expect(data.lineItems.create).toHaveLength(1);
      expect(data.lineItems.create[0].skuCatalogId).toBe('c-e5');
      expect(connectorConfig.resolve).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('still creates the request — with zero lines — when no default is configured', async () => {
      noLicenceMocks();
      connectorConfig.resolve.mockResolvedValue(undefined);

      const res = await adapter.intakeNative(emptyPayload());

      // Fail-SOFT (D6): a request an operator can see is a line short beats a
      // request that never arrived.
      expect(res).toMatchObject({ id: 'r1' });
      const { data } = prisma.request.create.mock.calls[0][0];
      expect(data.lineItems.create).toHaveLength(0);
      // A configuration mistake is an ops event, not a business one.
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('treats a configured-but-inactive SKU the same as unconfigured', async () => {
      noLicenceMocks();
      connectorConfig.resolve.mockResolvedValue(DEFAULT_GUID);
      prisma.skuCatalog.findUnique.mockResolvedValue({
        id: 'c-e5',
        skuId: DEFAULT_GUID,
        skuPartNumber: 'SPE_E5',
        active: false, // deactivated after it was configured
      });

      await adapter.intakeNative(emptyPayload());

      const { data } = prisma.request.create.mock.calls[0][0];
      expect(data.lineItems.create).toHaveLength(0);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('does not audit an injection on an idempotent re-post', async () => {
      noLicenceMocks();
      configureDefault();
      await adapter.intakeNative(emptyPayload());
      expect(audit.log).toHaveBeenCalledTimes(1);

      /**
       * Second push of the same REQ: intake returns the existing request and
       * writes nothing. An audit row here would claim the platform added a line
       * it did not add this time — the misleading-trail failure W41 had to fix.
       *
       * 🔴 The existing request MUST carry the line injected the first time
       * (`findByReq` uses `include: { lineItems: true }`). Returning an empty
       * array here would let `auditInjection`'s defensive "line not found"
       * branch pass this test with the real guard deleted — which is exactly
       * what happened before this mock was corrected.
       */
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        lineItems: [{ id: 'li-0', skuCatalogId: 'c-e5' }],
      });
      await adapter.intakeNative(emptyPayload());

      expect(prisma.request.create).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledTimes(1); // still one
    });
  });
});

describe('OPCO_BY_JOB_FUNCTION (W36 F1 / MAPPING.md §1)', () => {
  it('covers all 18 n8n Job Functions', () => {
    expect(KNOWN_JOB_FUNCTIONS).toHaveLength(18);
  });

  it('maps every RHK Job Function onto the single RHK OpCo', () => {
    const rhk = KNOWN_JOB_FUNCTIONS.filter((k) => k.startsWith('RHK '));
    expect(rhk).toHaveLength(11);
    for (const k of rhk) expect(OPCO_BY_JOB_FUNCTION[k]).toBe('RHK');
  });

  it('keeps RDC2 on its own OpCo (OQ-2) even though AD calls it RAPO/IT', () => {
    expect(OPCO_BY_JOB_FUNCTION['RAPO IT']).toBe('RAPO/IT');
    expect(OPCO_BY_JOB_FUNCTION['RAPO IT (RDC2)']).toBe('RAPO/IT (RDC2)');
  });

  it('collapses both ASPC Job Functions onto one cost centre', () => {
    expect(OPCO_BY_JOB_FUNCTION['RAPO ASPC']).toBe('RAPO/ASPC');
    expect(OPCO_BY_JOB_FUNCTION['RAPO ASPC Warehouse']).toBe('RAPO/ASPC');
  });
});
