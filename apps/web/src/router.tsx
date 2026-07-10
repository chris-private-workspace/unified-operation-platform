import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/shell/app-shell';
import { RequireAuth } from '@/components/auth/require-auth';
import { Login } from '@/pages/login';
import { Placeholder } from '@/pages/placeholder';
import { Overview } from '@/pages/overview';
import { Catalog } from '@/pages/catalog';
import { Requests } from '@/pages/requests';
import { RequestDetail } from '@/pages/request-detail';
import { Drift } from '@/pages/drift';

// One route per screen (design-system.md §3.2). FE-1 → Overview + SKU Catalog;
// FE-2 → Requests list + detail; FE-3 → Drift Alerts. License Assets is deferred
// to a phase paired with the ledger read-model.
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
      {
        path: 'assets',
        element: <Placeholder title="License Assets" phase="FE-Assets" />,
      },
      { path: 'drift', element: <Drift /> },
      { path: 'catalog', element: <Catalog /> },
    ],
  },
]);
