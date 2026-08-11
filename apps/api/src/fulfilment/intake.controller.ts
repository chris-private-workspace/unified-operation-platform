import {
  Body,
  Controller,
  Post,
  Type,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { IntakeKeyGuard, INTAKE_KEY_HEADER } from './intake-key.guard';
import { IntakeAdapterService } from './intake-adapter.service';
import { N8nIntakeRequestDto } from './dto/n8n-intake.dto';
import { N8nNativeIntakeDto } from './dto/n8n-native-intake.dto';
import { N8nFlatIntakeDto } from './dto/n8n-flat-intake.dto';

/**
 * ADR-0008 Phase 甲 — inbound m2m intake for the n8n onboarding workflow.
 * @Public() bypasses the global JWT/Roles guards (no user token); IntakeKeyGuard
 * enforces the shared X-Intake-Key instead (CONTRACT §2, fail-closed).
 *
 * Two routes, one writer: `intake` takes the canonical (LOCKED) contract;
 * `intake/n8n` takes n8n's native envelope and resolves it down to the same
 * contract (ADR-0017 D4). Both end up in IntakeService — since CH-021, both go
 * through IntakeAdapterService to get there, so the intake side effects
 * (licence request, notification) are declared in one place instead of per
 * route. This controller dispatches on the contract and nothing else.
 *
 * ── CH-020 / ADR-0024 D2: `intake` now carries TWO contracts ────────────────
 * 🔴 Read this before adding a field anywhere near it. `POST /requests/intake`
 * dispatches on whether the body has a `mode`:
 *
 *   no `mode`   → N8nIntakeRequestDto — the canonical LOCKED contract, unchanged
 *   `mode: 1`   → N8nFlatIntakeDto    — what workflow 1001 actually sends today
 *   anything else → 400, no write
 *
 * What is shared is the URL, not the contract. The alternative — loosening the
 * canonical DTO so 1001's payload validates against it — would have made
 * `serviceNowSysId` optional, and that field is the `@unique` idempotency key
 * every caller's duplicate protection rests on.
 */
@ApiTags('intake')
@Controller('requests')
@ApiExtraModels(N8nIntakeRequestDto, N8nFlatIntakeDto)
export class IntakeController {
  /**
   * The SAME configuration as the global pipe in main.ts, by construction
   * rather than by comment: dispatching by hand means `@Body()` can no longer
   * declare a DTO, so the global pipe has nothing to validate against and this
   * one takes over. Two hand-written rule sets would drift, and the canonical
   * side is the one that must not move.
   */
  private readonly validation = new ValidationPipe({
    whitelist: true,
    transform: true,
  });

  // CH-021: `IntakeService` was injected here directly until the canonical
  // route moved behind the adapter. Removed rather than left in place — an
  // unused writer on a @Public() controller is an invitation.
  constructor(private readonly adapter: IntakeAdapterService) {}

  @Post('intake')
  @Public()
  @UseGuards(IntakeKeyGuard)
  @ApiHeader({
    name: INTAKE_KEY_HEADER,
    description: 'shared m2m intake secret (CONTRACT §2)',
    required: true,
  })
  @ApiOperation({
    summary:
      'n8n onboarding push → build local Request + line-item mirror (canonical, or flat when `mode: 1`)',
  })
  @ApiBody({
    description:
      'canonical contract (no `mode`) or workflow 1001’s flat envelope (`mode: 1`)',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(N8nIntakeRequestDto) },
        { $ref: getSchemaPath(N8nFlatIntakeDto) },
      ],
    },
  })
  @ApiOkResponse({ description: 'the created (or already-existing) request' })
  @ApiBadRequestResponse({
    description:
      'the payload matched neither contract, or `mode` was present with an unsupported value — nothing was written',
  })
  async push(@Body() body: unknown) {
    if (this.isFlat(body)) {
      const dto = await this.validate(body, N8nFlatIntakeDto);
      return this.adapter.intakeFlat(dto);
    }
    const dto = await this.validate(body, N8nIntakeRequestDto);
    // CH-021 A3 — through the adapter, not straight into IntakeService. The
    // canonical contract is unchanged; what the adapter adds is the intake side
    // effects every route shares. See `intakeCanonical`.
    return this.adapter.intakeCanonical(dto);
  }

  /**
   * ADR-0017 D4 — n8n's own payload shape. Same guard / same shared key (OQ-3:
   * one caller, one trust boundary, one secret to rotate). Rejects rather than
   * guesses when a Job Function, licence code or REQ number does not resolve.
   */
  @Post('intake/n8n')
  @Public()
  @UseGuards(IntakeKeyGuard)
  @ApiHeader({
    name: INTAKE_KEY_HEADER,
    description: 'shared m2m intake secret (same key as /requests/intake)',
    required: true,
  })
  @ApiOperation({
    summary:
      'n8n native envelope → resolve Job Function / licence code / REQ number → canonical intake',
  })
  @ApiOkResponse({ description: 'the created (or already-existing) request' })
  @ApiBadRequestResponse({
    description:
      'an identifier could not be resolved to exactly one platform record — nothing was written',
  })
  pushNative(@Body() dto: N8nNativeIntakeDto) {
    return this.adapter.intakeNative(dto);
  }

  /**
   * Presence of the key, not its value: a body carrying `mode: 2` must reach
   * the flat DTO and be REJECTED there, not fall through to the canonical
   * contract where it would be silently stripped by `whitelist` and then fail
   * on unrelated missing fields.
   */
  private isFlat(body: unknown): boolean {
    return typeof body === 'object' && body !== null && 'mode' in body;
  }

  private async validate<T>(body: unknown, metatype: Type<T>): Promise<T> {
    return (await this.validation.transform(body, {
      type: 'body',
      metatype,
    })) as T;
  }
}
