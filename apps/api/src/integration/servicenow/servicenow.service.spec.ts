import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceNowService } from './servicenow.service';
import { ConnectorConfigService } from '../connector-config.service';
import { REDACTED } from '../scrub-pii';

// ServiceNowService talks to the Table API via global fetch. We stub fetch +
// ConfigService (no real tenant — H5 §3.4). D1 covers the new createRecord path.
describe('ServiceNowService.createRecord', () => {
  let service: ServiceNowService;
  const fetchMock = jest.fn();

  beforeEach(async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    fetchMock.mockReset();

    const env: Record<string, string> = {
      SERVICENOW_USER: 'svc',
      SERVICENOW_PASSWORD: 'pw',
    };
    const config = {
      getOrThrow: jest.fn((k: string) => env[k]),
    } as unknown as ConfigService;
    // Non-secret instance URL / table now come from the resolver (DB-then-env).
    const connectorConfig = {
      resolve: jest.fn((_c: string, column: string) =>
        column === 'serviceNowInstanceUrl'
          ? 'https://sn.example.com'
          : column === 'serviceNowDefaultTable'
            ? 'sc_req_item'
            : undefined,
      ),
    } as unknown as ConnectorConfigService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ServiceNowService,
        { provide: ConfigService, useValue: config },
        { provide: ConnectorConfigService, useValue: connectorConfig },
      ],
    }).compile();
    service = moduleRef.get(ServiceNowService);
    await service.onModuleInit(); // C2: build baseUrl/authHeader/defaultTable
  });

  it('POSTs the fields to the table endpoint and returns the created record', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { sys_id: 'sys-1', number: 'REQ0012345' } }),
    });

    const rec = await service.createRecord(
      { short_description: 'License request', quantity: 2 },
      'sc_request',
    );

    expect(rec).toEqual({ sys_id: 'sys-1', number: 'REQ0012345' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sn.example.com/api/now/table/sc_request');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({
      short_description: 'License request',
      quantity: 2,
    });
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect((opts.headers as Record<string, string>).Authorization).toMatch(
      /^Basic /,
    );
  });

  it('defaults to the configured table when none is given', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { sys_id: 's' } }),
    });

    await service.createRecord({ x: 'y' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://sn.example.com/api/now/table/sc_req_item');
  });

  it('throws when ServiceNow returns a non-ok status (fail-closed)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    });

    await expect(
      service.createRecord({ x: 'y' }, 'sc_request'),
    ).rejects.toThrow(/ServiceNow request failed \(400\)/);
  });

  /**
   * BUG-007 — asserts the LOG LINE, not the exception.
   *
   * The test directly above is the shape BUG-004 hid behind for 18 days: the
   * exception message is ours and has always been clean, so checking it proves
   * nothing about what got written to the log. The leak, if there is one, is in
   * the line nobody was looking at.
   */
  describe('the response body never reaches the log raw', () => {
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    });
    afterEach(() => errorSpy.mockRestore());

    const logged = () =>
      errorSpy.mock.calls.map((c) => String(c[0])).join('\n');

    it('redacts an email ServiceNow echoed back, without losing the triage facts', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        // Shaped like a real refusal of the outbound create, whose
        // short_description carries the target UPN.
        text: async () =>
          '{"error":{"message":"Invalid record: M365/D365 license request — sensitive.person@example.com"}}',
      });

      await expect(
        service.createRecord({ x: 'y' }, 'sc_request'),
      ).rejects.toThrow();

      expect(logged()).not.toContain('sensitive.person@example.com');
      expect(logged()).not.toContain('sensitive.person');
      expect(logged()).toContain(REDACTED);
      // The three facts this log line exists for. Scrubbing must not cost them:
      // without the status and path there is nothing left to triage with, and
      // all five callers were checked — none puts user data in a path.
      expect(logged()).toContain('400');
      expect(logged()).toContain('/api/now/table/sc_request');
      expect(logged()).toContain('POST');
    });

    it('leaves a body with nothing to redact intact', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'User Not Authorized',
      });

      await expect(
        service.createRecord({ x: 'y' }, 'sc_request'),
      ).rejects.toThrow();

      // Over-scrubbing is its own failure: this text is the only clue that the
      // integration account lacks a permission rather than the record being bad.
      expect(logged()).toContain('User Not Authorized');
    });
  });
});

/**
 * ADR-0025 D2 / BUG-010 — the catalog write path.
 *
 * `createRecord` CANNOT open a request on this instance: POST to
 * `/api/now/table/sc_request` is 403 for the integration account even with a
 * one-field payload (table-level ACL). These calls are what actually raises a
 * ticket now, so their shape is worth pinning down.
 */
