import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * One Operating Company (CH-004). code is the stable business key (unique,
 * referenced by ServiceNow / n8n) — immutable after create. company + costCenter
 * are the real data-model split of the old "COMPANY/CC" label; the prototype's
 * `region` field has no schema home, so the admin surface edits the real columns.
 */
export class OpcoDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'RAPO/IT' }) code!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ example: 'RAPO' }) company!: string;
  @ApiProperty({ nullable: true, required: false, example: 'IT' })
  costCenter!: string | null;
  @ApiProperty() active!: boolean;
}

/**
 * POST /admin/opcos — create an OpCo. code must be unique (409 on clash);
 * costCenter "" → null in the service. active defaults to true.
 */
export class CreateOpcoDto {
  @ApiProperty({ example: 'RAPO/IT', description: 'unique business key' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'RAPO — IT' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @ApiProperty({ example: 'RAPO' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  company!: string;

  @ApiProperty({ required: false, nullable: true, example: 'IT' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  costCenter?: string | null;

  @ApiProperty({ required: false, description: 'defaults to true' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * PATCH /admin/opcos/:id — edit an OpCo. code is NOT here: it is immutable after
 * create (D3), and the global whitelist ValidationPipe strips any code sent.
 * All fields optional — omit to leave unchanged; costCenter "" → null.
 */
export class UpdateOpcoDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  company?: string;

  @ApiProperty({ required: false, nullable: true, description: '"" clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  costCenter?: string | null;

  @ApiProperty({ required: false, description: 'false = deactivate' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
