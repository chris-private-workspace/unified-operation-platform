import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceNowService } from '../integration/servicenow/servicenow.service';
import { DirectServiceNowProvider } from './direct-servicenow.provider';

/**
 * ADR-0025 D2 / BUG-010 — this provider used to build the request with Table API
 * inserts, which are 403 on this instance. It now orders through the Service
 * Catalog, so these tests are about the catalog contract: which item, what
 * variables, and what happens when the read-back does not match what we asked
 * for.
 */
describe('DirectServiceNowProvider', () => {
  let provider: DirectServiceNowProvider;
  let snow: {
    orderNow: jest.Mock;
    addToCart: jest.Mock;
    submitCartOrder: jest.Mock;
    cartItemCount: jest.Mock;
    findUserSysIdByEmail: jest.Mock;
    getRecordByNumber: jest.Mock;
    query: jest.Mock;
    createRecord: jest.Mock;
  };
  let config: { get: jest.Mock };

  const O365_ITEM = 'o365-item-sys-id';
  const D365_ITEM = 'd365-item-sys-id';

  const payload = (over: Record<string, unknown> = {}) => ({
    targetUpn: 'new.joiner@rhk.com.hk',
    opcoCode: 'RHK',
    requesterEmail: 'it.person@rhk.com.hk',
    lineItems: [{ skuId: 'guid-e5', skuPartNumber: 'SPE_E5', quantity: 1 }],
    ...over,
  });

  /** Order accepted, REQ readable, exactly one RITM under it. */
  function arrangeHappy() {
    snow.findUserSysIdByEmail.mockResolvedValue('requester-sys-id');
    snow.orderNow.mockResolvedValue({ requestNumber: 'REQ0099001' });
    snow.submitCartOrder.mockResolvedValue({ requestNumber: 'REQ0099001' });
    snow.cartItemCount.mockResolvedValue(0);
    snow.getRecordByNumber.mockResolvedValue({
      sys_id: 'req-sys',
      number: 'REQ0099001',
    });
    snow.query.mockResolvedValue([{ sys_id: 'ritm-1', number: 'RITM0001' }]);
  }

  beforeEach(async () => {
    snow = {
      orderNow: jest.fn(),
      addToCart: jest.fn(),
      submitCartOrder: jest.fn(),
      cartItemCount: jest.fn(),
      findUserSysIdByEmail: jest.fn(),
      getRecordByNumber: jest.fn(),
      query: jest.fn(),
      createRecord: jest.fn(),
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'SERVICENOW_O365_CATALOG_ITEM_SYS_ID') return O365_ITEM;
        if (key === 'SERVICENOW_D365_CATALOG_ITEM_SYS_ID') return D365_ITEM;
        return undefined; // prefixes fall back to the built-in list
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DirectServiceNowProvider,
        { provide: ServiceNowService, useValue: snow },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    provider = moduleRef.get(DirectServiceNowProvider);
  });

  describe('single line', () => {
    it('orders the O365 item and returns the REQ + RITM read back', async () => {
      arrangeHappy();

      const res = await provider.submit(payload());

      expect(snow.orderNow).toHaveBeenCalledWith(
        O365_ITEM,
        expect.any(Object),
        1,
      );
      expect(res).toEqual({
        serviceNowSysId: 'req-sys',
        serviceNowNumber: 'REQ0099001',
        lineItems: [
          {
            skuId: 'guid-e5',
            quantity: 1,
            serviceNowSysId: 'ritm-1',
            serviceNowNumber: 'RITM0001',
          },
        ],
      });
      // The cart is for multi-line only; a single line must not touch it.
      expect(snow.addToCart).not.toHaveBeenCalled();
      expect(snow.submitCartOrder).not.toHaveBeenCalled();
    });

    /**
     * 🔴 ADR-0025 D3 — the mandatory `target_user` reference carries the
     * REQUESTER, not the new joiner. The new joiner is exactly who does not
     * exist in ServiceNow yet (that is gate ②), so sending their sys_id is not
     * an option; `target_users_email` is what says who the request is for.
     */
    it('puts the requester in target_user and the joiner only in the e-mail variable', async () => {
      arrangeHappy();

      await provider.submit(payload());

      const [, variables] = snow.orderNow.mock.calls[0];
      expect(variables).toMatchObject({
        requester_name: 'requester-sys-id',
        target_user: 'requester-sys-id',
        target_users_email: 'new.joiner@rhk.com.hk',
        target_user_opcos: 'rhk', // lowercase — choice values are lowercase
        opcos: 'rhk',
        action_type: 'new_license_assignment',
      });
      // ADR-0025 D7: no SKU→choice mapping exists yet, so sending a guess would
      // be worse than sending nothing.
      expect(variables).not.toHaveProperty('license_type');
    });

    /**
     * BUG-010 is the whole reason this provider was rewritten: inserting into
     * sc_request is 403 on this instance. If anyone reintroduces a Table API
     * insert here it will pass every other test in this file.
     */
    it('never inserts into sc_request', async () => {
      arrangeHappy();

      await provider.submit(payload());

      expect(snow.createRecord).not.toHaveBeenCalled();
    });
  });

  describe('multi line', () => {
    it('goes through the cart so both lines land under one request', async () => {
      arrangeHappy();
      snow.query.mockResolvedValue([
        { sys_id: 'ritm-1', number: 'RITM0001' },
        { sys_id: 'ritm-2', number: 'RITM0002' },
      ]);

      const res = await provider.submit(
        payload({
          lineItems: [
            { skuId: 'guid-e5', skuPartNumber: 'SPE_E5', quantity: 1 },
            { skuId: 'guid-pbi', skuPartNumber: 'POWER_BI_PRO', quantity: 3 },
          ],
        }),
      );

      expect(snow.cartItemCount).toHaveBeenCalled();
      expect(snow.addToCart).toHaveBeenCalledTimes(2);
      expect(snow.addToCart).toHaveBeenNthCalledWith(
        2,
        O365_ITEM,
        expect.any(Object),
        3,
      );
      expect(snow.submitCartOrder).toHaveBeenCalled();
      expect(snow.orderNow).not.toHaveBeenCalled();
      // Read back in creation order, zipped by index (see describeOrder).
      expect(snow.query).toHaveBeenCalledWith(
        'request=req-sys^ORDERBYsys_created_on',
        'sc_req_item',
        50,
      );
      expect(res.lineItems.map((l) => l.serviceNowSysId)).toEqual([
        'ritm-1',
        'ritm-2',
      ]);
    });

    /**
     * 🔴 The cart belongs to the account, not to this submission, and
     * submit_order submits all of it. A leftover item would be ordered under our
     * REQ against the requester we just named.
     */
    it('refuses to submit when the account cart is not empty', async () => {
      arrangeHappy();
      snow.cartItemCount.mockResolvedValue(2);

      await expect(
        provider.submit(
          payload({
            lineItems: [
              { skuId: 'a', skuPartNumber: 'SPE_E5', quantity: 1 },
              { skuId: 'b', skuPartNumber: 'SPE_E3', quantity: 1 },
            ],
          }),
        ),
      ).rejects.toThrow(/cart already holds 2 item/);

      expect(snow.addToCart).not.toHaveBeenCalled();
      expect(snow.submitCartOrder).not.toHaveBeenCalled();
    });
  });

  describe('catalog item selection', () => {
    it('orders a Dynamics line off the D365 item', async () => {
      arrangeHappy();

      await provider.submit(
        payload({
          lineItems: [
            { skuId: 'guid-scm', skuPartNumber: 'DYN365_SCM', quantity: 1 },
          ],
        }),
      );

      expect(snow.orderNow).toHaveBeenCalledWith(
        D365_ITEM,
        expect.any(Object),
        1,
      );
    });

    it('honours an env override of the D365 prefix list', async () => {
      arrangeHappy();
      config.get.mockImplementation((key: string) => {
        if (key === 'SERVICENOW_O365_CATALOG_ITEM_SYS_ID') return O365_ITEM;
        if (key === 'SERVICENOW_D365_CATALOG_ITEM_SYS_ID') return D365_ITEM;
        if (key === 'SERVICENOW_D365_SKU_PREFIXES') return 'ACME_, ZZZ';
        return undefined;
      });

      await provider.submit(
        payload({
          lineItems: [{ skuId: 'g', skuPartNumber: 'ACME_THING', quantity: 1 }],
        }),
      );

      expect(snow.orderNow).toHaveBeenCalledWith(
        D365_ITEM,
        expect.any(Object),
        1,
      );
    });

    /**
     * One request mirrors ONE serviceNowSysId (ADR-0008 D6), so a split has
     * nowhere to be recorded — the second REQ would exist in ServiceNow with
     * nothing in the platform pointing at it.
     */
    it('refuses to mix O365 and D365 lines', async () => {
      arrangeHappy();

      await expect(
        provider.submit(
          payload({
            lineItems: [
              { skuId: 'a', skuPartNumber: 'SPE_E5', quantity: 1 },
              { skuId: 'b', skuPartNumber: 'DYN365_SCM', quantity: 1 },
            ],
          }),
        ),
      ).rejects.toThrow(/cannot mix O365 and D365/);

      expect(snow.orderNow).not.toHaveBeenCalled();
      expect(snow.addToCart).not.toHaveBeenCalled();
    });

    it('fails closed when the catalog item is not configured', async () => {
      arrangeHappy();
      config.get.mockReturnValue(undefined);

      await expect(provider.submit(payload())).rejects.toThrow(
        /catalog item is not configured/,
      );
      expect(snow.orderNow).not.toHaveBeenCalled();
    });
  });

  describe('fail-closed guards', () => {
    it('does not write anything when the requester is not in ServiceNow', async () => {
      arrangeHappy();
      snow.findUserSysIdByEmail.mockResolvedValue(null);

      await expect(provider.submit(payload())).rejects.toThrow(
        /requester was not found/,
      );
      expect(snow.orderNow).not.toHaveBeenCalled();
      expect(snow.addToCart).not.toHaveBeenCalled();
    });

    it('does not write anything when there is no requester e-mail at all', async () => {
      arrangeHappy();

      await expect(
        provider.submit(payload({ requesterEmail: undefined })),
      ).rejects.toThrow(/no requester e-mail/);
      expect(snow.findUserSysIdByEmail).not.toHaveBeenCalled();
      expect(snow.orderNow).not.toHaveBeenCalled();
    });

    it('fails closed when the request cannot be read back', async () => {
      arrangeHappy();
      snow.getRecordByNumber.mockResolvedValue(null);

      await expect(provider.submit(payload())).rejects.toThrow(
        /cannot be read back/,
      );
    });

    /**
     * Zipping items to lines by index is only sound while the counts match.
     * A mismatch means the workflow made something we did not ask for, and
     * guessing would attach the wrong RITM to the wrong SKU — invisible until
     * somebody closes the wrong ticket.
     */
    it('fails closed when the item count does not match the lines ordered', async () => {
      arrangeHappy();
      snow.query.mockResolvedValue([
        { sys_id: 'ritm-1', number: 'RITM0001' },
        { sys_id: 'ritm-2', number: 'RITM0002' },
      ]);

      await expect(provider.submit(payload())).rejects.toThrow(
        /has 2 item\(s\) but 1 line\(s\)/,
      );
    });

    it('propagates a ServiceNow failure fail-closed', async () => {
      arrangeHappy();
      snow.orderNow.mockRejectedValue(new Error('SN 500'));

      await expect(provider.submit(payload())).rejects.toThrow('SN 500');
    });
  });
});
