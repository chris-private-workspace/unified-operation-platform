import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { IntakeKeyGuard, INTAKE_KEY_HEADER } from './intake-key.guard';
import { IntakeService } from './intake.service';
import { IntakeAdapterService } from './intake-adapter.service';
import { N8nIntakeRequestDto } from './dto/n8n-intake.dto';
import { N8nNativeIntakeDto } from './dto/n8n-native-intake.dto';

/**
 * ADR-0008 Phase 甲 — inbound m2m intake for the n8n onboarding workflow.
 * @Public() bypasses the global JWT/Roles guards (no user token); IntakeKeyGuard
 * enforces the shared X-Intake-Key instead (CONTRACT §2, fail-closed).
 *
 * Two routes, one writer: `intake` takes the canonical (LOCKED) contract;
 * `intake/n8n` takes n8n's native envelope and resolves it down to the same
 * contract (ADR-0017 D4). Both end up in IntakeService.
 */
@ApiTags('intake')
@Controller('requests')
export class IntakeController {
  constructor(
    private readonly intake: IntakeService,
    private readonly adapter: IntakeAdapterService,
  ) {}

  @Post('intake')
  @Public()
  @UseGuards(IntakeKeyGuard)
  @ApiHeader({
    name: INTAKE_KEY_HEADER,
    description: 'shared m2m intake secret (CONTRACT §2)',
    required: true,
  })
  @ApiOperation({
    summary: 'n8n onboarding push → build local Request + line-item mirror',
  })
  @ApiOkResponse({ description: 'the created (or already-existing) request' })
  push(@Body() dto: N8nIntakeRequestDto) {
    return this.intake.intake(dto);
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
}
