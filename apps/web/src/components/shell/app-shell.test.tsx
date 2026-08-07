import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { Sidebar } from './sidebar';
import { useUiStore } from '@/store/ui';

// OD4: scaffold render smoke — proves the shell chrome mounts and theme swaps.
describe('app shell scaffold', () => {
  it('renders the sidebar brand + operations nav', () => {
    // Sidebar reads the live Drift badge via useDrift (TanStack Query) and the
    // signed-in identity via useCurrentUser — so the query client is the only
    // provider needed. Since ADR-0028 there is no auth provider to wrap at all:
    // the session is a cookie, not client-side library state.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('LicenseOps')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Drift Alerts')).toBeInTheDocument();
    expect(screen.getByText('SKU Catalog')).toBeInTheDocument();
  });

  it('theme store toggles light ↔ dark', () => {
    useUiStore.setState({ theme: 'light' });
    expect(useUiStore.getState().theme).toBe('light');
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe('dark');
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe('light');
  });
});
