import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/shell/app-shell';
import { RequireAuth } from '@/components/auth/require-auth';
import { Login } from '@/pages/login';
import { ForcePasswordChange } from '@/pages/force-password-change';
import { ForgotPassword } from '@/pages/forgot-password';
import { ResetPassword } from '@/pages/reset-password';
import { Settings } from '@/pages/settings';
import { Overview } from '@/pages/overview';
import { Catalog } from '@/pages/catalog';
import { Requests } from '@/pages/requests';
import { NewRequest } from '@/pages/new-request';
import { RequestDetail } from '@/pages/request-detail';
import { Drift } from '@/pages/drift';
import { Assets } from '@/pages/assets';
import { Audit } from '@/pages/audit';
import { OutboundFailures } from '@/pages/outbound-failures';
import { Agent } from '@/pages/agent';
import { Assistant } from '@/pages/assistant';
import { NEW_REQUEST_ENABLED } from '@/lib/features';

// One route per screen (design-system.md §3.2). FE-1 → Overview + SKU Catalog;
// FE-2 → Requests list + detail; FE-3 → Drift Alerts; FE-Assets → License Assets
// (By-OpCo ledger table, consumes GET /license/ledger + /ledger/stats).
export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/change-password', element: <ForcePasswordChange /> },
  // W41 / AUTH-4c-C — both outside RequireAuth by definition: whoever needs them
  // cannot sign in. The reset token travels in the URL fragment (plan OQ-4).
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Overview /> },
      { path: 'requests', element: <Requests /> },
      // CH-024 A — the route stays declared while the feature is parked, and
      // redirects rather than 404s: a bookmark to it should land somewhere
      // useful, and `replace` keeps it out of history so Back does not bounce.
      {
        path: 'requests/new',
        element: NEW_REQUEST_ENABLED ? (
          <NewRequest />
        ) : (
          <Navigate to="/requests" replace />
        ),
      },
      { path: 'requests/:id', element: <RequestDetail /> },
      { path: 'assets', element: <Assets /> },
      { path: 'drift', element: <Drift /> },
      { path: 'catalog', element: <Catalog /> },
      // W29 F4 — owner-approved screen beyond the prototype (plan §9.1 Q2);
      // ADMIN-only at the backend, sidebar-gated by canSeeAdminNav.
      { path: 'audit', element: <Audit /> },
      // W31 F4 — outbound delivery failure queue (ADR-0011). ADMIN + REGIONAL
      // at the backend; sidebar-gated by canRepairOutbound.
      { path: 'outbound-failures', element: <OutboundFailures /> },
      // W47 F5 — the agent registry (Tier 2 `T2-a`, plan OQ-B: its own route
      // rather than a Settings tab, because the run list does not fit a tab).
      // ADMIN-only at the backend; sidebar-gated by canManageAgentProfiles.
      { path: 'agent', element: <Agent /> },
      // W48 F5 — Assistant (Tier 2 `T2-c`). ADMIN + REGIONAL at the backend;
      // sidebar-gated by canUseAgent. Its own route rather than a tab on
      // `/agent`, because that screen is ADMIN-only and a conversation is not.
      { path: 'assistant', element: <Assistant /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
]);
