import { Body, Controller, Get, HttpCode, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from './current-user.decorator';
import { MeDto } from './dto/me.dto';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/password.dto';

/**
 * GET /me — the signed-in operator's identity + OpCo scope (AUTH-3a). No @Roles,
 * so any authenticated role may call it. The frontend (AUTH-3b) consumes this for
 * the real role display and the "My queue" filter (both previously deferred here).
 * PATCH /me/password lets a local user change their own password (AUTH-4c-A).
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Patch('password')
  @HttpCode(204)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.auth.changePassword(user, dto);
  }

  @Get()
  @ApiOkResponse({ type: MeDto })
  async me(@CurrentUser() user: AuthUser): Promise<MeDto> {
    const opcoScope = user.opcoScopeId
      ? await this.prisma.opco.findUnique({
          where: { id: user.opcoScopeId },
          select: { code: true, displayName: true },
        })
      : null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      opcoScopeId: user.opcoScopeId,
      opcoScope,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
