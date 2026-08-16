import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AccessKind, ActorKind, PermissionEntry } from '../permissions';

/**
 * One reachable surface of the derived permission matrix (W28 / ADR-0009
 * Decision 8.5). Usually an HTTP route; since W46 G2 it can also be an agent
 * tool, which is why the fields below read a little wider than "endpoint".
 */
export class PermissionEntryDto implements PermissionEntry {
  @ApiProperty({ example: 'LicenseController' })
  controller!: string;

  @ApiProperty({ example: 'listCatalog' })
  handler!: string;

  @ApiProperty({
    example: 'GET',
    description: 'HTTP method, or `TOOL` for an agent tool (no route exists).',
  })
  method!: string;

  @ApiProperty({
    example: '/license/catalog',
    description: 'Route path, or `agent:<tool>` for an agent tool.',
  })
  path!: string;

  @ApiProperty({
    enum: [
      'roles',
      'public',
      'm2m',
      'authenticated',
      'unguarded',
      'agent-read',
      'agent-propose',
    ],
    description:
      'roles = restricted to the listed app roles · public = no auth · ' +
      'm2m = @Public but an API-key guard protects it · authenticated = any ' +
      'signed-in user (reviewed) · unguarded = any signed-in user, NOT reviewed ' +
      '· agent-read = agent tool with no side-effect · agent-propose = agent ' +
      'tool that only proposes, decided by a person via AgentApprovalController',
  })
  access!: AccessKind;

  @ApiProperty({
    enum: ['user', 'agent'],
    description:
      'user = a signed-in AppUser calling a route · agent = an AgentPrincipal ' +
      'calling a registered tool in-process (ADR-0036 D7). An agent holds no ' +
      'Role, so `roles` on an agent row is empty as a fact, not as a gap.',
  })
  actor!: ActorKind;

  @ApiProperty({
    enum: Role,
    isArray: true,
    description: 'Effective roles — method-level overrides class-level.',
  })
  roles!: Role[];

  @ApiProperty({
    type: [String],
    example: ['IntakeKeyGuard'],
    description:
      'Extra guard classes — what makes an m2m route safe. On an agent-propose ' +
      'row this names the controller a person has to go through instead.',
  })
  guards!: string[];
}
