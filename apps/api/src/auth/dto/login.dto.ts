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

/** POST /auth/login response — the local access token + the signed-in identity. */
export class LoginResultDto {
  @ApiProperty({ description: 'locally-signed HS256 JWT (Bearer)' })
  accessToken!: string;

  @ApiProperty({ description: 'token lifetime in seconds' })
  expiresIn!: number;

  @ApiProperty({ type: MeDto }) user!: MeDto;
}
