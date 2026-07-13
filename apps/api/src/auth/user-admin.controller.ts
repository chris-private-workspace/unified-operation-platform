import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from './roles.decorator';
import { CurrentUser, type AuthUser } from './current-user.decorator';
import { UserAdminService } from './user-admin.service';
import {
  AdminOpcoDto,
  AdminUserDto,
  CreateUserDto,
  UpdateUserDto,
} from './dto/user-admin.dto';
import { ResetPasswordDto } from './dto/password.dto';

/**
 * Admin user console (ADR-0005 §6 / AUTH-4b). ADMIN-only (RolesGuard). Manages
 * local accounts + role/scope for both providers; the frontend Users & roles tab
 * consumes these and degrades gracefully to a restricted state on 403 (non-admin
 * callers), so it does not depend on frontend real-role gating (AUTH-3b).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class UserAdminController {
  constructor(private readonly users: UserAdminService) {}

  @Get('users')
  @ApiOkResponse({ type: [AdminUserDto] })
  listUsers(): Promise<AdminUserDto[]> {
    return this.users.list();
  }

  @Post('users')
  @ApiOkResponse({ type: AdminUserDto })
  createUser(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateUserDto,
  ): Promise<AdminUserDto> {
    return this.users.create(actor, dto);
  }

  @Patch('users/:id')
  @ApiOkResponse({ type: AdminUserDto })
  updateUser(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<AdminUserDto> {
    return this.users.update(actor, id, dto);
  }

  @Post('users/:id/reset-password')
  @HttpCode(204)
  resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    return this.users.resetPassword(actor, id, dto);
  }

  @Get('opcos')
  @ApiOkResponse({ type: [AdminOpcoDto] })
  listOpcos(): Promise<AdminOpcoDto[]> {
    return this.users.listOpcos();
  }
}
