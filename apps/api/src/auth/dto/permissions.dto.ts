import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AccessKind, PermissionEntry } from '../permissions';

/** One route of the derived permission matrix (W28 / ADR-0009 Decision 8.5). */
export class PermissionEntryDto implements PermissionEntry {
  @ApiProperty({ example: 'LicenseController' })
  controller!: string;

  @ApiProperty({ example: 'listCatalog' })
  handler!: string;

  @ApiProperty({ example: 'GET' })
  method!: string;

  @ApiProperty({ example: '/license/catalog' })
  path!: string;

  @ApiProperty({
    enum: ['roles', 'public', 'm2m', 'authenticated', 'unguarded'],
    description:
      'roles = restricted to the listed app roles · public = no auth · ' +
      'm2m = @Public but an API-key guard protects it · authenticated = any ' +
      'signed-in user (reviewed) · unguarded = any signed-in user, NOT reviewed',
  })
  access!: AccessKind;

  @ApiProperty({
    enum: Role,
    isArray: true,
    description: 'Effective roles — method-level overrides class-level.',
  })
  roles!: Role[];

  @ApiProperty({
    type: [String],
    example: ['IntakeKeyGuard'],
    description: 'Extra guard classes — what makes an m2m route safe.',
  })
  guards!: string[];
}
