import { IntegrationController } from './integration.controller';
import {
  IntegrationStatusService,
  type ConnectorStatus,
} from './integration-status.service';
import { IntegrationProbeService } from './integration-probe.service';
import { ConnectorConfigService } from './connector-config.service';

/**
 * BUG-011 — the layer that had no tests, and therefore the layer the fix fell
 * through.
 *
 * `list()` builds its response FIELD BY FIELD on purpose (ADR-0013 D2: never a
 * spread, so widening the response is always a deliberate act). The cost of that
 * safeguard is that a new field on the read-model reaches nobody until it is
 * added here too — and nothing else in the suite can see the gap:
 *
 *  - `integration-status.service.spec` asserts the SERVICE returns it ✅
 *  - `integrations-panel.test.tsx` builds its own fixtures, so the UI renders it ✅
 *  - …and in between, the controller quietly dropped it.
 *
 * That is the same shape as W45's `apiPatch` defect, one layer over: every test
 * passed because each one stopped at the edge of its own layer.
 */
describe('IntegrationController.list (BUG-011)', () => {
  /**
   * 🔴 Typed as `ConnectorStatus` deliberately. That is what makes the coverage
   * test below self-maintaining: add a required field to the read-model and this
   * fixture stops compiling, so whoever adds it is forced through here.
   */
  const row: ConnectorStatus = {
    key: 'n8n-license',
    label: 'n8n (license operations)',
    state: 'active',
    lastSuccessAt: null,
    lastSuccessNote: null,
    pendingRestart: true,
  };

  const build = () => {
    const status = { list: jest.fn().mockResolvedValue([row]) };
    const probes = { get: jest.fn().mockReturnValue(null) };
    const connectorConfig = {
      describe: jest.fn().mockResolvedValue({ editable: [], secrets: [] }),
    };
    return new IntegrationController(
      status as unknown as IntegrationStatusService,
      probes as unknown as IntegrationProbeService,
      connectorConfig as unknown as ConnectorConfigService,
    );
  };

  it('carries pendingRestart through to the response', async () => {
    const [out] = await build().list();

    expect(out.pendingRestart).toBe(true);
  });

  /**
   * 🔴 Asserts the VALUE, not just the key.
   *
   * The first version of this test checked `toHaveProperty(key)` only — and it
   * stayed green while the controller emitted `pendingRestart: undefined`,
   * because the key was still there. A guard against dropped fields that passes
   * on a dropped field is worse than none: it makes the gap look covered.
   */
  it('carries every read-model field through with its value intact', async () => {
    const [out] = await build().list();

    for (const [key, value] of Object.entries(row)) {
      expect(out).toHaveProperty(key, value);
    }
  });

  it('still refuses to widen beyond the allow-list', async () => {
    // The D2 safeguard the field-by-field build exists for: an extra field on
    // the read-model must NOT reach the response just because it appeared.
    const status = {
      list: jest
        .fn()
        .mockResolvedValue([{ ...row, internalNote: 'secret-ish' }]),
    };
    const controller = new IntegrationController(
      status as unknown as IntegrationStatusService,
      {
        get: jest.fn().mockReturnValue(null),
      } as unknown as IntegrationProbeService,
      {
        describe: jest.fn().mockResolvedValue({ editable: [], secrets: [] }),
      } as unknown as ConnectorConfigService,
    );

    const [out] = await controller.list();

    expect(out).not.toHaveProperty('internalNote');
  });
});
