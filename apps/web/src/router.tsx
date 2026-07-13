import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/shell/app-shell';
import { RequireAuth } from '@/components/auth/require-auth';
import { Login } from '@/pages/login';
import { Settings } from '@/pages/settings';
import { Overview } from '@/pages/overview';
import { Catalog } from '@/pages/catalog';
import { Requests } from '@/pages/requests';
import { RequestDetail } from '@/pages/request-detail';
import { Drift } from '@/pages/drift';
import { Assets } from '@/pages/assets';

// One route per screen (design-system.md §3.2). FE-1 → Overview + SKU Catalog;
// FE-2 → Requests list + detail; FE-3 → Drift Alerts; FE-Assets → License Assets
// (By-OpCo ledger table, consumes GET /license/ledger + /ledger/stats).
export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
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
      { path: 'requests/:id', element: <RequestDetail /> },
      { path: 'assets', element: <Assets /> },
      { path: 'drift', element: <Drift /> },
      { path: 'catalog', element: <Catalog /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
]);
