import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Header carrying the shared m2m intake secret (CONTRACT §2). */
export const INTAKE_KEY_HEADER = 'x-intake-key';

/**
 * Fail-closed m2m guard for POST /requests/intake (n8n → platform).
 * The route is @Public() (no user JWT); this checks a static shared secret
 * instead. Missing / wrong key → 401 and nothing runs. The key comes from env
 * only (H4) and is only ever compared — never logged.
 */
@Injectable()
export class IntakeKeyGuard implements CanActivate {
  private readonly expectedKey: string;

  constructor(config: ConfigService) {
    // getOrThrow → boot fails fast if the secret is unset (no silent open door).
    this.expectedKey = config.getOrThrow<string>('INTAKE_API_KEY');
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const provided = req.headers?.[INTAKE_KEY_HEADER];
    if (typeof provided !== 'string' || provided !== this.expectedKey) {
      throw new UnauthorizedException('Invalid or missing intake key');
    }
    return true;
  }
}
