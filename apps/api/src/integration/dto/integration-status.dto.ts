import { ApiProperty } from '@nestjs/swagger';

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
}
