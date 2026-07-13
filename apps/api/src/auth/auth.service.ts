import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LocalJwtService } from './local-jwt.service';
import { LoginDto, LoginResultDto } from './dto/login.dto';

/**
 * Local password authentication (ADR-0005 / AUTH-4a). Verifies a local-provider
 * AppUser's argon2id hash and issues a locally-signed JWT. H4: password / hash /
 * token are never logged; every failure returns the same generic 401 so the
 * response never reveals whether an account exists.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly localJwt: LocalJwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResultDto> {
    const invalid = () =>
      new UnauthorizedException('Invalid email or password');

    const user = await this.prisma.appUser.findUnique({
      where: { email: dto.email },
    });
    // Only active local-provider accounts with a hash can log in this way.
    if (
      !user ||
      !user.active ||
      user.authProvider !== 'local' ||
      !user.passwordHash
    ) {
      throw invalid();
    }

    let ok = false;
    try {
      ok = await argon2.verify(user.passwordHash, dto.password);
    } catch {
      ok = false; // malformed hash etc. → failure, never leak the reason
    }
    if (!ok) throw invalid();

    await this.prisma.appUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { accessToken, expiresIn } = this.localJwt.sign({
      id: user.id,
      role: user.role,
    });
    // H4: log the outcome only — never email / password / token.
    this.logger.log(`Local login ok: userId=${user.id} role=${user.role}`);

    const opcoScope = user.opcoScopeId
      ? await this.prisma.opco.findUnique({
          where: { id: user.opcoScopeId },
          select: { code: true, displayName: true },
        })
      : null;

    return {
      accessToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        opcoScopeId: user.opcoScopeId,
        opcoScope,
      },
    };
  }
}
