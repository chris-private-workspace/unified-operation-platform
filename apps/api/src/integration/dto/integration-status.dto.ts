import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

/**
 * W30 / ADR-0010 D2 — the response allow-list.
 *
 * Every field is declared here by hand. The mapper builds these objects field
 * by field and NEVER spreads a config or entity object in, so widening what the
 * endpoint exposes is a change somebody has to write down — not something that
 * happens because a new env var got added somewhere.
 *
 * No config value ever appears here, masked or otherwise: a mask still leaks
 * length and trailing characters, and normalising "we return part of a secret"
 * is how the real thing eventually slips out.
 */
export class ProbeResultDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty({
    description: 'safe for display — never the vendor error text',
  })
  message!: string;
  @ApiProperty() at!: Date;
}

// ── W34 / ADR-0013 — connector config (Model C) ────────────────
// The allow-list extends to config: non-secret VALUES may appear (editable), but
// a secret only ever reports configured/unset — never its value (D2 preserved).

export class ConnectorFieldDto {
  @ApiProperty() column!: string;
  @ApiProperty() label!: string;
  @ApiProperty({
    nullable: true,
    description: 'non-secret value — a secret value never appears here',
  })
  value!: string | null;
  @ApiProperty({
    enum: ['db', 'env', 'unset'],
    description:
      'where the effective value came from (DB override / env / none)',
  })
  source!: string;
}

export class ConnectorSecretDto {
  @ApiProperty() envKey!: string;
  @ApiProperty() label!: string;
  @ApiProperty({
    description: 'whether env holds a value — NEVER the value itself (D2)',
  })
  configured!: boolean;
}

export class ConnectorConfigDto {
  @ApiProperty({ type: [ConnectorFieldDto] })
  editable!: ConnectorFieldDto[];
  @ApiProperty({ type: [ConnectorSecretDto] })
  secrets!: ConnectorSecretDto[];
}

export class ConnectorStatusDto {
  @ApiProperty({
    enum: ['graph', 'servicenow', 'n8n-outbound', 'n8n-inbound'],
  })
  key!: string;

  @ApiProperty() label!: string;

  @ApiProperty({
    enum: ['required', 'active', 'inactive'],
    description:
      'deployment shape, not health: required = config is getOrThrow-ed at boot, so the app could not be running without it',
  })
  state!: string;

  @ApiProperty({
    nullable: true,
    description:
      'derived from domain data — when this connector last demonstrably worked, not when it was last checked',
  })
  lastSuccessAt!: Date | null;

  @ApiProperty({
    nullable: true,
    description: 'why lastSuccessAt can never be derived for this connector',
  })
  lastSuccessNote!: string | null;

  @ApiProperty({
    type: ProbeResultDto,
    nullable: true,
    description:
      'last Test connection result — in-process only, cleared on restart',
  })
  lastProbe!: ProbeResultDto | null;

  @ApiProperty({
    description:
      'false when this connector must never be probed (see probeNote)',
  })
  probeable!: boolean;

  @ApiProperty({ nullable: true })
  probeNote!: string | null;

  @ApiProperty({
    type: ConnectorConfigDto,
    description:
      'editable non-secret config (value + source) and secret configured-status — never a secret value (D2 / ADR-0013)',
  })
  config!: ConnectorConfigDto;
}

/**
 * PATCH body (W34 / ADR-0013). `values` maps a non-secret field column to its
 * new value; null / empty clears the override so it falls back to env. Only
 * `values` is whitelisted by the global ValidationPipe — the service rejects any
 * key that is not an editable field, so a secret column can never be written.
 */
export class UpdateConnectorConfigDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
    description: 'non-secret field column → new value (null / empty clears it)',
  })
  @IsObject()
  values!: Record<string, string | null>;
}
