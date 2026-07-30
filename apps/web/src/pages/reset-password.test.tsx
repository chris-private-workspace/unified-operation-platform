import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ResetPassword } from './reset-password';
import { apiPost } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiPost: vi.fn() };
});

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom',
    );
  return { ...actual, useNavigate: () => navigate };
});

const GOOD_PASSWORD = 'Str0ng!Passw0rd';

function renderWithHash(hash: string) {
  window.location.hash = hash;
  return render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>,
  );
}

const typePasswords = (value: string, confirmValue = value) => {
  const [next, confirm] = screen.getAllByDisplayValue('');
  fireEvent.change(next, { target: { value } });
  fireEvent.change(confirm, { target: { value: confirmValue } });
};

describe('ResetPassword', () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    navigate.mockReset();
    window.location.hash = '';
  });

  /**
   * 🔴 plan OQ-4. The token has to come from the URL FRAGMENT — a fragment is
   * never sent to the server, so it stays out of the nginx access log in front
   * of this app. Reading it from a query param would look identical to a user
   * and quietly write a single-use credential into the logs.
   */
  it('reads the token from the fragment, not the query string', async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined);
    renderWithHash('#token=tok-from-fragment');

    typePasswords(GOOD_PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/auth/reset-password', {
        token: 'tok-from-fragment',
        newPassword: GOOD_PASSWORD,
      }),
    );
  });

  it('refuses to show the form when the link carries no token', () => {
    renderWithHash('');

    expect(screen.getByText(/link is incomplete/i)).toBeInTheDocument();
    // No password fields at all — nothing to submit into the void.
    expect(screen.queryAllByDisplayValue('')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: /request a new link/i }),
    ).toBeInTheDocument();
  });

  it('blocks submission on a password the shared policy rejects', () => {
    renderWithHash('#token=t');

    typePasswords('short');

    expect(
      screen.getByRole('button', { name: /set new password/i }),
    ).toBeDisabled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('blocks submission when the confirmation does not match', () => {
    renderWithHash('#token=t');

    typePasswords(GOOD_PASSWORD, `${GOOD_PASSWORD}x`);

    expect(screen.getByText(/don’t match/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /set new password/i }),
    ).toBeDisabled();
  });

  it('sends the user to sign in again after a successful reset', async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined);
    renderWithHash('#token=t');

    typePasswords(GOOD_PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    // Not auto-signed-in: every session was just revoked server-side, and using
    // the new password once is the cheapest proof the user actually has it.
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true }),
    );
  });

  it('shows the server rejection for a spent or expired token', async () => {
    const { ApiError } =
      await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    vi.mocked(apiPost).mockRejectedValue(
      new ApiError(400, 'This reset link is invalid or has expired'),
    );
    renderWithHash('#token=stale');

    typePasswords(GOOD_PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    expect(
      await screen.findByText(/invalid or has expired/i),
    ).toBeInTheDocument();
  });
});
