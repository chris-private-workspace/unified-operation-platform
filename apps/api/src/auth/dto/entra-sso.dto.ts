import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * GET /auth/sso/status — whether this deployment can offer SSO (ADR-0028).
 * Public and side-effect free: the login screen asks before it enables the
 * button. Deliberately a runtime answer — the frontend no longer compiles any
 * Entra configuration into its bundle.
 */
export class SsoStatusDto {
  @ApiProperty({ description: 'True when the api has full ENTRA_* config' })
  enabled!: boolean;
}

/** GET /auth/entra/start — where to send the browser (ADR-0028 step 2). */
export class EntraStartDto {
  @ApiProperty({
    description: 'Entra authorize URL; the browser navigates to it',
    example:
      'https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize?...',
  })
  authorizeUrl!: string;
}

/** POST /auth/entra/callback body — what Entra handed back (ADR-0028 step 5). */
export class EntraCallbackDto {
  @ApiProperty({ description: 'Authorization code from the redirect' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({
    description: 'State from the redirect; must match the cookie',
  })
  @IsString()
  @IsNotEmpty()
  state!: string;
}
