import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Sidebar } from './sidebar';
import { useUiStore } from '@/store/ui';

// OD4: scaffold render smoke — proves the shell chrome mounts and theme swaps.
describe('app shell scaffold', () => {
  it('renders the sidebar brand + operations nav', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
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
