import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MeOpcoScopeDto } from './me.dto';

// Local-account initial password floor. Real strength policy (length, classes,
// breach check) + force-change / reset / lockout are AUTH-4c (ADR-0005 §6).
const MIN_PASSWORD_LENGTH = 8;

/**
 * A user row for the admin console (AUTH-4b). Covers both providers (local +
 * Entra SSO). NEVER includes passwordHash — the mapper strips it (H4).
 */
export class AdminUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty({ nullable: true, required: false })
  opcoScopeId!: string | null;
  @ApiProperty({ type: MeOpcoScopeDto, nullable: true, required: false })
  opcoScope!: MeOpcoScopeDto | null;
  @ApiProperty({ enum: ['entra', 'local'] }) authProvider!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty({ nullable: true, required: false })
  lastLoginAt!: Date | null;
  @ApiProperty({
    description: 'local account still on an admin-set password (AUTH-4c-A)',
  })
  mustChangePassword!: boolean;
}

/**
 * POST /admin/users — create a local-provider account. role↔opcoScope
 * consistency (OPCO_IT requires a scope; ADMIN / REGIONAL must not have one) is
 * enforced in the service, not here, because it is a cross-field rule.
 */
export class CreateUserDto {
  @ApiProperty({ example: 'opco.it.rth@rapo.com.hk' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'RTH IT' })
  @IsString()
  @MinLength(1)
  displayName!: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'required for OPCO_IT; ignored (forced null) for ADMIN / REGIONAL',
  })
  @IsOptional()
  @ValidateIf((o) => o.opcoScopeId !== null)
  @IsString()
  opcoScopeId?: string | null;

  @ApiProperty({ description: `initial password (min ${MIN_PASSWORD_LENGTH})` })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  initialPassword!: string;
}

/**
 * PATCH /admin/users/:id — change role / OpCo scope / active. Applies to both
 * providers (the Entra guard upsert never overwrites role/scope, so admin-set
 * values survive re-login). Password change / reset is AUTH-4c, not here.
 */
export class UpdateUserDto {
  @ApiProperty({ enum: Role, required: false })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'set for OPCO_IT; null to clear',
  })
  @IsOptional()
  @ValidateIf((o) => o.opcoScopeId !== null)
  @IsString()
  opcoScopeId?: string | null;

  @ApiProperty({
    required: false,
    description: 'false = deactivate (never deleted)',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
