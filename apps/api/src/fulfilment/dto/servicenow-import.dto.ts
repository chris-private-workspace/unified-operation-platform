import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * CH-013 / ADR-0021 — the user-authenticated import surface.
 *
 * Deliberately NOT the canonical intake DTO: that one is the LOCKED n8n
 * contract (ADR-0008 D3) and stays untouched. This is a separate route with a
 * separate shape, exactly as ADR-0017 D4 did for the n8n envelope.
 */

// ── request bodies ────────────────────────────────────────────────

export class ServiceNowLookupQueryDto {
  @ApiProperty({ description: 'e.g. REQ0044038' })
  @IsString()
  @MinLength(1)
  req!: string;
}

export class ImportRitmSelectionDto {
  @ApiProperty({
    description: 'e.g. RITM0047331 — must belong to the REQ below',
  })
  @IsString()
  @MinLength(1)
  ritmNumber!: string;

  /**
   * 🔴 GUID, not a name and not the catalogue row id.
   *
   * The canonical DTO takes `skuId` and `IntakeService` resolves it against
   * SkuCatalog, so passing the GUID straight through means there is exactly one
   * place that decides whether a SKU exists. CLAUDE.md §13: SKU is always the
   * GUID — never an Excel label, never a remembered part number.
   */
  @ApiProperty({
    description: 'SkuCatalog.skuId (GUID) chosen by the operator',
  })
  @IsString()
  @MinLength(1)
  skuId!: string;

  @ApiPropertyOptional({ description: 'seats; defaults to 1', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class ImportFromServiceNowDto {
  @ApiProperty({ description: 'e.g. REQ0044038' })
  @IsString()
  @MinLength(1)
  reqNumber!: string;

  /**
   * The operator picks the OpCo.
   *
   * The n8n route derives it from a Job Function, but that only works because
   * n8n sends one. A ServiceNow request does not carry the platform's notion of
   * OpCo, and the ops script has always had the operator supply it (its
   * `--job-function` defaults to a hardcoded value) — so "derive it" would be a
   * dressed-up way of asking the same question. Ask it plainly instead.
   */
  @ApiProperty({ description: 'Opco.code, e.g. "RHK"' })
  @IsString()
  @MinLength(1)
  opcoCode!: string;

  @ApiProperty({ description: 'the user being onboarded (target UPN)' })
  @IsString()
  @MinLength(1)
  targetUpn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetDisplayName?: string;

  /**
   * 🔴 No `ritmSysId` here, on purpose (ADR-0021 D5). The server re-reads the
   * REQ and matches by number; a body that could name a sys_id would let a
   * caller mirror an unrelated ServiceNow ticket.
   */
  @ApiProperty({
    type: [ImportRitmSelectionDto],
    description: 'RITMs to import (≥1)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportRitmSelectionDto)
  items!: ImportRitmSelectionDto[];
}

// ── response views ────────────────────────────────────────────────
//
// Hand-written rather than returning what ServiceNowLookupService produces: its
// `activeTasks` are RAW instance records (see that type's own warning). Every
// field a client sees is picked here, by name.

export class LookupTaskView {
  @ApiProperty({ description: 'e.g. SCTASK0071802' })
  number!: string;

  @ApiProperty({ description: 'ServiceNow state value, verbatim' })
  state!: string;
}

export class LookupRitmView {
  @ApiProperty()
  number!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ description: 'active sc_task rows under this RITM' })
  activeTaskCount!: number;

  @ApiProperty({
    description:
      'false when activeTaskCount ≠ 1 — the platform could not close it later (ADR-0018 D3)',
  })
  importable!: boolean;

  @ApiProperty({ nullable: true, type: String })
  blockedReason!: string | null;

  @ApiProperty({ type: [LookupTaskView] })
  tasks!: LookupTaskView[];
}

export class LookupRequestView {
  @ApiProperty()
  number!: string;

  @ApiProperty()
  shortDescription!: string;

  @ApiProperty()
  openedAt!: string;

  @ApiProperty({ type: [LookupRitmView] })
  items!: LookupRitmView[];
}
