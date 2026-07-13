import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useIsAuthenticated } from '@azure/msal-react';
import { AUTH_DEV_BYPASS } from '@/lib/auth/msal';
import { getLocalSession } from '@/lib/auth/local-session';

/**
 * Gate the app shell (ADR-0003 + ADR-0005). A local password session or an Entra
 * session (or dev-bypass) is authenticated; otherwise go to /login. Dev-bypass
 * pairs with the backend AUTH_DEV_BYPASS for local dev.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  if (AUTH_DEV_BYPASS || isAuthenticated || getLocalSession())
    return <>{children}</>;
  return <Navigate to="/login" replace />;
}