describe('ServiceNowService — Service Catalog API', () => {
  let service: ServiceNowService;
  const fetchMock = jest.fn();

  const ITEM = 'efe38adedbef6f80a98e75868c961936';

  beforeEach(async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    fetchMock.mockReset();

    const env: Record<string, string> = {
      SERVICENOW_USER: 'svc',
      SERVICENOW_PASSWORD: 'pw',
    };
    const config = {
      getOrThrow: jest.fn((k: string) => env[k]),
    } as unknown as ConfigService;
    const connectorConfig = {
      resolve: jest.fn((_c: string, column: string) =>
        column === 'serviceNowInstanceUrl'
          ? 'https://sn.example.com'
          : column === 'serviceNowDefaultTable'
            ? 'sc_req_item'
            : undefined,
      ),
    } as unknown as ConnectorConfigService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ServiceNowService,
        { provide: ConfigService, useValue: config },
        { provide: ConnectorConfigService, useValue: connectorConfig },
      ],
    }).compile();
    service = moduleRef.get(ServiceNowService);
    await service.onModuleInit();
  });

  it('orders an item immediately and returns the request number', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { request_number: 'REQ0044100' } }),
    });

    const res = await service.orderNow(ITEM, { action_type: 'x' }, 2);

    expect(res).toEqual({ requestNumber: 'REQ0044100' });
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://sn.example.com/api/sn_sc/servicecatalog/items/${ITEM}/order_now`,
    );
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({
      sysparm_quantity: '2', // string — ServiceNow rejects a number here
      variables: { action_type: 'x' },
    });
  });

  /**
   * order_now answers with `request_number`, submit_order has been seen to use
   * `number`. Both are read because neither is guaranteed by anything we own.
   */
  it('falls back to `number` when request_number is absent', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { number: 'REQ0044101' } }),
    });

    await expect(service.submitCartOrder()).resolves.toEqual({
      requestNumber: 'REQ0044101',
    });
  });

  /**
   * An empty answer must fail HERE. Returning '' would fail two steps later
   * inside a read-back, where nothing points at the order as the cause.
   */
  it('throws when the order comes back without any request number', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: {} }),
    });

    await expect(service.orderNow(ITEM, {})).rejects.toThrow(
      /no request number/,
    );
  });

  it('counts what the account cart already holds', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { items: [{}, {}, {}] } }),
    });

    await expect(service.cartItemCount()).resolves.toBe(3);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://sn.example.com/api/sn_sc/servicecatalog/cart');
  });

  it('treats an empty cart response as zero rather than throwing', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await expect(service.cartItemCount()).resolves.toBe(0);
  });

  it('adds to the cart at the item endpoint', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: {} }),
    });

    await service.addToCart(ITEM, { target_users_email: 'a@b.com' }, 1);

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://sn.example.com/api/sn_sc/servicecatalog/items/${ITEM}/add_to_cart`,
    );
    expect(JSON.parse(opts.body as string)).toEqual({
      sysparm_quantity: '1',
      variables: { target_users_email: 'a@b.com' },
    });
  });

  /**
   * The failure everyone will actually hit first: the four mandatory variables
   * live in variable SETS, so an item-level payload that looks complete is
   * rejected (CH-014 D2).
   */
  it('surfaces a 400 for missing mandatory variables', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Mandatory Variables are required',
    });

    await expect(service.orderNow(ITEM, {})).rejects.toThrow(
      /ServiceNow request failed \(400\)/,
    );
  });

  it('surfaces a 5xx', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'unavailable',
    });

    await expect(service.submitCartOrder()).rejects.toThrow(
      /ServiceNow request failed \(503\)/,
    );
  });
});

describe('ServiceNowService.findUserSysIdByEmail', () => {
  let service: ServiceNowService;
  const fetchMock = jest.fn();
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    fetchMock.mockReset();
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const env: Record<string, string> = {
      SERVICENOW_USER: 'svc',
      SERVICENOW_PASSWORD: 'pw',
    };
    const config = {
      getOrThrow: jest.fn((k: string) => env[k]),
    } as unknown as ConfigService;
    const connectorConfig = {
      resolve: jest.fn((_c: string, column: string) =>
        column === 'serviceNowInstanceUrl'
          ? 'https://sn.example.com'
          : undefined,
      ),
    } as unknown as ConnectorConfigService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ServiceNowService,
        { provide: ConfigService, useValue: config },
        { provide: ConnectorConfigService, useValue: connectorConfig },
      ],
    }).compile();
    service = moduleRef.get(ServiceNowService);
    await service.onModuleInit();
  });

  afterEach(() => errorSpy.mockRestore());

  it('returns the sys_id of the single match', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: [{ sys_id: 'user-sys-1' }] }),
    });

    await expect(
      service.findUserSysIdByEmail('someone@rhk.com.hk'),
    ).resolves.toBe('user-sys-1');
    // limit=2 is deliberate: enough to detect a second match, no more.
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('sysparm_limit=2');
  });

  it('returns null when nobody matches (not synced yet)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: [] }),
    });

    await expect(
      service.findUserSysIdByEmail('nobody@rhk.com.hk'),
    ).resolves.toBeNull();
  });

  /**
   * 🔴 ADR-0025 OQ-4 — `email` is not unique on sys_user. Taking the first match
   * would attach a real licence request to the wrong person, with nothing in the
   * record showing it happened.
   */
  it('fails closed when two users share the address', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: [{ sys_id: 'a' }, { sys_id: 'b' }] }),
    });

    await expect(
      service.findUserSysIdByEmail('shared@rhk.com.hk'),
    ).rejects.toThrow(/more than one user/);
  });

  /** H4 — the address is in the query string, so it must not reach a log. */
  it('never logs the e-mail address when the lookup fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });

    await expect(
      service.findUserSysIdByEmail('secret.person@rhk.com.hk'),
    ).rejects.toThrow();

    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).not.toContain('secret.person@rhk.com.hk');
    expect(logged).toContain('<redacted>');
  });
});
