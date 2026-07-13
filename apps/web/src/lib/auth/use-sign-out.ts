import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import { clearLocalSession, getLocalSession } from './local-session';
import { msalConfigured } from './msal';

/**
 * Sign out of whichever session is active (ADR-0005): a local session clears its
 * stored token and returns to /login; an Entra session goes through MSAL logout.
 */
export function useSignOut(): () => void {
  const { instance } = useMsal();
  const navigate = useNavigate();
  return () => {
    if (getLocalSession()) {
      clearLocalSession();
      navigate('/login', { replace: true });
      return;
    }
    if (msalConfigured) void instance.logoutRedirect();
  };
}
