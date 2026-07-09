import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { LineItemStage } from '@prisma/client';

/** Body for PATCH .../line-items/:lineItemId/stage — target stage to advance to. */
export class AdvanceStageDto {
  @ApiProperty({
    enum: LineItemStage,
    description: 'target stage (ASSIGNED is rejected here — handled by D-2)',
  })
  @IsEnum(LineItemStage)
  toStage!: LineItemStage;
}
