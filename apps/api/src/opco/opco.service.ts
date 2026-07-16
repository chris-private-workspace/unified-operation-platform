import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOpcoDto, OpcoDto, UpdateOpcoDto } from './dto/opco.dto';

export interface OpcoOption {
  id: string;
  code: string;
  displayName: string;
}

// Rich shape returned by the admin surface (CH-004).
const ADMIN_SELECT = {
  id: true,
  code: true,
  displayName: true,
  company: true,
  costCenter: true,
  active: true,
} as const;

/** Trim a string; empty / whitespace-only → null (clears an optional field). */
function normalizeOptional(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

@Injectable()
export class OpcoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active OpCos for picker selectors (id + code + displayName only). */
  listActive(): Promise<OpcoOption[]> {
    return this.prisma.opco.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, displayName: true },
    });
  }

  /**
   * Rich OpCo list for the admin management panel (CH-004). Active-only by
   * default (this is also what the create-user scope selector consumes, so its
   * behaviour is unchanged after the GET relocated here); includeInactive=true
   * surfaces deactivated OpCos so an admin can reactivate them.
   */
  listForAdmin(includeInactive = false): Promise<OpcoDto[]> {
    return this.prisma.opco.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { code: 'asc' },
      select: ADMIN_SELECT,
    });
  }

  /** Create an OpCo. code must be unique (409 on clash). */
  async createOpco(dto: CreateOpcoDto): Promise<OpcoDto> {
    const code = dto.code.trim();
    const clash = await this.prisma.opco.findUnique({
      where: { code },
      select: { id: true },
    });
    if (clash)
      throw new ConflictException(`OpCo code "${code}" already exists`);

    return this.prisma.opco.create({
      data: {
        code,
        displayName: dto.displayName.trim(),
        company: dto.company.trim(),
        costCenter: normalizeOptional(dto.costCenter),
        active: dto.active ?? true,
      },
      select: ADMIN_SELECT,
    });
  }

  /**
   * Edit an OpCo — displayName / company / costCenter / active only. code is
   * immutable (never in the data), matching the skuId-style stable-key rule
   * (CH-003). 404 if the id does not exist.
   */
  async updateOpco(id: string, dto: UpdateOpcoDto): Promise<OpcoDto> {
    const existing = await this.prisma.opco.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`OpCo ${id} not found`);

    const data: Prisma.OpcoUpdateInput = {};
    if (dto.displayName !== undefined)
      data.displayName = dto.displayName.trim();
    if (dto.company !== undefined) data.company = dto.company.trim();
    if (dto.costCenter !== undefined) {
      data.costCenter = normalizeOptional(dto.costCenter);
    }
    if (dto.active !== undefined) data.active = dto.active;

    return this.prisma.opco.update({
      where: { id },
      data,
      select: ADMIN_SELECT,
    });
  }
}
