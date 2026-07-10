import { ForbiddenException } from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import { assertOpcoScope, scopeWhere } from './opco-scope';

const user = (opcoScopeId: string | null) =>
  ({ id: 'u', opcoScopeId }) as unknown as AppUser;

describe('opco-scope (AUTH-3a)', () => {
  describe('scopeWhere', () => {
    it('null scope (REGIONAL / ADMIN) → {} (no restriction)', () => {
      expect(scopeWhere(user(null))).toEqual({});
    });
    it('OPCO_IT → { opcoId } of its own OpCo', () => {
      expect(scopeWhere(user('opcoA'))).toEqual({ opcoId: 'opcoA' });
    });
  });

  describe('assertOpcoScope', () => {
    it('null scope may act on any OpCo', () => {
      expect(() => assertOpcoScope(user(null), 'opcoA')).not.toThrow();
      expect(() => assertOpcoScope(user(null), 'opcoB')).not.toThrow();
    });
    it('OPCO_IT may act within its own OpCo', () => {
      expect(() => assertOpcoScope(user('opcoA'), 'opcoA')).not.toThrow();
    });
    it('OPCO_IT hitting another OpCo → 403 (fail-closed)', () => {
      expect(() => assertOpcoScope(user('opcoA'), 'opcoB')).toThrow(
        ForbiddenException,
      );
    });
  });
});
