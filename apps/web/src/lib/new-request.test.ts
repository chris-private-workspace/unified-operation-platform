import { describe, expect, it } from 'vitest';
import {
  emptyNewRequest,
  validateNewRequest,
  type NewRequestForm,
} from './new-request';

const valid = (): NewRequestForm => ({
  targetUpn: 'new.user@rapo.com.hk',
  targetDisplayName: '',
  opcoCode: 'RHK',
  requesterEmail: '',
  remark: '',
  lineItems: [{ skuId: 'guid-e3', quantity: 1 }],
});

describe('validateNewRequest', () => {
  it('passes a complete form', () => {
    expect(validateNewRequest(valid())).toBeNull();
  });

  it('requires a target UPN', () => {
    expect(validateNewRequest({ ...valid(), targetUpn: '   ' })).toMatch(
      /UPN/i,
    );
  });

  it('requires an OpCo', () => {
    expect(validateNewRequest({ ...valid(), opcoCode: '' })).toMatch(/OpCo/i);
  });

  it('rejects a malformed requester email', () => {
    expect(
      validateNewRequest({ ...valid(), requesterEmail: 'not-an-email' }),
    ).toMatch(/email/i);
  });

  it('allows a blank requester email (optional)', () => {
    expect(validateNewRequest({ ...valid(), requesterEmail: '' })).toBeNull();
  });

  it('requires each line to pick a SKU', () => {
    expect(
      validateNewRequest({
        ...valid(),
        lineItems: [{ skuId: '', quantity: 1 }],
      }),
    ).toMatch(/SKU/i);
  });

  it('requires an integer quantity ≥ 1', () => {
    expect(
      validateNewRequest({
        ...valid(),
        lineItems: [{ skuId: 'g', quantity: 0 }],
      }),
    ).toMatch(/quantity/i);
    expect(
      validateNewRequest({
        ...valid(),
        lineItems: [{ skuId: 'g', quantity: 1.5 }],
      }),
    ).toMatch(/quantity/i);
  });

  it('requires at least one line', () => {
    expect(validateNewRequest({ ...valid(), lineItems: [] })).toMatch(
      /at least one/i,
    );
  });

  it('reports the offending line number', () => {
    const form = {
      ...valid(),
      lineItems: [
        { skuId: 'g1', quantity: 1 },
        { skuId: '', quantity: 1 },
      ],
    };
    expect(validateNewRequest(form)).toMatch(/Line 2/);
  });

  it('emptyNewRequest pre-fills opcoCode + one blank line', () => {
    const f = emptyNewRequest('RHK');
    expect(f.opcoCode).toBe('RHK');
    expect(f.lineItems).toHaveLength(1);
    expect(f.lineItems[0].skuId).toBe('');
    expect(f.lineItems[0].quantity).toBe(1);
  });
});
