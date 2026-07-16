import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { OpcoService } from './opco.service';
import { CreateOpcoDto, OpcoDto, UpdateOpcoDto } from './dto/opco.dto';

/**
 * OpCo management console (CH-004). ADMIN + REGIONAL (D1) — platform-level
 * curation of Operating Companies. GET relocated here from the user-admin
 * console (its create-user scope selector still hits GET /admin/opcos, path
 * unchanged) so REGIONAL can also read the rich list to drive the panel.
 * Deactivate (active=false) replaces deletion — OpCo is referenced by ledger /
 * requests / scoped users, so we never hard-delete.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.REGIONAL)
@Controller('admin/opcos')
export class OpcoAdminController {
  constructor(private readonly opcos: OpcoService) {}

  @Get()
  @ApiOkResponse({ type: [OpcoDto] })
  list(@Query('includeInactive') includeInactive?: string): Promise<OpcoDto[]> {
    return this.opcos.listForAdmin(includeInactive === 'true');
  }

  @Post()
  @ApiCreatedResponse({ type: OpcoDto })
  create(@Body() dto: CreateOpcoDto): Promise<OpcoDto> {
    return this.opcos.createOpco(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: OpcoDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOpcoDto,
  ): Promise<OpcoDto> {
    return this.opcos.updateOpco(id, dto);
  }
}
