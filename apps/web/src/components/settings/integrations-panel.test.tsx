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
  pendingRestart: false,
  config: {
    editable: [
      {
        column: 'graphTenantId',
        label: 'Tenant ID',
        value: 'tid-123',
        source: 'env',
        kind: 'guid',
      },
      {
        column: 'graphClientId',
        label: 'Client ID',
        value: null,
        source: 'unset',
        kind: 'guid',
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
  pendingRestart: false,
  config: {
    editable: [],
    secrets: [
      { envKey: 'INTAKE_API_KEY', label: 'Intake API key', configured: true },
    ],
  },
};

/**
 * BUG-011 — the connector this was reported against. Two details are the bug:
 * the allowed values are `graph` | `n8n` (the other two seams take `direct`),
 * and the switch is saved but not yet running.
 */
const LICENSE: ConnectorStatus = {
  key: 'n8n-license',
  label: 'n8n (license operations)',
  state: 'active',
  lastSuccessAt: null,
  lastSuccessNote:
    'Not recorded — assignments do not store which provider performed them',
  lastProbe: null,
  probeable: false,
  probeNote: 'Assigning a licence is not something to do as a test',
  pendingRestart: true,
  config: {
    editable: [
      {
        column: 'licenseOpsProvider',
        label: 'Provider',
        value: 'n8n',
        source: 'db',
        kind: 'enum',
        enumValues: ['graph', 'n8n'],
      },
      {
        column: 'n8nLicenseBaseUrl',
        label: 'Webhook base URL',
        value: null,
        source: 'unset',
        kind: 'url',
      },
    ],
    secrets: [],
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

  /**
   * BUG-011 — an operator switched seam ② to n8n in DEV and concluded it could
   * not be switched back. Two things made that a reasonable conclusion, and
   * neither of them was a backend fault.
   */
  describe('provider switching (BUG-011)', () => {
    it('offers the allowed values instead of a box to guess into', () => {
      mockList([LICENSE]);
      render(<IntegrationsPanel />);
      fireEvent.click(screen.getByText('Configure'));

      const provider = screen.getByRole('combobox') as HTMLSelectElement;
      /**
       * 🔴 `graph`, not `direct`. The other two seams take `direct`, so "switch
       * it back to the direct integration" is naturally typed as `direct` and
       * rejected with a 400 — which is exactly what "cannot switch back" was.
       */
      expect([...provider.options].map((o) => o.value)).toEqual([
        '',
        'graph',
        'n8n',
      ]);
      expect(provider.value).toBe('n8n');
    });

    it('leaves non-enum fields as text boxes', () => {
      mockList([LICENSE]);
      render(<IntegrationsPanel />);
      fireEvent.click(screen.getByText('Configure'));

      // Only the URL field — the provider is no longer one of them.
      expect(screen.getAllByRole('textbox')).toHaveLength(1);
    });

    it('can still clear the override — a bare two-option select could not', () => {
      mockList([LICENSE]);
      render(<IntegrationsPanel />);
      fireEvent.click(screen.getByText('Configure'));

      fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
      fireEvent.click(screen.getByText('Save'));

      // null = drop the DB override and fall back to env, which is the second
      // working way back to Graph. A text box could be emptied; replacing it
      // with a select would have quietly taken that away.
      expect(updateMutate).toHaveBeenCalledWith(
        { key: 'n8n-license', values: { licenseOpsProvider: null } },
        expect.anything(),
      );
    });

    it('says outright that a saved switch is not live yet', () => {
      mockList([LICENSE]);
      render(<IntegrationsPanel />);

      // Both badges, and they mean different things: `active` is what is
      // configured, `Pending restart` is what the process is actually running.
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Pending restart')).toBeInTheDocument();
    });

    it('shows no pending badge once the running provider matches', () => {
      mockList([{ ...LICENSE, pendingRestart: false }]);
      render(<IntegrationsPanel />);

      expect(screen.queryByText('Pending restart')).not.toBeInTheDocument();
    });
  });
});
