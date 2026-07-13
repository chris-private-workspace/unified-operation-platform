import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * PATCH /me/password — a local user changes their own password (AUTH-4c-A).
 * Strength is enforced by validatePassword in the service (source of truth);
 * the DTO only guarantees the fields are present strings.
 */
export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({
    description: 'must satisfy the password policy (ADR-0006 §1)',
  })
  @IsString()
  newPassword!: string;
}

/**
 * POST /admin/users/:id/reset-password — admin sets a new password for a local
 * account (AUTH-4c-A). The user is then forced to change it on next login
 * (mustChangePassword). No current-password check — the admin is trusted.
 */
export class ResetPasswordDto {
  @ApiProperty({
    description: 'must satisfy the password policy (ADR-0006 §1)',
  })
  @IsString()
  newPassword!: string;
}
