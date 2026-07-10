import { ForbiddenException } from '@nestjs/common';
import type { AppUser } from '@prisma/client';

/**
 * Per-OpCo access scope (AUTH-3a). `opcoScopeId` is null for ADMIN / REGIONAL
 * (see everything) and set for OPCO_IT (own OpCo only) — see schema AppUser.
 * The model was designed for this; these helpers just apply it at the query /
 * write layer. REGIONAL / ADMIN behaviour is unchanged (null → no restriction).
 */

/**
 * Prisma `where` fragment restricting request queries to the caller's OpCo.
 * null scope (REGIONAL / ADMIN) → {} (all rows); OPCO_IT → { opcoId }.
 */
export function scopeWhere(user: AppUser): { opcoId?: string } {
  return user.opcoScopeId ? { opcoId: user.opcoScopeId } : {};
}

/**
 * Assert the caller may read / act on a resource belonging to `opcoId`.
 * null scope → always allowed. A scoped user hitting another OpCo → 403 —
 * fail-closed, never a silent allow (also stops id-guessing from leaking data).
 */
export function assertOpcoScope(user: AppUser, opcoId: string): void {
  if (user.opcoScopeId && user.opcoScopeId !== opcoId) {
    throw new ForbiddenException('Out of OpCo scope');
  }
}
