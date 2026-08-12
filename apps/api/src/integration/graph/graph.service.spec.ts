import { ConfigService } from '@nestjs/config';
import { GraphService } from './graph.service';
import { ConnectorConfigService } from '../connector-config.service';

/**
 * BUG-001 regression — GraphService must never log a user UPN (PII, H4).
 * Before the fix these logs embedded ${userIdOrUpn}; assert they don't now.
 */
describe('GraphService — H4: no UPN in logs (BUG-001)', () => {
  const config = {
    getOrThrow: jest
      .fn()
      .mockReturnValue('00000000-0000-0000-0000-000000000000'),
  } as unknown as ConfigService;
  // The client is stubbed in each test, so onModuleInit never runs and resolve
  // is never called — an inert stub satisfies the constructor.
  const connectorConfig = {
    resolve: jest.fn(),
  } as unknown as ConnectorConfigService;
  const UPN = 'new.user@rhk.com';

  it('assignLicense success log omits the UPN (still traceable by SKU)', async () => {
    const service = new GraphService(config, connectorConfig);
    (service as any).client = {
      api: jest.fn(() => ({ post: jest.fn().mockResolvedValue({}) })),
    };
    const logSpy = jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation(() => undefined);

    await service.assignLicense(UPN, 'sku-guid-1');

    expect(logSpy).toHaveBeenCalled();
    const logged = logSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain(UPN);
    expect(logged).toContain('sku-guid-1');
  });

  /**
   * CH-027 / ADR-0033 A1 — the fixture is the point. `prepaidUnits` really does
   * carry four keys, and reading only `enabled` is what made 27 live SKUs look
   * seatless. SPE_E3's real numbers (21 enabled / 4477 warning) are used so the
   * fixture cannot drift into a shape Graph never sends.
   */
  it('getSubscribedSkus carries all four prepaidUnits buckets', async () => {
    const service = new GraphService(config, connectorConfig);
    (service as any).client = {
      api: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          value: [
            {
              skuId: 'sku-guid-e3',
              skuPartNumber: 'SPE_E3',
              consumedUnits: 677,
              capabilityStatus: 'Enabled',
              appliesTo: 'User',
              prepaidUnits: {
                enabled: 21,
                suspended: 0,
                warning: 4477,
                lockedOut: 0,
              },
            },
          ],
        }),
      })),
    };

    const [sku] = await service.getSubscribedSkus();

    expect(sku.prepaidEnabled).toBe(21);
    expect(sku.warningUnits).toBe(4477);
    expect(sku.suspendedUnits).toBe(0);
    expect(sku.lockedOutUnits).toBe(0);
    expect(sku.consumedUnits).toBe(677);
    expect(sku.capabilityStatus).toBe('Enabled');
  });

  it('getSubscribedSkus defaults every missing bucket to 0', async () => {
    const service = new GraphService(config, connectorConfig);
    (service as any).client = {
      api: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          value: [{ skuId: 'sku-guid-x', skuPartNumber: 'X' }],
        }),
      })),
    };

    const [sku] = await service.getSubscribedSkus();

    // 0, never undefined: assignableUnits adds two of these together, and one
    // undefined turns the whole seat gate into NaN comparisons that pass.
    expect(sku.prepaidEnabled).toBe(0);
    expect(sku.warningUnits).toBe(0);
    expect(sku.suspendedUnits).toBe(0);
    expect(sku.lockedOutUnits).toBe(0);
  });

  it('findUser error log omits the UPN', async () => {
    const service = new GraphService(config, connectorConfig);
    (service as any).client = {
      api: jest.fn(() => ({
        select: jest.fn(() => ({
          get: jest
            .fn()
            .mockRejectedValue({ statusCode: 500, message: 'boom' }),
        })),
      })),
    };
    const errSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(service.findUser(UPN)).rejects.toBeDefined();

    const logged = errSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain(UPN);
  });
});
