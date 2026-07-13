import { beforeEach, describe, expect, it } from 'vitest';
import {
  getLocalProfile,
  setLocalProfile,
  clearLocalProfile,
  clearMustChangePassword,
  type LocalProfile,
} from './local-profile';

const PROFILE: LocalProfile = {
  id: 'u1',
  email: 'a@x',
  displayName: 'Admin',
  role: 'ADMIN',
  opcoScopeId: null,
  mustChangePassword: true,
};

beforeEach(() => localStorage.clear());

describe('local-profile (ADR-0006 §7)', () => {
  it('returns null when nothing is stored', () => {
    expect(getLocalProfile()).toBeNull();
  });

  it('round-trips a profile through localStorage with no token stored', () => {
    setLocalProfile(PROFILE);
    expect(getLocalProfile()).toEqual(PROFILE);
    const stored = JSON.parse(localStorage.getItem('uop.localProfile')!);
    expect(stored).not.toHaveProperty('token'); // tokens live in httpOnly cookies
    expect(stored).not.toHaveProperty('accessToken');
  });

  it('clearLocalProfile removes it', () => {
    setLocalProfile(PROFILE);
    clearLocalProfile();
    expect(getLocalProfile()).toBeNull();
  });

  it('clearMustChangePassword flips the flag but keeps the profile', () => {
    setLocalProfile(PROFILE);
    clearMustChangePassword();
    const p = getLocalProfile();
    expect(p?.mustChangePassword).toBe(false);
    expect(p?.email).toBe('a@x');
  });

  it('returns null on corrupt JSON instead of throwing', () => {
    localStorage.setItem('uop.localProfile', '{not json');
    expect(getLocalProfile()).toBeNull();
  });
});
