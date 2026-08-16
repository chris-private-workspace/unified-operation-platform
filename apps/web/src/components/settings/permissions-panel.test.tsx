import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsPanel } from './permissions-panel';
import { usePermissions } from '@/hooks/queries';
import type { PermissionEntry } from '@/lib/api-types';

/**
 * W46 G2 — the agent rows of the access matrix.
 *
 * 🔴 What is being tested is not "the table renders". It is that the matrix
 * stops being SILENT about the one actor that holds no Role (ADR-0036 D7), and
 * that the two ways a reader can misjudge those rows are both closed on screen:
 *
 *   - reading a tool as an endpoint someone can call, and
 *   - reading an empty Roles cell as "not recorded yet" instead of as the fact
 *     that an AgentPrincipal has no role at all.
 *
 * The backend proves the rows are DERIVED (permissions.spec.ts). This proves an
 * admin reading the page draws the right conclusion from them.
 */

vi.mock('@/hooks/queries', () => ({ usePermissions: vi.fn() }));

const ROUTE: PermissionEntry = {
  controller: 'AgentApprovalController',
  handler: 'approve',
  method: 'POST',
  path: '/agent/proposals/:id/approve',
  access: 'roles',
  actor: 'user',
  roles: ['ADMIN', 'REGIONAL'],
  guards: [],
};

const READ_TOOL: PermissionEntry = {
  controller: 'AgentToolRegistry',
  handler: 'get_request',
  method: 'TOOL',
  path: 'agent:get_request',
  access: 'agent-read',
  actor: 'agent',
  roles: [],
  guards: [],
};

const PROPOSE_TOOL: PermissionEntry = {
  controller: 'AgentToolRegistry',
  handler: 'propose_assign',
  method: 'TOOL',
  path: 'agent:propose_assign',
  access: 'agent-propose',
  actor: 'agent',
  roles: [],
  guards: ['AgentApprovalController'],
};

/**
 * Assertions are scoped to the row, not to the page.
 *
 * 🔴 Not tidiness — the first version of this file asserted `getByText('Agent
 * proposal')` and went red on "found multiple elements", because the
 * explanatory paragraph names the badge too. A page-wide match would have gone
 * green on the PARAGRAPH alone, i.e. on the copy that describes the row rather
 * than on the row. Same shape as the tool-registry gates caught in F10-2:
 * green for a reason other than the one the test claims.
 */
const rowFor = (path: string) =>
  screen.getByText(path).closest('tr') as HTMLElement;

const show = (entries: PermissionEntry[]) => {
  vi.mocked(usePermissions).mockReturnValue({
    data: entries,
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof usePermissions>);
  render(<PermissionsPanel />);
};

describe('🔴 G2 — the agent is visible in the matrix', () => {
  it('lists each tool under its own group, labelled as a tool not a route', () => {
    show([ROUTE, READ_TOOL, PROPOSE_TOOL]);

    expect(screen.getByText('AgentToolRegistry')).toBeTruthy();

    const read = rowFor('agent:get_request');
    expect(within(read).getByText('TOOL')).toBeTruthy();
    expect(within(read).getByText('Agent read')).toBeTruthy();

    const propose = rowFor('agent:propose_assign');
    expect(within(propose).getByText('TOOL')).toBeTruthy();
    expect(within(propose).getByText('Agent proposal')).toBeTruthy();
  });

  it('counts endpoints and tools separately', () => {
    show([ROUTE, READ_TOOL, PROPOSE_TOOL]);

    // 🔴 One combined number would be true of neither: "3 endpoints" overstates
    // the HTTP surface, which is the half a reader maps onto their firewall.
    expect(screen.getByText(/1 endpoints across 1 controllers/)).toBeTruthy();
    expect(screen.getByText(/plus 2 agent tools/)).toBeTruthy();
  });

  it('says the agent holds no role, rather than leaving the cell blank', () => {
    show([ROUTE, READ_TOOL, PROPOSE_TOOL]);

    expect(screen.getByText(/no role of its own/i)).toBeTruthy();
    // The counter-intuitive half, the same one the AI Assist card carries: an
    // approval decides that something SHOULD happen, never that it may skip the
    // checks (ADR-0036 D3).
    expect(screen.getByText(/still run and can still refuse/i)).toBeTruthy();
  });

  it('names the human gate on a propose row, and none on a read row', () => {
    show([READ_TOOL, PROPOSE_TOOL]);

    // The guard cell points at a controller that is itself a row of this matrix
    // — which is what makes "a person decides this" checkable rather than a
    // claim in prose.
    expect(
      within(rowFor('agent:propose_assign')).getByText(
        'AgentApprovalController',
      ),
    ).toBeTruthy();
    // …and a read tool names none, because there is no human in that loop.
    expect(within(rowFor('agent:get_request')).getByText('—')).toBeTruthy();
  });

  it('says nothing about agents when the platform has no tools', () => {
    // Not cosmetic: this panel predates the agent, and a page that explains an
    // AI actor on a deployment that has none would be describing a system the
    // reader does not have.
    show([ROUTE]);

    expect(screen.queryByText(/no role of its own/i)).toBeNull();
    expect(screen.queryByText(/agent tools/i)).toBeNull();
  });
});
