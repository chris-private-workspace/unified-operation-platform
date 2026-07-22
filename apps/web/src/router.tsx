import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/shell/app-shell';
import { RequireAuth } from '@/components/auth/require-auth';
import { Login } from '@/pages/login';
import { ForcePasswordChange } from '@/pages/force-password-change';
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

// One route per screen (design-system.md §3.2). FE-1 → Overview + SKU Catalog;
// FE-2 → Requests list + detail; FE-3 → Drift Alerts; FE-Assets → License Assets
// (By-OpCo ledger table, consumes GET /license/ledger + /ledger/stats).
export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/change-password', element: <ForcePasswordChange /> },
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
      { path: 'requests/new', element: <NewRequest /> },
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
      { path: 'settings', element: <Settings /> },
    ],
  },
]);
