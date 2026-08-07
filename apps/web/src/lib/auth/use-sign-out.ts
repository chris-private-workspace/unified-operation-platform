import { useNavigate } from 'react-router-dom';
import { clearLocalProfile, getLocalProfile } from './local-profile';
import { apiPost } from '../api';

/**
 * End the platform session (ADR-0006 §7 / ADR-0028). One path for both
 * providers: POST /auth/logout revokes the refresh token and clears the httpOnly
 * cookies server-side, then the stored profile is dropped and we return to
 * /login. The profile is cleared even if the request fails — logout must never
 * get stuck.
 *
 * ⚠️ This does NOT sign the user out of Entra itself. Their Microsoft session
 * survives, so "Continue with Microsoft Entra ID" will sign them straight back
 * in without a prompt — normal SSO behaviour, and the same thing every other
 * Entra-backed app in the tenant does. A federated sign-out (redirecting to
 * Entra's end_session_endpoint) would change that, and is a product decision
 * rather than a gap: it also signs them out of Outlook and Teams.
 */
export function useSignOut(): () => void {
  const navigate = useNavigate();
  return () => {
    if (!getLocalProfile()) return;
    void apiPost('/auth/logout').finally(() => {
      clearLocalProfile();
      navigate('/login', { replace: true });
    });
  };
}
