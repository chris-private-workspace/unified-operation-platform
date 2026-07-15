import { Test } from '@nestjs/testing';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { DirectServiceNowProvider } from './direct-servicenow.provider';

describe('DirectServiceNowProvider', () => {
  let provider: DirectServiceNowProvider;
  let snow: { createRecord: jest.Mock };

  beforeEach(async () => {
    snow = { createRecord: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DirectServiceNowProvider,
        { provide: ServiceNowService, useValue: snow },
      ],
    }).compile();
    provider = moduleRef.get(DirectServiceNowProvider);
  });

  it('creates a REQ then one RITM per line (linked), returns SN ids in order', async () => {
    snow.createRecord
      .mockResolvedValueOnce({ sys_id: 'req-sys', number: 'REQ0001' }) // REQ
      .mockResolvedValueOnce({ sys_id: 'ritm-1', number: 'RITM0001' }) // line 1
      .mockResolvedValueOnce({ sys_id: 'ritm-2', number: 'RITM0002' }); // line 2

    const res = await provider.submit({
      targetUpn: 'user@rhk.com.hk',
      opcoCode: 'RHK',
      remark: 'need e3',
      lineItems: [
        { skuId: 'guid-e3', skuPartNumber: 'SPE_E3', quantity: 1 },
        { skuId: 'guid-p1', quantity: 3 },
      ],
    });

    // REQ created first on sc_request
    expect(snow.createRecord).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ comments: 'need e3' }),
      'sc_request',
    );
    // each RITM linked to the REQ sysId on sc_req_item
    expect(snow.createRecord).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        request: 'req-sys',
        cat_item: 'guid-e3',
        quantity: 1,
      }),
      'sc_req_item',
    );
    expect(snow.createRecord).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        request: 'req-sys',
        cat_item: 'guid-p1',
        quantity: 3,
      }),
      'sc_req_item',
    );
    expect(snow.createRecord).toHaveBeenCalledTimes(3);
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

  it('propagates a ServiceNow failure fail-closed (REQ fails → no RITM, throws)', async () => {
    snow.createRecord.mockRejectedValueOnce(new Error('SN 500'));

    await expect(
      provider.submit({
        targetUpn: 'u@x',
        opcoCode: 'RHK',
        lineItems: [{ skuId: 'g', quantity: 1 }],
      }),
    ).rejects.toThrow('SN 500');
    expect(snow.createRecord).toHaveBeenCalledTimes(1); // stopped at REQ
  });
});
