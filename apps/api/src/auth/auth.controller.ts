import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
import { EntraSsoService } from './entra-sso.service';
import {
  PasswordResetService,
  RESET_TTL_MINUTES,
} from './password-reset.service';
import { NotificationDispatchService } from '../fulfilment/notification-dispatch.service';
import { LoginDto, SessionResponseDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetWithTokenDto } from './dto/password-reset.dto';
import {
  EntraCallbackDto,
  EntraStartDto,
  SsoStatusDto,
} from './dto/entra-sso.dto';
import {
  setAuthCookies,
  clearAuthCookies,
  setSsoStateCookie,
  clearSsoStateCookie,
  REFRESH_COOKIE,
  SSO_STATE_COOKIE,
} from './cookie';

/**
 * Session establishment for BOTH providers (ADR-0005 / ADR-0006 §7 / ADR-0028).
 * Every route here is @Public — they run before/without the JwtAuthGuard and
 * manage the session cookies themselves. The access + refresh tokens are set as
 * httpOnly cookies; the body only ever carries the identity.
 *
 * Break-glass password login and Entra SSO differ only in how the user proves
 * who they are — both converge on auth.grantSession() + setAuthCookies().
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly entraSso: EntraSsoService,
    private readonly passwordReset: PasswordResetService,
    private readonly notifications: NotificationDispatchService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOkResponse({ type: SessionResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseDto> {
    const grant = await this.auth.login(dto);
    setAuthCookies(res, grant.accessToken, grant.refresh.rawToken);
    return { user: grant.user };
  }

  /**
   * Can this deployment offer SSO at all (ADR-0028)? The login screen asks
   * before it enables the button. Side-effect free on purpose — it is called on
   * every page load, and starting a sign-in attempt (which mints state) is a
   * different thing from asking whether one is possible.
   */
  @Get('sso/status')
  @Public()
  @ApiOkResponse({ type: SsoStatusDto })
  ssoStatus(): SsoStatusDto {
    return { enabled: this.entraSso.enabled };
  }

  /**
   * Step 1-2 of the SSO handshake (ADR-0028): mint state + PKCE, park them in a
   * short-lived httpOnly cookie, and hand back the Entra URL for the browser to
   * navigate to. Returning the URL rather than issuing a 302 keeps this a plain
   * JSON API — the frontend's fetch layer never has to reason about redirects.
   */
  @Get('entra/start')
  @Public()
  @ApiOkResponse({ type: EntraStartDto })
  entraStart(@Res({ passthrough: true }) res: Response): EntraStartDto {
    const { authorizeUrl, stateCookieValue } =
      this.entraSso.createAuthorizationRequest();
    setSsoStateCookie(res, stateCookieValue);
    return { authorizeUrl };
  }

  /**
   * Step 5-6 (ADR-0028): the browser hands back what Entra gave it, and the api
   * — holding the client secret — does the exchange, verifies the id_token, and
   * issues the platform's own session. From here on an SSO user is
   * indistinguishable from a break-glass one.
   */
  @Post('entra/callback')
  @Public()
  @HttpCode(200)
  @ApiOkResponse({ type: SessionResponseDto })
  async entraCallback(
    @Body() dto: EntraCallbackDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseDto> {
    const stateCookie = req.cookies?.[SSO_STATE_COOKIE] as string | undefined;
    // Cleared BEFORE the exchange, unconditionally: one attempt, one shot. A
    // failure must not leave a live verifier sitting in the browser.
    clearSsoStateCookie(res);
    const user = await this.entraSso.completeLogin(
      dto.code,
      dto.state,
      stateCookie,
    );
    const grant = await this.auth.grantSession(user);
    setAuthCookies(res, grant.accessToken, grant.refresh.rawToken);
    return { user: grant.user };
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiOkResponse({ type: SessionResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseDto> {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) {
      clearAuthCookies(res);
      throw new UnauthorizedException('No refresh token');
    }
    try {
      const grant = await this.auth.refreshSession(raw);
      setAuthCookies(res, grant.accessToken, grant.refresh.rawToken);
      return { user: grant.user };
    } catch (err) {
      // Invalid / rotated / expired refresh → clear the cookies so the client
      // falls back to the login screen (H4: never leak the reason).
      clearAuthCookies(res);
      throw err;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  @ApiNoContentResponse()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.auth.logout(raw); // idempotent — safe even with no / stale cookie
    clearAuthCookies(res);
  }

  /**
   * Ask for a reset mail (AUTH-4c-C / ADR-0019 D8 #3-#4).
   *
   * 🔴 ALWAYS 204. Unknown address, SSO account, deactivated account, or inside
   * the cooldown — every one of them looks identical from out here. That is the
   * whole enumeration defence, and it lives at this edge precisely so the
   * service underneath can stay honest about which case it was (it records the
   * outcome in the audit trail, which is where operations reads it).
   */
  @Post('forgot-password')
  @Public()
  @HttpCode(204)
  @ApiNoContentResponse()
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    // OQ-1: `get`, never `getOrThrow`. Email is optional (ADR-0019 D4) and a
    // convenience feature must not be able to stop the platform from booting —
    // BUG-008 has just finished demonstrating what an api that will not start
    // costs.
    //
    // 🔴 Checked BEFORE issue(), deliberately. When this is unset the feature is
    // misconfigured, and issuing anyway costs twice: it burns the caller's
    // 5-minute cooldown on a mail that cannot go out, and the audit row would
    // read `reason: 'issued'` while nothing was ever sent. An audit trail that
    // answers "why did my user never get the mail" with "we sent it" is worse
    // than one that stays quiet, because ADR-0009 makes it the one place
    // operations is meant to trust. A configuration fault belongs to ops — this
    // logger.error, which monitoring reads — not to the business audit trail.
    const baseUrl = this.config.get<string>('APP_BASE_URL');
    if (!baseUrl) {
      this.logger.error(
        'APP_BASE_URL is not set — password reset mail cannot be sent',
      );
      return;
    }

    const issued = await this.passwordReset.issue(dto.email);
    if (!issued) return;

    // OQ-4: fragment, not query string. Never reaches the server, so the token
    // stays out of the nginx access log in front of this app and out of Referer.
    const resetUrl = `${baseUrl.replace(/\/+$/, '')}/reset-password#token=${
      issued.rawToken
    }`;

    // OQ-2: fire-and-forget. Awaiting would make an existing account measurably
    // slower to answer than an unknown one, which hands back by timing exactly
    // what the uniform 204 above is protecting.
    //
    // The `.catch` is not distrust of the dispatcher — its contract says it
    // never throws, and its tests say so too. It is that the failure mode here
    // is an unhandled rejection, and BUG-002 already proved that kills the Nest
    // process. One line is a cheap premium against losing the whole API.
    void this.notifications
      .send({
        to: issued.email,
        template: 'password-reset',
        params: {
          displayName: issued.displayName,
          resetUrl,
          ttlMinutes: String(RESET_TTL_MINUTES),
        },
      })
      .catch(() => undefined);
  }

  /**
   * Spend a reset token (D8 #3). Unlike the request above this MAY fail: the
   * caller already holds a token, so enumeration is no longer the concern, and
   * "your link has expired" is genuinely useful. The service still returns one
   * single message for unknown / expired / already-spent.
   *
   * Cookies are cleared because every refresh token was just revoked; leaving a
   * stale access token in the browser would give up to 15 minutes of a session
   * the user believes they have just terminated.
   */
  @Post('reset-password')
  @Public()
  @HttpCode(204)
  @ApiNoContentResponse()
  async resetPassword(
    @Body() dto: ResetWithTokenDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.passwordReset.consume(dto.token, dto.newPassword);
    clearAuthCookies(res);
  }
}
