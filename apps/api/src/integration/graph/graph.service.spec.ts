import { ConfigService } from '@nestjs/config';
import { GraphService } from './graph.service';

/**
 * BUG-001 regression — GraphService must never log a user UPN (PII, H4).
 * Before the fix these logs embedded ${userIdOrUpn}; assert they don't now.
 */
describe('GraphService — H4: no UPN in logs (BUG-001)', () => {
  // GUID-shaped dummies keep ClientSecretCredential's constructor happy (no network).
  const config = {
    getOrThrow: jest
      .fn()
      .mockReturnValue('00000000-0000-0000-0000-000000000000'),
  } as unknown as ConfigService;
  const UPN = 'new.user@rhk.com';

  it('assignLicense success log omits the UPN (still traceable by SKU)', async () => {
    const service = new GraphService(config);
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

  it('findUser error log omits the UPN', async () => {
    const service = new GraphService(config);
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
