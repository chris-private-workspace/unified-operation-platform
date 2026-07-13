import { describe, expect, it } from 'vitest';
import {
  isLocal,
  providerLabel,
  roleLabel,
  scopeLabel,
  validateCreateUser,
  type CreateUserForm,
} from './user-admin';
import type { AdminUser } from './api-types';

const form = (over: Partial<CreateUserForm> = {}): CreateUserForm => ({
  email: 'new@uop.local',
  displayName: 'New User',
  role: 'REGIONAL',
  opcoScopeId: '',
  password: 'sup3rsecret',
  ...over,
});

const user = (over: Partial<AdminUser> = {}): AdminUser => ({
  id: 'u1',
  email: 'a@uop.local',
  displayName: 'A',
  role: 'REGIONAL',
  opcoScopeId: null,
  opcoScope: null,
  authProvider: 'local',
  active: true,
  lastLoginAt: null,
  ...over,
});

describe('validateCreateUser', () => {
  it('accepts a valid regional user', () => {
    expect(validateCreateUser(form())).toBeNull();
  });

  it('requires an email', () => {
    expect(validateCreateUser(form({ email: '  ' }))).toMatch(
      /email is required/i,
    );
  });

  it('rejects a malformed email', () => {
    expect(validateCreateUser(form({ email: 'not-an-email' }))).toMatch(
      /valid email/i,
    );
  });

  it('requires a display name', () => {
    expect(validateCreateUser(form({ displayName: '' }))).toMatch(
      /display name/i,
    );
  });

  it('requires a scope for OPCO_IT', () => {
    expect(
      validateCreateUser(form({ role: 'OPCO_IT', opcoScopeId: '' })),
    ).toMatch(/opco/i);
    expect(
      validateCreateUser(form({ role: 'OPCO_IT', opcoScopeId: 'opco-rhk' })),
    ).toBeNull();
  });

  it('enforces the 8-char password floor', () => {
    expect(validateCreateUser(form({ password: 'short' }))).toMatch(
      /at least 8/i,
    );
  });
});

describe('display helpers', () => {
  it('labels roles in sentence case', () => {
    expect(roleLabel('ADMIN')).toBe('Admin');
    expect(roleLabel('OPCO_IT')).toBe('OpCo IT');
  });

  it('labels the provider', () => {
    expect(providerLabel('local')).toBe('Local');
    expect(providerLabel('entra')).toBe('SSO');
  });

  it('shows the OpCo code when scoped, else all OpCos', () => {
    expect(
      scopeLabel(user({ opcoScope: { code: 'RHK', displayName: 'RHK' } })),
    ).toBe('RHK');
    expect(scopeLabel(user())).toBe('All OpCos');
  });

  it('detects local accounts', () => {
    expect(isLocal(user({ authProvider: 'local' }))).toBe(true);
    expect(isLocal(user({ authProvider: 'entra' }))).toBe(false);
  });
});
