import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from './current-user.decorator';
import { MeDto } from './dto/me.dto';

/**
 * GET /me — the signed-in operator's identity + OpCo scope (AUTH-3a). No @Roles,
 * so any authenticated role may call it. The frontend (AUTH-3b) consumes this for
 * the real role display and the "My queue" filter (both previously deferred here).
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

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
    };
  }
}
