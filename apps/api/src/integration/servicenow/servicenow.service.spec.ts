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
