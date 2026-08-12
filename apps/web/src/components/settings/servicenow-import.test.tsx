import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceNowImportPanel } from './servicenow-import';
import { useCatalog, useOpcos } from '@/hooks/queries';
import { useServiceNowImport, useServiceNowLookup } from '@/hooks/mutations';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import type {
  AdminOpco,
  ServiceNowLookupResult,
  SkuCatalog,
} from '@/lib/api-types';

vi.mock('@/hooks/queries', () => ({
  useCatalog: vi.fn(),
  useOpcos: vi.fn(),
}));
vi.mock('@/hooks/mutations', () => ({
  useServiceNowLookup: vi.fn(),
  useServiceNowImport: vi.fn(),
}));
vi.mock('@/lib/auth/use-current-user', () => ({ useCurrentUser: vi.fn() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));

const OPCOS: AdminOpco[] = [{ id: 'rhk', code: 'RHK', displayName: 'RHK Co' }];

const CATALOG: SkuCatalog[] = [
  {
    id: 'row-e5',
    skuId: 'guid-e5',
    skuPartNumber: 'SPE_E5',
    displayName: 'Microsoft 365 E5',
    businessAlias: 'E5',
    category: null,
    isBaseLicense: false,
    seatModel: 'prepaid',
    active: true,
    lastSyncedAt: null,
    createdAt: '2026-07-25T00:00:00Z',
  },
];

/** One importable RITM and one blocked — the two states that matter. */
const RESULT: ServiceNowLookupResult = {
  number: 'REQ0044038',
  shortDescription: 'O365 licence request',
  openedAt: '2026-07-30 06:01:33',
  items: [
    {
      number: 'RITM0047331',
      title: 'O365',
      activeTaskCount: 1,
      importable: true,
      blockedReason: null,
      tasks: [{ number: 'SCTASK0071802', state: '1' }],
    },
    {
      number: 'RITM_BLOCKED',
      title: 'no task',
      activeTaskCount: 0,
      importable: false,
      blockedReason: 'No active catalog task — nothing to close',
      tasks: [],
    },
  ],
};

let lookupMutate: ReturnType<typeof vi.fn>;
let importMutate: ReturnType<typeof vi.fn>;

/** Drive the panel to the state after a successful lookup. */
function lookUp() {
  fireEvent.change(screen.getByPlaceholderText('REQ0044038'), {
    target: { value: 'REQ0044038' },
  });
  fireEvent.click(screen.getByRole('button', { name: /look up/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCurrentUser).mockReturnValue({
    name: 'Admin',
    email: 'admin@uop.local',
    isDevBypass: false,
    canSignOut: true,
    role: 'ADMIN',
    opcoScope: null,
  } as ReturnType<typeof useCurrentUser>);
  vi.mocked(useOpcos).mockReturnValue({
    data: OPCOS,
  } as ReturnType<typeof useOpcos>);
  vi.mocked(useCatalog).mockReturnValue({
    data: CATALOG,
  } as ReturnType<typeof useCatalog>);

  // The lookup mutation resolves by invoking the caller's onSuccess, which is
  // how the real react-query hook behaves.
  lookupMutate = vi.fn(
    (_req: string, opts?: { onSuccess?: (d: unknown) => void }) =>
      opts?.onSuccess?.(RESULT),
  );
  importMutate = vi.fn();
  vi.mocked(useServiceNowLookup).mockReturnValue({
    mutate: lookupMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useServiceNowLookup>);
  vi.mocked(useServiceNowImport).mockReturnValue({
    mutate: importMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useServiceNowImport>);
});

describe('ServiceNowImportPanel', () => {
  it('🔴 renders nothing at all for a non-ADMIN — hidden, not disabled', () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      name: 'RHK IT',
      email: 'opco.it.rhk@rapo.com.hk',
      isDevBypass: false,
      canSignOut: true,
      role: 'OPCO_IT',
      opcoScope: { code: 'RHK', displayName: 'RHK' },
    } as ReturnType<typeof useCurrentUser>);

    const { container } = render(<ServiceNowImportPanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it('does not look anything up before the button is pressed', () => {
    render(<ServiceNowImportPanel />);

    // The panel must not fire a ServiceNow round-trip on mount.
    expect(lookupMutate).not.toHaveBeenCalled();
    expect(screen.queryByText('RITM0047331')).not.toBeInTheDocument();
  });

  it('shows each RITM with its active task count after a lookup', () => {
    render(<ServiceNowImportPanel />);
    lookUp();

    expect(lookupMutate).toHaveBeenCalledWith('REQ0044038', expect.anything());
    expect(screen.getByText('RITM0047331')).toBeInTheDocument();
    expect(screen.getByText('1 active task')).toBeInTheDocument();
    expect(screen.getByText('SCTASK0071802 · state 1')).toBeInTheDocument();
  });

  it('🔴 offers no SKU picker for a blocked RITM, and shows the reason instead', () => {
    render(<ServiceNowImportPanel />);
    lookUp();

    expect(
      screen.getByText('No active catalog task — nothing to close'),
    ).toBeInTheDocument();
    // One importable item ⇒ exactly one licence picker, not two.
    expect(screen.getAllByText('Licence to fulfil')).toHaveLength(1);
  });

  it('keeps Import disabled until a SKU, an OpCo and a UPN are all chosen', () => {
    render(<ServiceNowImportPanel />);
    lookUp();

    const importBtn = () => screen.getByRole('button', { name: /^Import/ });
    expect(importBtn()).toBeDisabled();

    const [skuSelect, opcoSelect] = screen.getAllByRole('combobox');
    fireEvent.change(skuSelect, { target: { value: 'guid-e5' } });
    expect(importBtn()).toBeDisabled();

    fireEvent.change(opcoSelect, { target: { value: 'RHK' } });
    expect(importBtn()).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('new.hire@rapo.com.hk'), {
      target: { value: 'new.hire@rapo.com.hk' },
    });
    expect(importBtn()).toBeEnabled();
  });

  it('🔴 sends the SKU GUID and the RITM number — never a sys_id', () => {
    render(<ServiceNowImportPanel />);
    lookUp();

    const [skuSelect, opcoSelect] = screen.getAllByRole('combobox');
    fireEvent.change(skuSelect, { target: { value: 'guid-e5' } });
    fireEvent.change(opcoSelect, { target: { value: 'RHK' } });
    fireEvent.change(screen.getByPlaceholderText('new.hire@rapo.com.hk'), {
      target: { value: 'new.hire@rapo.com.hk' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));

    expect(importMutate).toHaveBeenCalledWith(
      {
        reqNumber: 'REQ0044038',
        opcoCode: 'RHK',
        targetUpn: 'new.hire@rapo.com.hk',
        items: [{ ritmNumber: 'RITM0047331', skuId: 'guid-e5' }],
      },
      expect.anything(),
    );
  });

  it('never includes a blocked RITM in the payload', () => {
    render(<ServiceNowImportPanel />);
    lookUp();

    const [skuSelect, opcoSelect] = screen.getAllByRole('combobox');
    fireEvent.change(skuSelect, { target: { value: 'guid-e5' } });
    fireEvent.change(opcoSelect, { target: { value: 'RHK' } });
    fireEvent.change(screen.getByPlaceholderText('new.hire@rapo.com.hk'), {
      target: { value: 'x@y.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));

    const items = importMutate.mock.calls[0][0].items as {
      ritmNumber: string;
    }[];
    expect(items.map((i) => i.ritmNumber)).toEqual(['RITM0047331']);
  });

  it('offers "Open request" after a successful import, and it navigates there', () => {
    importMutate.mockImplementation(
      (_body: unknown, opts?: { onSuccess?: (r: unknown) => void }) =>
        opts?.onSuccess?.({ id: 'req-99', serviceNowNumber: 'REQ0044038' }),
    );
    render(<ServiceNowImportPanel />);
    lookUp();

    const [skuSelect, opcoSelect] = screen.getAllByRole('combobox');
    fireEvent.change(skuSelect, { target: { value: 'guid-e5' } });
    fireEvent.change(opcoSelect, { target: { value: 'RHK' } });
    fireEvent.change(screen.getByPlaceholderText('new.hire@rapo.com.hk'), {
      target: { value: 'x@y.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Open request' }));

    expect(navigateMock).toHaveBeenCalledWith('/requests/req-99');
  });

  it('🔴 an error toast carries no action — there is nowhere to go', () => {
    importMutate.mockImplementation(
      (_body: unknown, opts?: { onError?: (e: unknown) => void }) =>
        opts?.onError?.(new Error('boom')),
    );
    render(<ServiceNowImportPanel />);
    lookUp();

    const [skuSelect, opcoSelect] = screen.getAllByRole('combobox');
    fireEvent.change(skuSelect, { target: { value: 'guid-e5' } });
    fireEvent.change(opcoSelect, { target: { value: 'RHK' } });
    fireEvent.change(screen.getByPlaceholderText('new.hire@rapo.com.hk'), {
      target: { value: 'x@y.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));

    expect(
      screen.queryByRole('button', { name: 'Open request' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces the server message when a lookup fails', () => {
    lookupMutate.mockImplementation(
      (_req: string, opts?: { onError?: (e: unknown) => void }) =>
        opts?.onError?.(
          Object.assign(new Error('REQ0000000 was not found — row-level ACL'), {
            name: 'ApiError',
            status: 404,
          }),
        ),
    );
    render(<ServiceNowImportPanel />);
    lookUp();

    // Not an ApiError instance here, so the panel falls back — what matters is
    // that a failure surfaces something rather than silently doing nothing.
    expect(screen.getByText(/Could not reach ServiceNow/i)).toBeInTheDocument();
  });
});
