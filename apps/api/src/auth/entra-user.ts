import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { AppUser } from '@prisma/client';
import type { JwtPayload } from 'jsonwebtoken';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Resolve/upsert the AppUser an Entra token belongs to, keyed on `oid` (ADR-0002).
 * First-seen users auto-provision as REGIONAL (schema default); role elevation
 * stays manual.
 *
 * Shared by BOTH Entra paths on purpose: the guard's `Authorization: Bearer`
 * route (ADR-0002, kept alive) and the SSO callback (ADR-0028). They read the
 * same claims out of two different token kinds, and two copies of this would be
 * free to drift into two different notions of who a user is.
 */
export async function upsertEntraUser(
  prisma: PrismaService,
  payload: JwtPayload,
): Promise<AppUser> {
  const entraOid = payload.oid as string | undefined;
  if (!entraOid) throw new UnauthorizedException('Token missing oid claim');
  const email =
    (payload.email as string) ??
    (payload.preferred_username as string) ??
    (payload.upn as string) ??
    entraOid;
  const displayName = (payload.name as string) ?? email;
  const now = new Date();
  try {
    return await prisma.appUser.upsert({
      where: { entraOid },
      create: { entraOid, email, displayName, lastLoginAt: now },
      update: { email, displayName, lastLoginAt: now },
    });
  } catch (err) {
    // AppUser.email is @unique across BOTH providers, so a first-ever SSO
    // sign-in whose address already belongs to a local account fails on the
    // email constraint, not on entraOid. The raw P2002 reads as an internal
    // error and sends the operator looking in the wrong place; this names the
    // actual situation and the actual fix (an admin merges/removes the local
    // account). H4: no address in the message — it is already on screen for the
    // person who just typed it, and it does not belong in the api log.
    if ((err as { code?: string }).code === 'P2002') {
      throw new ConflictException(
        'A local account already exists for this email address. Ask an administrator to remove it before signing in with SSO.',
      );
    }
    throw err;
  }
}
