import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
import { LoginDto, LoginResultDto } from './dto/login.dto';

/**
 * Local password login (ADR-0005 / AUTH-4a). @Public — the login route itself
 * must skip the JwtAuthGuard. Entra SSO users authenticate via MSAL, not here.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOkResponse({ type: LoginResultDto })
  login(@Body() dto: LoginDto): Promise<LoginResultDto> {
    return this.auth.login(dto);
  }
}
