import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { AUTH_DEV_BYPASS } from '@/lib/auth/dev-bypass';
import { getLocalProfile } from '@/lib/auth/local-profile';

/**
 * Gate the app shell (ADR-0005 / ADR-0006 / ADR-0028). One question now, not two:
 * is there a platform session? Both providers — break-glass password and Entra
 * SSO — leave the same stored profile behind, so there is no separate SSO state
 * to consult. A session flagged mustChangePassword (AUTH-4c-A) is routed to the
 * force-change gate until it sets its own password. Dev-bypass pairs with the
 * backend AUTH_DEV_BYPASS for local dev.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = getLocalProfile();
  if (session?.mustChangePassword)
    return <Navigate to="/change-password" replace />;
  if (AUTH_DEV_BYPASS || session) return <>{children}</>;
  return <Navigate to="/login" replace />;
}
