import {
  AUDIT_FIELD_WHITELIST,
  auditDiff,
  isNeverAudited,
  pickAuditFields,
  pickAuditMetadata,
} from './audit-fields';

/**
 * W29 G2 — the hard red line. If any of these go red, secrets or unreviewed
 * fields can reach the audit table (H4). These tests were written BEFORE any
 * service was wired to the audit trail, on purpose: the net goes up first.
 */
describe('audit field whitelist (H4 boundary)', () => {
  // A realistic full Prisma AppUser — exactly what a careless
  // `before: user` would have serialised.
  const fullUser = {
    id: 'usr_1',
    entraOid: null,
    email: 'chris.lai@rapo.com.hk',
    displayName: 'Chris Lai',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$SECRET_DO_NOT_LEAK',
    authProvider: 'local',
    mustChangePassword: false,
    failedLoginCount: 2,
    lockedUntil: null,
    passwordChangedAt: new Date('2026-07-01'),
    role: 'ADMIN',
    opcoScopeId: null,
    active: true,
    lastLoginAt: new Date('2026-07-20'),
    createdAt: new Date('2026-01-01'),
  };

  it('never serialises passwordHash', () => {
    const picked = pickAuditFields('AppUser', fullUser);
    expect(picked).toBeDefined();
    expect(JSON.stringify(picked)).not.toContain('SECRET_DO_NOT_LEAK');
    expect(picked).not.toHaveProperty('passwordHash');
  });

  it('never serialises any blacklisted key, whatever the shape', () => {
    for (const key of [
      'passwordHash',
      'tokenHash',
      'password',
      'newPassword',
      'currentPassword',
      'secret',
      'apiKey',
      'accessToken',
      'refreshToken',
      // suffix rules
      'someOtherHash',
      'clientSecret',
    ]) {
      expect(isNeverAudited(key)).toBe(true);
    }
  });

  // Regression guard for the obvious wrong implementation: a substring match on
  // "password" would kill this legitimate audited field.
  it('does NOT mistake mustChangePassword for a secret', () => {
    expect(isNeverAudited('mustChangePassword')).toBe(false);
    expect(pickAuditFields('AppUser', fullUser)).toHaveProperty(
      'mustChangePassword',
      false,
    );
  });

  it('drops fields nobody whitelisted', () => {
    const picked = pickAuditFields('AppUser', fullUser)!;
    // present on the entity, deliberately not audited
    for (const key of [
      'failedLoginCount',
      'lockedUntil',
      'passwordChangedAt',
      'lastLoginAt',
      'entraOid',
      'id',
      'createdAt',
    ]) {
      expect(picked).not.toHaveProperty(key);
    }
  });

  it('keeps exactly the whitelisted keys present on the source', () => {
    expect(Object.keys(pickAuditFields('AppUser', fullUser)!).sort()).toEqual(
      [...AUDIT_FIELD_WHITELIST.AppUser].sort(),
    );
  });

  // P-B (Decision 7): email / displayName are allowed precisely because they
  // are the thing being changed. This asserts the decision, so flipping it
  // later is a visible, deliberate edit.
  it('keeps email + displayName (option P-B)', () => {
    const picked = pickAuditFields('AppUser', fullUser)!;
    expect(picked.email).toBe('chris.lai@rapo.com.hk');
    expect(picked.displayName).toBe('Chris Lai');
  });

  it('no whitelist anywhere contains a blacklisted key', () => {
    for (const [target, fields] of Object.entries(AUDIT_FIELD_WHITELIST)) {
      for (const field of fields) {
        expect({ target, field, blocked: isNeverAudited(field) }).toEqual({
          target,
          field,
          blocked: false,
        });
      }
    }
  });

  it('returns undefined instead of an empty object', () => {
    expect(pickAuditFields('AppUser', {})).toBeUndefined();
    expect(pickAuditFields('AppUser', null)).toBeUndefined();
    expect(pickAuditFields('AppUser', 'nonsense')).toBeUndefined();
  });
});

describe('audit metadata (escape-hatch prevention)', () => {
  it('keeps only the restricted key set', () => {
    const picked = pickAuditMetadata({
      reason: 'quarterly review',
      emailAttempted: 'attacker@example.com',
      // everything below must be dropped
      requestBody: { password: 'hunter2' },
      ip: '10.0.0.1',
      passwordHash: 'LEAK',
      arbitrary: 'nope',
    });
    expect(picked).toEqual({
      reason: 'quarterly review',
      emailAttempted: 'attacker@example.com',
    });
    expect(JSON.stringify(picked)).not.toContain('hunter2');
    expect(JSON.stringify(picked)).not.toContain('LEAK');
  });

  it('returns undefined when nothing survives', () => {
    expect(pickAuditMetadata({ ip: '10.0.0.1' })).toBeUndefined();
    expect(pickAuditMetadata(undefined)).toBeUndefined();
  });
});

describe('auditDiff', () => {
  const before = {
    email: 'a@x.com',
    displayName: 'A',
    role: 'REGIONAL',
    active: true,
  };
  const after = {
    email: 'a@x.com',
    displayName: 'A',
    role: 'ADMIN',
    active: true,
  };

  it('stores only what changed', () => {
    expect(auditDiff('AppUser', before, after)).toEqual({
      before: { role: 'REGIONAL' },
      after: { role: 'ADMIN' },
    });
  });

  // A no-op PATCH should not create an audit row at all.
  it('returns null when nothing changed', () => {
    expect(auditDiff('AppUser', before, { ...before })).toBeNull();
  });

  it('handles create (no before) and never leaks on either side', () => {
    const diff = auditDiff('AppUser', null, {
      ...after,
      passwordHash: 'SECRET_DO_NOT_LEAK',
    });
    expect(diff?.before).toBeUndefined();
    expect(diff?.after).toBeDefined();
    expect(JSON.stringify(diff)).not.toContain('SECRET_DO_NOT_LEAK');
  });
});
