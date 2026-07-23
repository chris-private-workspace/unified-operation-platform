import { ConfigService } from '@nestjs/config';
import { N8N_KEY_HEADER, N8nWorkflowProvider } from './n8n-workflow.provider';

// N8nWorkflowProvider POSTs to the n8n webhook via global fetch. We stub fetch +
// ConfigService (no real n8n — H5 §3.4). CONTRACT-OUTBOUND §3-§5 covered here.
describe('N8nWorkflowProvider', () => {
  let provider: N8nWorkflowProvider;
  const fetchMock = jest.fn();

  const WEBHOOK_URL = 'https://n8n.example.com/webhook/create-license-request';
  const WEBHOOK_KEY = 'n8n-secret';

  beforeEach(() => {
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    fetchMock.mockReset();

    // The URL is now passed in by the factory (non-secret, DB-then-env); only the
    // key is read from env. Constructed directly since the URL param is not DI.
    const config = {
      getOrThrow: jest.fn((k: string) => {
        if (k === 'N8N_OUTBOUND_WEBHOOK_KEY') return WEBHOOK_KEY;
        throw new Error(`missing ${k}`);
      }),
    } as unknown as ConfigService;

    provider = new N8nWorkflowProvider(config, WEBHOOK_URL);
  });

  const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  it('POSTs the payload with the auth header and maps the synchronous response to SubmittedRequest', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        request: { sysId: 'req-sys', number: 'REQ0001' },
        lineItems: [
          { skuId: 'guid-e3', sysId: 'ritm-1', number: 'RITM0001' },
          { skuId: 'guid-p1', sysId: 'ritm-2', number: 'RITM0002' },
        ],
      }),
    );

    const res = await provider.submit({
      targetUpn: 'user@rhk.com.hk',
      opcoCode: 'RHK',
      requesterEmail: 'it@rhk.com.hk',
      remark: 'need e3',
      lineItems: [
        { skuId: 'guid-e3', skuPartNumber: 'SPE_E3', quantity: 1 },
        { skuId: 'guid-p1', quantity: 3 },
      ],
    });

    // URL + method + auth header + serialized payload
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WEBHOOK_URL);
    expect(opts.method).toBe('POST');
    const headers = opts.headers as Record<string, string>;
    expect(headers[N8N_KEY_HEADER]).toBe(WEBHOOK_KEY);
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body as string)).toEqual({
      targetUpn: 'user@rhk.com.hk',
      opcoCode: 'RHK',
      requesterEmail: 'it@rhk.com.hk',
      remark: 'need e3',
      lineItems: [
        { skuId: 'guid-e3', skuPartNumber: 'SPE_E3', quantity: 1 },
        { skuId: 'guid-p1', quantity: 3 },
      ],
    });

    // response → SubmittedRequest (quantity comes from the payload, not response)
    expect(res).toEqual({
      serviceNowSysId: 'req-sys',
      serviceNowNumber: 'REQ0001',
      lineItems: [
        {
          skuId: 'guid-e3',
          quantity: 1,
          serviceNowSysId: 'ritm-1',
          serviceNowNumber: 'RITM0001',
        },
        {
          skuId: 'guid-p1',
          quantity: 3,
          serviceNowSysId: 'ritm-2',
          serviceNowNumber: 'RITM0002',
        },
      ],
    });
  });

  it('throws fail-closed when the webhook returns a non-2xx status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'bad gateway',
    });

    await expect(
      provider.submit({
        targetUpn: 'u@x',
        opcoCode: 'RHK',
        lineItems: [{ skuId: 'g', quantity: 1 }],
      }),
    ).rejects.toThrow(/n8n outbound webhook failed \(502\)/);
  });

  it('throws when the response is missing request.sysId', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        request: { number: 'REQ0001' }, // no sysId
        lineItems: [{ skuId: 'g', sysId: 'ritm-1' }],
      }),
    );

    await expect(
      provider.submit({
        targetUpn: 'u@x',
        opcoCode: 'RHK',
        lineItems: [{ skuId: 'g', quantity: 1 }],
      }),
    ).rejects.toThrow(/missing request.sysId/);
  });

  it('throws when the response line count does not match what was sent', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        request: { sysId: 'req-sys' },
        lineItems: [{ skuId: 'g1', sysId: 'ritm-1' }], // sent 2, got 1
      }),
    );

    await expect(
      provider.submit({
        targetUpn: 'u@x',
        opcoCode: 'RHK',
        lineItems: [
          { skuId: 'g1', quantity: 1 },
          { skuId: 'g2', quantity: 1 },
        ],
      }),
    ).rejects.toThrow(/line count mismatch/);
  });

  it('throws when a response line is missing its RITM sysId', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        request: { sysId: 'req-sys' },
        lineItems: [{ skuId: 'g1' }], // no sysId
      }),
    );

    await expect(
      provider.submit({
        targetUpn: 'u@x',
        opcoCode: 'RHK',
        lineItems: [{ skuId: 'g1', quantity: 1 }],
      }),
    ).rejects.toThrow(/line 0 missing sysId/);
  });

  it('throws when a response line skuId does not line up with the sent order', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        request: { sysId: 'req-sys' },
        lineItems: [{ skuId: 'WRONG', sysId: 'ritm-1' }],
      }),
    );

    await expect(
      provider.submit({
        targetUpn: 'u@x',
        opcoCode: 'RHK',
        lineItems: [{ skuId: 'g1', quantity: 1 }],
      }),
    ).rejects.toThrow(/line 0 skuId mismatch/);
  });
});
