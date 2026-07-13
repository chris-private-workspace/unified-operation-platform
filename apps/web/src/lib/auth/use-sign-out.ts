import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import { clearLocalProfile, getLocalProfile } from './local-profile';
import { msalConfigured } from './msal';
import { apiPost } from '../api';

/**
 * Sign out of whichever session is active (ADR-0005 / ADR-0006 §7). A local
 * session posts /auth/logout to revoke its refresh token + clear the httpOnly
 * cookies server-side, then drops the profile and returns to /login (the profile
 * is cleared even if the request fails — logout must never get stuck). An Entra
 * session goes through MSAL logout.
 */
export function useSignOut(): () => void {
  const { instance } = useMsal();
  const navigate = useNavigate();
  return () => {
    if (getLocalProfile()) {
      void apiPost('/auth/logout').finally(() => {
        clearLocalProfile();
        navigate('/login', { replace: true });
      });
      return;
    }
    if (msalConfigured) void instance.logoutRedirect();
  };
}
