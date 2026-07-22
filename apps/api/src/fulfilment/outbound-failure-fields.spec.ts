import {
  failureErrorText,
  pickFailureExternalRef,
  pickFailurePayload,
} from './outbound-failure-fields';

/**
 * 🔴 G1 — the secret boundary of the outbound failure queue (ADR-0011 D5).
 *
 * This queue stores MORE than the audit trail does (a whole retryable payload),
 * so it is the more attractive place for a credential to hide. Same test shape
 * as W30 G1: feed real-looking secrets in and assert the serialised row carries
 * none of them.
 */
describe('outbound failure whitelist — G1 secret boundary', () => {
  const SECRETS = {
    password: 'SN-PW-must-not-persist',
    servicenowPassword: 'SN-PW-must-not-persist-2',
    apiKey: 'N8N-KEY-must-not-persist',
    accessToken: 'BEARER-must-not-persist',
    refreshToken: 'REFRESH-must-not-persist',
    clientSecret: 'GRAPH-SECRET-must-not-persist',
    authorization: 'Basic must-not-persist',
    rawResponseBody: '{"secret":"must-not-persist"}',
  };

  it('drops every credential-shaped field from payload', () => {
    const out = pickFailurePayload('request.submit', {
      targetUpn: 'may.chan@rhk.ricoh.com.hk',
      opcoCode: 'RHK',
      ...SECRETS,
    });

    const serialised = JSON.stringify(out);
    for (const value of Object.values(SECRETS)) {
      expect(serialised).not.toContain(value);
    }
    // The legitimate fields still made it through — otherwise this test would
    // pass trivially on an empty object.
    expect(out.targetUpn).toBe('may.chan@rhk.ricoh.com.hk');
    expect(out.opcoCode).toBe('RHK');
  });

  it('drops credential-shaped fields nested inside line items', () => {
    const out = pickFailurePayload('request.submit', {
      lineItems: [
        { skuId: 'sku-1', skuPartNumber: 'E3', quantity: 2, ...SECRETS },
      ],
    });

    const serialised = JSON.stringify(out);
    for (const value of Object.values(SECRETS)) {
      expect(serialised).not.toContain(value);
    }
    expect(out.lineItems).toEqual([
      { skuId: 'sku-1', skuPartNumber: 'E3', quantity: 2 },
    ]);
  });

  it('drops credential-shaped fields from externalRef', () => {
    const out = pickFailureExternalRef('request.mirror', {
      serviceNowSysId: 'sys-1',
      serviceNowNumber: 'REQ0012345',
      ...SECRETS,
    });

    const serialised = JSON.stringify(out);
    for (const value of Object.values(SECRETS)) {
      expect(serialised).not.toContain(value);
    }
    expect(out?.serviceNowSysId).toBe('sys-1');
  });
});

describe('per-kind allow-lists', () => {
  /**
   * A work note is addressed to a ticket, not a person. If the UPN leaked in
   * here it would be stored for no reason the repair needs — the narrower the
   * kind, the narrower the row.
   */
  it('does not store the target UPN on a work-note failure', () => {
    const out = pickFailurePayload('servicenow.worknote', {
      snTarget: 'sys-1',
      note: 'License E3 assigned via platform.',
      table: 'sc_req_item',
      targetUpn: 'may.chan@rhk.ricoh.com.hk',
    });

    expect(out).toEqual({
      snTarget: 'sys-1',
      note: 'License E3 assigned via platform.',
      table: 'sc_req_item',
    });
    expect(JSON.stringify(out)).not.toContain('may.chan');
  });

  it('keeps unknown fields out even when they look harmless', () => {
    const out = pickFailurePayload('request.submit', {
      targetUpn: 'a@b.com',
      internalDebugState: 'whatever',
    });
    expect(out.internalDebugState).toBeUndefined();
  });

  /**
   * Only request.mirror has already-happened side-effects. This asymmetry is
   * what makes "never re-submit" (D3) checkable: no externalRef → nothing was
   * created externally → submitting again is safe.
   */
  it('gives externalRef to request.mirror only', () => {
    const ref = { serviceNowSysId: 'sys-1' };
    expect(pickFailureExternalRef('request.mirror', ref)).toBeDefined();
    expect(pickFailureExternalRef('request.submit', ref)).toBeUndefined();
    expect(pickFailureExternalRef('servicenow.worknote', ref)).toBeUndefined();
  });

  it('carries the per-line SN sysIds a mirror repair needs', () => {
    const out = pickFailureExternalRef('request.mirror', {
      serviceNowSysId: 'req-sys',
      serviceNowNumber: 'REQ001',
      lineItems: [
        { serviceNowSysId: 'ritm-1', serviceNowNumber: 'RITM001', extra: 'x' },
      ],
    });
    expect(out?.lineItems).toEqual([
      { serviceNowSysId: 'ritm-1', serviceNowNumber: 'RITM001' },
    ]);
  });
});

describe('failureErrorText', () => {
  it('takes the message, not the error object', () => {
    expect(failureErrorText(new Error('SN returned 503'))).toBe(
      'SN returned 503',
    );
  });

  /**
   * Some drivers stringify an entire response into `message`. Decision 5 allows
   * the message text but not raw bodies — an uncapped column would quietly
   * become the escape hatch around that rule.
   */
  it('caps a runaway message so it cannot become a raw-body dump', () => {
    const text = failureErrorText(new Error('x'.repeat(5000)));
    expect(text.length).toBeLessThanOrEqual(501); // 500 + ellipsis
    expect(text.endsWith('…')).toBe(true);
  });

  it('never returns an empty string', () => {
    expect(failureErrorText(undefined)).toBe('Unknown error');
    expect(failureErrorText(new Error('   '))).toBe('Unknown error');
  });
});
