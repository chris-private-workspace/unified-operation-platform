import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceNowService } from './servicenow.service';

// ServiceNowService talks to the Table API via global fetch. We stub fetch +
// ConfigService (no real tenant — H5 §3.4). D1 covers the new createRecord path.
describe('ServiceNowService.createRecord', () => {
  let service: ServiceNowService;
  const fetchMock = jest.fn();

  beforeEach(async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    fetchMock.mockReset();

    const env: Record<string, string> = {
      SERVICENOW_INSTANCE_URL: 'https://sn.example.com',
      SERVICENOW_USER: 'svc',
      SERVICENOW_PASSWORD: 'pw',
    };
    const config = {
      getOrThrow: jest.fn((k: string) => env[k]),
      get: jest.fn(() => 'sc_req_item'),
    } as unknown as ConfigService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ServiceNowService,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(ServiceNowService);
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
});
