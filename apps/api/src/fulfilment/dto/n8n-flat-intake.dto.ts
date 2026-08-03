import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * CH-020 / ADR-0024 D2 — the FLAT envelope n8n workflow 1001 actually POSTs to
 * `/requests/intake` today.
 *
 * 🔴 This is a SECOND contract on an existing route, not a widening of the
 * first one. `N8nIntakeRequestDto` is untouched: a body with no `mode` binds to
 * it and keeps every guarantee it has, including `serviceNowSysId` being
 * required (it is the `@unique` idempotency key — making it optional to fit
 * this payload would have removed the duplicate protection for every caller).
 * What the two share is the URL, not the contract.
 *
 * The shape comes from 1001's `WF1 - Prepare UOP Intake` / `Attach Task Id`
 * nodes rather than from prose: n8n moved from a nested payload to this one on
 * 26 Jul 2026 and nobody on the platform side noticed, which is exactly why the
 * source of truth for it is the workflow JSON (W39's lesson).
 */
export class N8nFlatIntakeDto {
  /**
   * The discriminator the controller dispatches on. Only `1` is accepted —
   * an unknown mode is a 400 rather than a guess, because guessing here means
   * running an onboarding under a contract n8n did not intend.
   *
   * No `@Type(() => Number)`: the global pipe runs without implicit conversion,
   * so `"1"` stays a string and fails here. That is deliberate — a payload that
   * cannot say which contract it means is not one to interpret.
   */
  @ApiProperty({ enum: [1], description: 'flat contract discriminator (1001)' })
  @IsIn([1])
  mode!: number;

  @ApiProperty({ description: 'the new user being onboarded (target UPN)' })
  @IsString()
  @MinLength(1)
  targetUpn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetDisplayName?: string;

  /** n8n resolves the Job Function itself on this path, so no mapping here. */
  @ApiProperty({ description: 'OpCo code, e.g. "RHK" (Opco.code)' })
  @IsString()
  @MinLength(1)
  opcoCode!: string;

  /**
   * `@IsString`, not `@IsEmail`: this is optional metadata off an Outlook
   * trigger, and a malformed sender must not fail a whole onboarding. The
   * adapter drops it unless it looks like an address — the same treatment the
   * native path already gives it.
   */
  @ApiPropertyOptional({
    description: 'requester address; dropped if malformed',
  })
  @IsOptional()
  @IsString()
  requesterEmail?: string;

  /**
   * The REQ NUMBER (e.g. REQ0044038), not its sysId. The platform resolves the
   * sysId itself (ADR-0024 D3) so the idempotency key stays what it has always
   * been.
   */
  @ApiProperty({ description: 'ServiceNow REQ number, e.g. REQ0044038' })
  @IsString()
  @MinLength(1)
  requestId!: string;

  /**
   * The Windows Domain Account catalog task 1001 wants closed once the licence
   * is assigned. Optional: 1001's own resolver can come back empty, and a
   * request that arrives without it is still a request worth creating — it just
   * falls back to today's close paths (ADR-0024 D6).
   */
  @ApiPropertyOptional({ description: 'sc_task sysId to close after assign' })
  @IsOptional()
  @IsString()
  serviceNowTaskSysId?: string;

  @ApiPropertyOptional({ description: 'e.g. SCTASK0071802' })
  @IsOptional()
  @IsString()
  serviceNowTaskNumber?: string;

  /**
   * Accepted so `whitelist: true` does not reject the payload, and deliberately
   * NOT persisted (ADR-0024 OQ-2): `'1001-immediate'` is n8n's own tracking
   * label, and the platform already has the audit trail + REQ number for trace.
   */
  @ApiPropertyOptional({
    description: 'n8n internal label; accepted, not stored',
  })
  @IsOptional()
  @IsString()
  source?: string;
}
