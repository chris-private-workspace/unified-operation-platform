import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationsPanel } from './integrations-panel';
import { useIntegrations } from '@/hooks/queries';
import { useTestConnection, useUpdateConnector } from '@/hooks/mutations';
import type { ConnectorStatus } from '@/lib/api-types';

// Mock the data hooks — the panel's own logic (editing, save-diff, the secret
// boundary) is what we exercise, not react-query.
vi.mock('@/hooks/queries', () => ({ useIntegrations: vi.fn() }));
vi.mock('@/hooks/mutations', () => ({
  useTestConnection: vi.fn(),
  useUpdateConnector: vi.fn(),
}));

const updateMutate = vi.fn();

const mockList = (data: ConnectorStatus[]) =>
  vi.mocked(useIntegrations).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useIntegrations>);

const GRAPH: ConnectorStatus = {
  key: 'graph',
  label: 'Microsoft Graph',
  state: 'required',
  lastSuccessAt: null,
  lastSuccessNote: null,
  lastProbe: null,
  probeable: true,
  probeNote: null,
  config: {
    editable: [
      {
        column: 'graphTenantId',
        label: 'Tenant ID',
        value: 'tid-123',
        source: 'env',
      },
      {
        column: 'graphClientId',
        label: 'Client ID',
        value: null,
        source: 'unset',
      },
    ],
    secrets: [
      {
        envKey: 'GRAPH_CLIENT_SECRET',
        label: 'Client secret',
        configured: true,
      },
    ],
  },
};

// n8n inbound: the shared key is its only config — nothing editable.
const INBOUND: ConnectorStatus = {
  key: 'n8n-inbound',
  label: 'n8n (inbound intake)',
  state: 'required',
  lastSuccessAt: null,
  lastSuccessNote:
    'Cannot be distinguished from other requests in existing data',
  lastProbe: null,
  probeable: false,
  probeNote: 'Inbound is pushed by n8n — the platform has nothing to call',
  config: {
    editable: [],
    secrets: [
      { envKey: 'INTAKE_API_KEY', label: 'Intake API key', configured: true },
    ],
  },
};

describe('IntegrationsPanel (W34 / ADR-0013)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTestConnection).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useTestConnection>);
    vi.mocked(useUpdateConnector).mockReturnValue({
      mutate: updateMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateConnector>);
  });

  it('lists connectors', () => {
    mockList([GRAPH]);
    render(<IntegrationsPanel />);
    expect(screen.getByText('Microsoft Graph')).toBeInTheDocument();
  });

  it('reveals editable fields seeded from the effective value on Configure', () => {
    mockList([GRAPH]);
    render(<IntegrationsPanel />);
    fireEvent.click(screen.getByText('Configure'));
    expect(screen.getByDisplayValue('tid-123')).toBeInTheDocument();
    expect(
      screen.getByText(/Changes take effect after the API restarts/),
    ).toBeInTheDocument();
  });

  // 🔴 The secret boundary, on the client: a secret is shown as status, NEVER as
  // an editable input. Exactly as many textboxes as editable fields (2).
  it('shows a secret as configured status, never as an input', () => {
    mockList([GRAPH]);
    render(<IntegrationsPanel />);
    fireEvent.click(screen.getByText('Configure'));
    expect(screen.getByText('configured via env')).toBeInTheDocument();
    expect(screen.getByText('GRAPH_CLIENT_SECRET')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  it('saves only the fields that actually changed', () => {
    mockList([GRAPH]);
    render(<IntegrationsPanel />);
    fireEvent.click(screen.getByText('Configure'));
    fireEvent.change(screen.getByDisplayValue('tid-123'), {
      target: { value: 'new-tid' },
    });
    fireEvent.click(screen.getByText('Save'));
    expect(updateMutate).toHaveBeenCalledWith(
      { key: 'graph', values: { graphTenantId: 'new-tid' } },
      expect.anything(),
    );
  });

  it('offers no Configure for a connector with no editable fields', () => {
    mockList([INBOUND]);
    render(<IntegrationsPanel />);
    expect(screen.queryByText('Configure')).not.toBeInTheDocument();
  });
});
