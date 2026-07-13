import type { AdminUser, Role } from './api-types';
import type { BadgeTone } from '@/components/ui/badge';
import { validatePassword } from './password-policy';

// Presentation + client-side validation for the Users & roles console (AUTH-4b).
// The backend re-validates everything; these just give fast feedback and honest
// labels. Kept pure (no React) so they unit-test directly.

export const ROLE_OPTIONS: readonly Role[] = ['ADMIN', 'REGIONAL', 'OPCO_IT'];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  REGIONAL: 'Regional',
  OPCO_IT: 'OpCo IT',
};

// Semantic tint per role (DS-8): admin = elevated (purple), regional = info,
// opco = neutral. No new accent — all from the token palette.
const ROLE_TONE: Record<Role, BadgeTone> = {
  ADMIN: 'purple',
  REGIONAL: 'info',
  OPCO_IT: 'neutral',
};

export function roleLabel(role: Role): string {
  return ROLE_LABEL[role];
}

export function roleTone(role: Role): BadgeTone {
  return ROLE_TONE[role];
}

export function providerLabel(authProvider: string): string {
  return authProvider === 'local' ? 'Local' : 'SSO';
}

/** OPCO_IT shows its OpCo code; ADMIN / REGIONAL see all OpCos. */
export function scopeLabel(user: AdminUser): string {
  return user.opcoScope ? user.opcoScope.code : 'All OpCos';
}

/** Only local accounts have an editable password / are managed here for login. */
export function isLocal(user: AdminUser): boolean {
  return user.authProvider === 'local';
}

export interface CreateUserForm {
  email: string;
  displayName: string;
  role: Role;
  opcoScopeId: string; // '' = none
  password: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * First validation error for the create form, or null when valid. Mirrors the
 * backend rules (OPCO_IT needs a scope; strict password policy, ADR-0006 §1) so
 * the UI can block submit early — the server remains the source of truth.
 */
export function validateCreateUser(form: CreateUserForm): string | null {
  if (!form.email.trim()) return 'Email is required.';
  if (!EMAIL_RE.test(form.email.trim())) return 'Enter a valid email address.';
  if (!form.displayName.trim()) return 'Display name is required.';
  if (form.role === 'OPCO_IT' && !form.opcoScopeId) {
    return 'OpCo IT users need an OpCo scope.';
  }
  return validatePassword(form.password, { email: form.email.trim() });
}
