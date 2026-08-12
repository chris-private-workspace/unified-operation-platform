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
import { RequestSubmissionProvider } from './request-submission.provider';
import { OutboundFailureService } from './outbound-failure.service';
import { IntakeNotificationService } from './intake-notification.service';
import { OUTBOUND_FAILURE_KINDS } from './outbound-failure-fields';
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
    requestLineItem: Record<string, jest.Mock>;
    requestEvent: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  // ADR-0030 D1 — the REQ's own `opened_by`, which is what now becomes the
  // licence request's requester. ServiceNow returns reference fields as
  // `{ link, value }`, so the sysId sits on `.value`.
  const OPENED_BY_SYS_ID = 'sys-opened-by';

  let snow: { getRecordByNumber: jest.Mock };
  let connectorConfig: { resolve: jest.Mock };
  let audit: { log: jest.Mock };
  let submission: { submit: jest.Mock };
  let failures: { record: jest.Mock };
  // CH-021 — mocked here on purpose. What this file guards is WHEN it is
  // called (only on a genuine create); who receives what is the notification
  // service's own spec.
  let notifications: { notifyNewIntake: jest.Mock };

  beforeEach(async () => {
    prisma = {
      request: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      opco: { findUnique: jest.fn() },
      skuCatalog: { findUnique: jest.fn(), findMany: jest.fn() },
      /**
       * ADR-0025 D2 — default EMPTY, which makes `raiseLicenceRequest` return
       * before it can call anything. Every test written before W43 therefore
       * behaves exactly as it did; the ones that care opt in explicitly.
       */
      requestLineItem: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      // CH-024 C — the licence request's timeline entry. Mocked even for the
      // tests that ignore it: the write is fail-soft, so an undefined mock
      // would be swallowed by its own catch and the assertions below would be
      // asserting against a step that silently never ran.
      requestEvent: { create: jest.fn() },
      // Two shapes now: the interactive callback form, and the array form the
      // RITM write-back uses.
      $transaction: jest.fn((arg: unknown) =>
        Array.isArray(arg)
          ? Promise.all(arg)
          : (arg as (tx: unknown) => unknown)(prisma),
      ),
    };
    snow = { getRecordByNumber: jest.fn() };
    // Default: no default SKU configured. Every pre-W42 test carries licence
    // lines, so injection never runs for them either way.
    connectorConfig = { resolve: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn() };
    submission = { submit: jest.fn() };
    failures = { record: jest.fn() };
    notifications = { notifyNewIntake: jest.fn() };

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
        { provide: RequestSubmissionProvider, useValue: submission },
        { provide: OutboundFailureService, useValue: failures },
        { provide: IntakeNotificationService, useValue: notifications },
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
    snow.getRecordByNumber.mockResolvedValue({
      sys_id: REQ_SYS_ID,
      opened_by: { value: OPENED_BY_SYS_ID },
    });
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
      snow.getRecordByNumber.mockResolvedValue({
        sys_id: REQ_SYS_ID,
        opened_by: { value: OPENED_BY_SYS_ID },
      });
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

  // ── CH-020 / ADR-0024: workflow 1001's flat envelope ─────────

  /**
   * The payload 1001 actually POSTs. Every field here was read off the workflow
   * JSON (`WF1 - Prepare UOP Intake` + `Attach Task Id`) rather than from prose,
   * because the last time the two disagreed nobody noticed for a week.
   */
  describe('intakeFlat (CH-020)', () => {
    const flatPayload = () => ({
      mode: 1,
      targetUpn: TARGET_EMAIL,
      targetDisplayName: 'Jane Doe',
      opcoCode: 'RHK',
      requesterEmail: 'it.rhk@rapo.com.hk',
      source: '1001-immediate',
      requestId: REQ_NUMBER,
      serviceNowTaskSysId: 'task-sys-1',
      serviceNowTaskNumber: 'SCTASK0071802',
    });

    /** 1001 sends no licence line, so the default injection always runs. */
    const flatMocks = () => {
      happyMocks();
      connectorConfig.resolve.mockResolvedValue('guid-e5');
      prisma.skuCatalog.findUnique.mockResolvedValue({
        id: 'c-e5',
        skuId: 'guid-e5',
        skuPartNumber: 'SPE_E5',
        active: true,
      });
    };

    it('resolves the REQ number to a sysId and keeps it as the idempotency key', async () => {
      flatMocks();

      await adapter.intakeFlat(flatPayload());

      expect(snow.getRecordByNumber).toHaveBeenCalledWith(
        REQ_NUMBER,
        'sc_request',
      );
      const { data } = prisma.request.create.mock.calls[0][0];
      expect(data).toMatchObject({
        opcoId: 'o-rhk',
        targetUpn: TARGET_EMAIL,
        targetDisplayName: 'Jane Doe',
        requesterEmail: 'it.rhk@rapo.com.hk',
        // The sysId, not the number — no new key, no new unique constraint.
        serviceNowSysId: REQ_SYS_ID,
        serviceNowNumber: REQ_NUMBER,
      });
    });

    /**
     * 🔴 The whole point of the change. Without the task id on the line, the
     * assign path has nothing to close and falls back to a work note on the
     * parent REQ — which is what happens today.
     */
    it('injects the default SKU and hangs the catalog task off that line', async () => {
      flatMocks();

      await adapter.intakeFlat(flatPayload());

      const { data } = prisma.request.create.mock.calls[0][0];
      expect(data.lineItems.create).toHaveLength(1);
      expect(data.lineItems.create[0]).toMatchObject({
        skuCatalogId: 'c-e5',
        quantity: 1,
        serviceNowTaskSysId: 'task-sys-1',
        serviceNowTaskNumber: 'SCTASK0071802',
        // No RITM: nothing in ServiceNow asked for this line (ADR-0020).
        serviceNowSysId: null,
      });
    });

    /** OQ-2 — n8n's own tracking labels are not the platform's business. */
    it('stores neither mode nor source', async () => {
      flatMocks();

      await adapter.intakeFlat(flatPayload());

      const { data } = prisma.request.create.mock.calls[0][0];
      expect(JSON.stringify(data)).not.toContain('1001-immediate');
      expect(data).not.toHaveProperty('mode');
      expect(data).not.toHaveProperty('source');
    });

    it('leaves the sync gate shut here too', async () => {
      flatMocks();

      await adapter.intakeFlat(flatPayload());

      const { data } = prisma.request.create.mock.calls[0][0];
      expect(data.accountCreatedAt).toBeNull();
      expect(data.azureSyncedAt).toBeNull();
    });

    it('is idempotent on the REQ: a repeat push creates nothing', async () => {
      flatMocks();
      prisma.request.findUnique.mockResolvedValue({
        id: 'r1',
        lineItems: [{ id: 'li-0', skuCatalogId: 'c-e5' }],
      });

      await adapter.intakeFlat(flatPayload());

      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('rejects an OpCo code that is not on this environment', async () => {
      flatMocks();
      prisma.opco.findUnique.mockResolvedValue(null);

      await expect(adapter.intakeFlat(flatPayload())).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive OpCo — the gap the canonical route used to have', async () => {
      flatMocks();
      prisma.opco.findUnique.mockResolvedValue({
        id: 'o-rhk',
        code: 'RHK',
        active: false,
      });

      await expect(adapter.intakeFlat(flatPayload())).rejects.toThrow(
        /inactive/i,
      );
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('rejects a REQ number ServiceNow does not know', async () => {
      flatMocks();
      snow.getRecordByNumber.mockResolvedValue(null);

      await expect(adapter.intakeFlat(flatPayload())).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('treats an unreachable ServiceNow as a 503, not a bad payload', async () => {
      flatMocks();
      snow.getRecordByNumber.mockRejectedValue(new Error('ECONNRESET'));

      await expect(adapter.intakeFlat(flatPayload())).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    /**
     * A request without a task is still worth creating — 1001's own resolver can
     * come back empty. It simply falls back to today's close paths.
     */
    it('creates the request with no task ref when n8n resolved none', async () => {
      flatMocks();
      const dto = flatPayload();
      delete (dto as Record<string, unknown>).serviceNowTaskSysId;
      delete (dto as Record<string, unknown>).serviceNowTaskNumber;

      await adapter.intakeFlat(dto);

      const { data } = prisma.request.create.mock.calls[0][0];
      expect(data.lineItems.create[0]).toMatchObject({
        serviceNowTaskSysId: null,
        serviceNowTaskNumber: null,
      });
    });

    /** Same treatment the native path gives it: drop, do not fail, do not store raw. */
    it('drops a malformed requester address instead of failing the onboarding', async () => {
      flatMocks();
      const dto = { ...flatPayload(), requesterEmail: 'not an address' };

      await adapter.intakeFlat(dto);

      const { data } = prisma.request.create.mock.calls[0][0];
      expect(data.requesterEmail).toBeNull();
    });

    /**
     * ADR-0025 D2 — after taking the onboarding in, the platform raises the
     * `O365 User License Maintenance Request` it will later close itself.
     */
    describe('raising the licence request (ADR-0025 D2)', () => {
      const pendingLine = () => ({
        id: 'li-1',
        quantity: 1,
        serviceNowSysId: null,
        sku: { skuId: 'guid-e5', skuPartNumber: 'SPE_E5' },
      });

      const submitted = () => ({
        serviceNowSysId: 'new-req-sys',
        serviceNowNumber: 'REQ0044200',
        lineItems: [
          {
            skuId: 'guid-e5',
            quantity: 1,
            serviceNowSysId: 'new-ritm',
            serviceNowNumber: 'RITM0055',
          },
        ],
      });

      it('submits the intaken lines and records the RITM on each', async () => {
        flatMocks();
        prisma.requestLineItem.findMany.mockResolvedValue([pendingLine()]);
        submission.submit.mockResolvedValue(submitted());

        await adapter.intakeFlat(flatPayload());

        expect(submission.submit).toHaveBeenCalledWith(
          expect.objectContaining({
            targetUpn: TARGET_EMAIL,
            opcoCode: 'RHK',
            requesterEmail: 'it.rhk@rapo.com.hk',
            lineItems: [
              { skuId: 'guid-e5', skuPartNumber: 'SPE_E5', quantity: 1 },
            ],
          }),
        );
        // OQ-2: the platform's own REQ lands on the LINE, never on the request —
        // Request.serviceNowSysId stays the onboarding REQ (the idempotency key).
        expect(prisma.requestLineItem.update).toHaveBeenCalledWith({
          where: { id: 'li-1' },
          data: {
            serviceNowSysId: 'new-ritm',
            serviceNowNumber: 'RITM0055',
          },
        });
      });

      /**
       * 🔴 The guard that matters most in this file. `intakeFlat` is idempotent
       * by design, so without it every re-push from n8n opens ANOTHER REAL
       * TICKET for the same joiner — and nothing in the platform would look
       * wrong afterwards.
       */
      it('does not raise a second ticket when n8n re-pushes', async () => {
        flatMocks();
        prisma.requestLineItem.findMany.mockResolvedValue([
          { ...pendingLine(), serviceNowSysId: 'raised-already' },
        ]);

        await adapter.intakeFlat(flatPayload());

        expect(submission.submit).not.toHaveBeenCalled();
        // A correct no-op must also stay quiet — a queued failure here would
        // send someone looking for a problem that does not exist.
        expect(failures.record).not.toHaveBeenCalled();
      });

      it('asks for nothing when the request has no lines (default SKU unset)', async () => {
        flatMocks();
        prisma.requestLineItem.findMany.mockResolvedValue([]);

        await adapter.intakeFlat(flatPayload());

        expect(submission.submit).not.toHaveBeenCalled();
      });

      /**
       * 🔴 Fail-soft. The Request is already written and visible by this point;
       * throwing would turn "ServiceNow was briefly down" into "the onboarding
       * vanished". The ticket is recoverable from the queue, a lost intake is
       * not (same reasoning as ADR-0020 D6).
       */
      it('hands the REQ own opened_by over as the requester sysId (ADR-0030 D1)', async () => {
        flatMocks();
        prisma.requestLineItem.findMany.mockResolvedValue([pendingLine()]);
        submission.submit.mockResolvedValue(submitted());

        await adapter.intakeFlat(flatPayload());

        expect(submission.submit).toHaveBeenCalledWith(
          expect.objectContaining({ requesterSysId: OPENED_BY_SYS_ID }),
        );
      });

      it('raises the ticket whatever requesterEmail says, because it is no longer consulted (ADR-0030 D2)', async () => {
        flatMocks();
        prisma.requestLineItem.findMany.mockResolvedValue([pendingLine()]);
        submission.submit.mockResolvedValue(submitted());

        // The address n8n actually sends is the Outlook trigger's sender, which
        // is not a ServiceNow user — that is what killed three live intakes.
        await adapter.intakeFlat({
          ...flatPayload(),
          requesterEmail: 'someone-not-in-servicenow@example.com',
        });

        expect(submission.submit).toHaveBeenCalledWith(
          expect.objectContaining({ requesterSysId: OPENED_BY_SYS_ID }),
        );
      });

      it('refuses when the REQ carries no opened_by instead of falling back to the e-mail lookup (ADR-0030 D3)', async () => {
        flatMocks();
        // Lines DO exist — otherwise raiseLicenceRequest early-returns and the
        // "never submitted" assertion below would pass for the wrong reason.
        prisma.requestLineItem.findMany.mockResolvedValue([pendingLine()]);
        submission.submit.mockResolvedValue(submitted());
        snow.getRecordByNumber.mockResolvedValue({ sys_id: REQ_SYS_ID });

        await expect(adapter.intakeFlat(flatPayload())).rejects.toThrow(
          BadRequestException,
        );
        // The point of D3: nothing may be raised on a guess. A fallback here
        // would revive the 0% path and hide the next failure.
        expect(submission.submit).not.toHaveBeenCalled();
      });

      it('keeps the request and queues a SUBMIT failure when ServiceNow refuses', async () => {
        flatMocks();
        prisma.requestLineItem.findMany.mockResolvedValue([pendingLine()]);
        submission.submit.mockRejectedValue(new Error('SN 503'));

        await expect(adapter.intakeFlat(flatPayload())).resolves.toBeDefined();

        expect(failures.record).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: OUTBOUND_FAILURE_KINDS.REQUEST_SUBMIT,
            requestId: 'r1',
          }),
        );
        expect(prisma.requestLineItem.update).not.toHaveBeenCalled();
      });

      /**
       * 🔴 ADR-0011 D3 — the two kinds are NOT interchangeable. Here the ticket
       * EXISTS and only the local write failed, so the repair must replay from
       * `externalRef` instead of submitting again. Recording this as
       * `request.submit` would open a second real ticket on retry.
       */
      it('queues a MIRROR failure when the ticket was raised but not recorded', async () => {
        flatMocks();
        prisma.requestLineItem.findMany.mockResolvedValue([pendingLine()]);
        submission.submit.mockResolvedValue(submitted());
        prisma.requestLineItem.update.mockImplementation(() => {
          throw new Error('db down');
        });

        await expect(adapter.intakeFlat(flatPayload())).resolves.toBeDefined();

        expect(failures.record).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: OUTBOUND_FAILURE_KINDS.REQUEST_MIRROR,
            externalRef: expect.objectContaining({
              serviceNowSysId: 'new-req-sys',
              serviceNowNumber: 'REQ0044200',
            }),
            requestId: 'r1',
          }),
        );
      });

      /**
       * CH-024 C — the ticket the platform raised lands on the timeline.
       *
       * 🔴 Why this matters more than it looks: the parent REQ number has
       * nowhere on `Request` to live (a second candidate idempotency key is
       * worse than a lost reference), and the RITMs live on the line items. So
       * this event is the ONLY durable record of the REQ the platform opened.
       * Before it, the answer to "which ticket did we raise for this joiner"
       * was one log line.
       */
      describe('recording it on the timeline (CH-024 C)', () => {
        it('writes a NOTE naming the REQ the platform raised, and its RITMs', async () => {
          flatMocks();
          prisma.requestLineItem.findMany.mockResolvedValue([pendingLine()]);
          submission.submit.mockResolvedValue(submitted());

          await adapter.intakeFlat(flatPayload());

          expect(prisma.requestEvent.create).toHaveBeenCalledTimes(1);
          const { data } = prisma.requestEvent.create.mock.calls[0][0];
          expect(data.requestId).toBe('r1');
          expect(data.type).toBe('NOTE');
          // Hardcoded, not rebuilt from `submitted()`: deriving the expectation
          // from the same source as the code makes the assertion a tautology
          // that passes however the wording drifts (CH-023 lesson).
          expect(data.message).toBe(
            'Licence request REQ0044200 raised in ServiceNow by the platform (RITM0055)',
          );
        });

        // H4 — the REQ / RITM numbers are safe; the joiner's UPN is not, and
        // the log line beside this one already holds that boundary.
        it('never puts the target UPN on the timeline', async () => {
          flatMocks();
          prisma.requestLineItem.findMany.mockResolvedValue([pendingLine()]);
          submission.submit.mockResolvedValue(submitted());

          await adapter.intakeFlat(flatPayload());

          const { data } = prisma.requestEvent.create.mock.calls[0][0];
          expect(data.message).not.toContain(TARGET_EMAIL);
        });

        /**
         * 🔴 Fail-soft. By this point the ServiceNow ticket is REAL and the
         * RITMs are already on the lines. Throwing would unwind nothing over
         * there and would turn a bookkeeping miss into a failed intake.
         */
        it('a failed timeline write does not fail the intake', async () => {
          flatMocks();
          prisma.requestLineItem.findMany.mockResolvedValue([pendingLine()]);
          submission.submit.mockResolvedValue(submitted());
          prisma.requestEvent.create.mockRejectedValue(new Error('db down'));

          await expect(
            adapter.intakeFlat(flatPayload()),
          ).resolves.toMatchObject({ id: 'r1' });

          // And the RITMs still got written — the failure is confined to the
          // note, not to the step before it.
          expect(prisma.requestLineItem.update).toHaveBeenCalled();
        });

        /**
         * 🔴 "Comes free from the early return" is exactly the kind of claim
         * that stops being true when someone moves the call. n8n retries up to
         * three times, so a duplicate here means three timeline entries for one
         * ticket — and the timeline is what an operator trusts.
         */
        it('n8n re-pushing does not add a second entry', async () => {
          flatMocks();
          prisma.requestLineItem.findMany.mockResolvedValue([
            { ...pendingLine(), serviceNowSysId: 'raised-already' },
          ]);

          await adapter.intakeFlat(flatPayload());

          expect(prisma.requestEvent.create).not.toHaveBeenCalled();
        });

        it('writes nothing when ServiceNow refused the submission', async () => {
          flatMocks();
          prisma.requestLineItem.findMany.mockResolvedValue([pendingLine()]);
          submission.submit.mockRejectedValue(new Error('SN 503'));

          await adapter.intakeFlat(flatPayload());

          expect(prisma.requestEvent.create).not.toHaveBeenCalled();
        });
      });
    });
  });

  /**
   * CH-021 — the notification fires on a genuine create and on nothing else.
   *
   * 🔴 The interesting assertions here are the NEGATIVE ones. Intake is
   * idempotent on the REQ sysId and workflow 1001 retries up to three times, so
   * a missing guard does not show up as an error — it shows up as the OpCo IT
   * team getting three identical mails for one joiner and starting to ignore
   * all of them. That is CH-021 R1, rated High.
   */
  describe('CH-021 — onboarding intake notification', () => {
    const canonicalPayload = () => ({
      targetUpn: TARGET_EMAIL,
      targetDisplayName: 'Jane Doe',
      opcoCode: 'RHK',
      serviceNowSysId: REQ_SYS_ID,
      serviceNowNumber: REQ_NUMBER,
      lineItems: [{ skuId: 'guid-e5', quantity: 1 }],
    });

    const flatPayload = () => ({
      mode: 1,
      targetUpn: TARGET_EMAIL,
      targetDisplayName: 'Jane Doe',
      opcoCode: 'RHK',
      requesterEmail: 'it.rhk@rapo.com.hk',
      source: '1001-immediate',
      requestId: REQ_NUMBER,
    });

    /** A1 / A3 — all three routes, one behaviour. */
    it.each([
      [
        'canonical',
        (a: IntakeAdapterService) =>
          a.intakeCanonical(canonicalPayload() as never),
      ],
      [
        'flat',
        (a: IntakeAdapterService) => a.intakeFlat(flatPayload() as never),
      ],
      ['native', (a: IntakeAdapterService) => a.intakeNative(basePayload())],
    ])('notifies once when the %s route creates a request', async (_n, run) => {
      happyMocks();
      connectorConfig.resolve.mockResolvedValue('guid-e5');
      prisma.skuCatalog.findUnique.mockResolvedValue({
        id: 'c-e5',
        skuId: 'guid-e5',
        skuPartNumber: 'SPE_E5',
        active: true,
      });

      await run(adapter);

      expect(notifications.notifyNewIntake).toHaveBeenCalledTimes(1);
      expect(notifications.notifyNewIntake).toHaveBeenCalledWith('r1');
    });

    /**
     * 🔴 A2 — the guard. `preExisting` is read BEFORE the write, which is the
     * only moment the answer is still knowable: afterwards `intake()` returns
     * the same object either way.
     */
    it.each([
      [
        'canonical',
        (a: IntakeAdapterService) =>
          a.intakeCanonical(canonicalPayload() as never),
      ],
      [
        'flat',
        (a: IntakeAdapterService) => a.intakeFlat(flatPayload() as never),
      ],
      ['native', (a: IntakeAdapterService) => a.intakeNative(basePayload())],
    ])(
      'sends nothing when the %s route re-pushes a known REQ',
      async (_n, run) => {
        happyMocks();
        connectorConfig.resolve.mockResolvedValue('guid-e5');
        prisma.skuCatalog.findUnique.mockResolvedValue({
          id: 'c-e5',
          skuId: 'guid-e5',
          skuPartNumber: 'SPE_E5',
          active: true,
        });
        // Both the adapter's pre-check and IntakeService's own idempotency read
        // this same mock, which is exactly the production shape.
        prisma.request.findUnique.mockResolvedValue({
          id: 'r1',
          lineItems: [],
        });

        await run(adapter);

        expect(notifications.notifyNewIntake).not.toHaveBeenCalled();
        expect(prisma.request.create).not.toHaveBeenCalled();
      },
    );

    /**
     * 🔴 MOVED HERE from `intake.controller.spec.ts` by CH-021, and the move is
     * the point. That file used to assert `IntakeService.intake` got an
     * undefined SECOND argument — a canonical caller must not reach the by-task
     * close route, which bypasses ADR-0018 D3's "exactly one active task"
     * protection. Once the controller called `intakeCanonical(dto)` that
     * assertion became true by arity rather than by intent, so it would have
     * kept passing while the guarantee rotted.
     *
     * Asserted on the WRITTEN ROW rather than the call shape: if
     * `intakeCanonical` ever forwards a task ref, this goes red no matter how
     * the argument is spelled.
     */
    it('intakeCanonical passes no task ref — the by-task close route stays shut', async () => {
      happyMocks();

      await adapter.intakeCanonical(canonicalPayload() as never);

      const { data } = prisma.request.create.mock.calls[0][0];
      expect(data.lineItems.create[0]).toMatchObject({
        serviceNowTaskSysId: null,
        serviceNowTaskNumber: null,
      });
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
