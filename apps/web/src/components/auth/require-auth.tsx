import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useIsAuthenticated } from '@azure/msal-react';
import { AUTH_DEV_BYPASS } from '@/lib/auth/msal';

/**
 * Gate the app shell (ADR-0003). Dev-bypass skips the gate entirely (local dev pairs
 * with the backend AUTH_DEV_BYPASS). Otherwise unauthenticated users go to /login —
 * where the SSO button stays disabled until IT provisions the app registration.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  if (AUTH_DEV_BYPASS || isAuthenticated) return <>{children}</>;
  return <Navigate to="/login" replace />;
}
