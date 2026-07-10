import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

/** The OpCo an OPCO_IT user is scoped to (null for REGIONAL / ADMIN). */
export class MeOpcoScopeDto {
  @ApiProperty({ example: 'RHK' }) code!: string;
  @ApiProperty() displayName!: string;
}

/** GET /me — the authenticated operator's identity + access scope (AUTH-3a). */
export class MeDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty({
    nullable: true,
    required: false,
    description: 'null = all OpCos (REGIONAL / ADMIN); set = OPCO_IT own OpCo',
  })
  opcoScopeId!: string | null;
  @ApiProperty({ type: MeOpcoScopeDto, nullable: true, required: false })
  opcoScope!: MeOpcoScopeDto | null;
}
