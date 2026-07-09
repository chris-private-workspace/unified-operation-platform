import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/shell/app-shell';
import { Placeholder } from '@/pages/placeholder';
import { Overview } from '@/pages/overview';
import { Catalog } from '@/pages/catalog';

// One route per screen (design-system.md §3.2). FE-1 builds Overview + SKU
// Catalog (real data); the rest stay placeholders until their screen phase.
// License Assets is deferred to a phase paired with the ledger read-model.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Overview /> },
      {
        path: 'requests',
        element: <Placeholder title="Requests" phase="FE-2" />,
      },
      {
        path: 'assets',
        element: <Placeholder title="License Assets" phase="FE-Assets" />,
      },
      {
        path: 'drift',
        element: <Placeholder title="Drift Alerts" phase="FE-3" />,
      },
      { path: 'catalog', element: <Catalog /> },
    ],
  },
]);
