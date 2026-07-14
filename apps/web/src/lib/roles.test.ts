import { describe, expect, it } from 'vitest';
import { roleScopeLabel, canSeePlatform, canSeeAdminNav } from './roles';
import type { OpcoRef } from './api-types';

const RHK: OpcoRef = { code: 'RHK', displayName: 'Ricoh Hong Kong' };

describe('roleScopeLabel (AUTH-3b)', () => {
  it('ADMIN → all OpCos', () => {
    expect(roleScopeLabel('ADMIN', null)).toBe('Admin — all OpCos');
  });
  it('REGIONAL → all OpCos', () => {
    expect(roleScopeLabel('REGIONAL', null)).toBe('Regional — all OpCos');
  });
  it('OPCO_IT with scope → scoped label', () => {
    expect(roleScopeLabel('OPCO_IT', RHK)).toBe('RHK — Ricoh Hong Kong only');
  });
  it('OPCO_IT before /me fills opcoScope → neutral OpCo IT', () => {
    expect(roleScopeLabel('OPCO_IT', null)).toBe('OpCo IT');
  });
  it('undefined (role still loading) → neutral signing-in label', () => {
    expect(roleScopeLabel(undefined, null)).toBe('Signing in…');
  });
});

describe('canSeePlatform (AUTH-3b)', () => {
  it('ADMIN / REGIONAL can', () => {
    expect(canSeePlatform('ADMIN')).toBe(true);
    expect(canSeePlatform('REGIONAL')).toBe(true);
  });
  it('OPCO_IT cannot (tenant-wide surface)', () => {
    expect(canSeePlatform('OPCO_IT')).toBe(false);
  });
  it('undefined (loading) → false (fail-safe)', () => {
    expect(canSeePlatform(undefined)).toBe(false);
  });
});

describe('canSeeAdminNav (AUTH-3b)', () => {
  it('ADMIN only', () => {
    expect(canSeeAdminNav('ADMIN')).toBe(true);
    expect(canSeeAdminNav('REGIONAL')).toBe(false);
    expect(canSeeAdminNav('OPCO_IT')).toBe(false);
  });
  it('undefined (loading) → false (fail-safe)', () => {
    expect(canSeeAdminNav(undefined)).toBe(false);
  });
});
