import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
import { LoginDto, SessionResponseDto } from './dto/login.dto';
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from './cookie';

/**
 * Local password session (ADR-0005 / ADR-0006 §7). All three routes are @Public
 * — they run before/without the JwtAuthGuard and manage the session cookies
 * themselves. The access + refresh tokens are set as httpOnly cookies; the body
 * only ever carries the identity. Entra SSO users authenticate via MSAL, not here.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
}
