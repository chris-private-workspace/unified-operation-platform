import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { MeDto } from './me.dto';

/** POST /auth/login body — local-account credentials (ADR-0005). */
export class LoginDto {
  @ApiProperty({ example: 'admin@uop.local' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}

/**
 * POST /auth/login & POST /auth/refresh response — only the signed-in identity.
 * The access + refresh tokens are delivered as httpOnly cookies (ADR-0006 §7),
 * so they never reach page JS.
 */
export class SessionResponseDto {
  @ApiProperty({ type: MeDto }) user!: MeDto;
}
