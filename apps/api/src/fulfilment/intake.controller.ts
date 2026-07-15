import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { IntakeKeyGuard, INTAKE_KEY_HEADER } from './intake-key.guard';
import { IntakeService } from './intake.service';
import { N8nIntakeRequestDto } from './dto/n8n-intake.dto';

/**
 * ADR-0008 Phase 甲 — inbound m2m intake for the n8n onboarding workflow.
 * @Public() bypasses the global JWT/Roles guards (no user token); IntakeKeyGuard
 * enforces the shared X-Intake-Key instead (CONTRACT §2, fail-closed).
 */
@ApiTags('intake')
@Controller('requests')
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

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
}
