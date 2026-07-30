import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * POST /auth/forgot-password (AUTH-4c-C / ADR-0019 D8 #3).
 *
 * `@IsEmail` is shape validation only. It must NOT become an enumeration
 * channel: a well-formed address that belongs to nobody still gets the same 204
 * as one that exists (D8 #4). The 400 this can produce is for input that is not
 * an address at all, which reveals nothing about who has an account.
 *
 * Named separately from the existing `ResetPasswordDto` (admin sets someone
 * else's password) — two different flows, two different authorities.
 */
export class ForgotPasswordDto {
  @ApiProperty({ example: 'ops@example.com' })
  @IsEmail()
  email!: string;
}

/** POST /auth/reset-password — spend a token issued by the flow above. */
export class ResetWithTokenDto {
  @ApiProperty({ description: 'the opaque token from the reset link' })
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty({
    description: 'must satisfy the password policy (ADR-0006 §1)',
  })
  @IsString()
  newPassword!: string;
}
