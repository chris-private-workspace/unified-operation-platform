import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { IntakeKeyGuard, INTAKE_KEY_HEADER } from './intake-key.guard';

const KEY = 'secret-intake-key';

// ConfigService stub whose getOrThrow returns the configured key.
const config = {
  getOrThrow: jest.fn().mockReturnValue(KEY),
} as unknown as ConfigService;

// Minimal ExecutionContext exposing a request with the given headers.
const ctxWith = (headers: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe('IntakeKeyGuard', () => {
  let guard: IntakeKeyGuard;

  beforeEach(() => {
    guard = new IntakeKeyGuard(config);
  });

  it('passes when the key matches', () => {
    expect(guard.canActivate(ctxWith({ [INTAKE_KEY_HEADER]: KEY }))).toBe(true);
  });

  it('throws 401 when the key header is missing (fail-closed)', () => {
    expect(() => guard.canActivate(ctxWith({}))).toThrow(UnauthorizedException);
  });

  it('throws 401 when the key is wrong', () => {
    expect(() =>
      guard.canActivate(ctxWith({ [INTAKE_KEY_HEADER]: 'wrong' })),
    ).toThrow(UnauthorizedException);
  });

  it('throws 401 when the key is a non-string (e.g. duplicated header array)', () => {
    expect(() =>
      guard.canActivate(ctxWith({ [INTAKE_KEY_HEADER]: [KEY] })),
    ).toThrow(UnauthorizedException);
  });
});
