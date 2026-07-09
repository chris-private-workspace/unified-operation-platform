import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/shell/app-shell';
import { Placeholder } from '@/pages/placeholder';

// One route per screen (design-system.md §3.2). Placeholders this phase; the
// screen build order is Overview → Assets → Requests → Drift → Catalog.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Placeholder title="Overview" phase="FE-1" /> },
      {
        path: 'requests',
        element: <Placeholder title="Requests" phase="FE-2" />,
      },
      {
        path: 'assets',
        element: <Placeholder title="License Assets" phase="FE-1" />,
      },
      {
        path: 'drift',
        element: <Placeholder title="Drift Alerts" phase="FE-3" />,
      },
      {
        path: 'catalog',
        element: <Placeholder title="SKU Catalog" phase="FE-3" />,
      },
    ],
  },
]);
