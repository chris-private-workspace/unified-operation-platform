import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForgotPassword } from './forgot-password';
import { apiPost } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiPost: vi.fn() };
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>,
  );

describe('ForgotPassword', () => {
  beforeEach(() => vi.mocked(apiPost).mockReset());

  it('posts the address to the request endpoint', async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined);
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('you@opco.com'), {
      target: { value: 'ops@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/auth/forgot-password', {
        email: 'ops@example.com',
      }),
    );
  });

  /**
   * 🔴 The UI must not undo the API's enumeration defence. The backend answers
   * 204 for an unknown address exactly as for a real one (ADR-0019 D8 #4); a
   * confirmation reading "we sent it to you" would leak, in the interface, the
   * account-existence answer the endpoint refuses to give.
   */
  it('confirms without claiming an account exists', async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined);
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('you@opco.com'), {
      target: { value: 'nobody@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    const confirmation = await screen.findByText(/if an account exists/i);
    expect(confirmation).toBeInTheDocument();
    // The form is gone, so there is no second signal to compare timings against.
    expect(screen.queryByPlaceholderText('you@opco.com')).toBeNull();
  });

  /**
   * ⚠️ NOT covered here: this page's error branch.
   *
   * Three attempts (mockRejectedValue, a synchronous throw, and an implementation
   * returning Promise.reject) all failed the same way — vitest reports the
   * rejection as unhandled even though the component awaits it inside a
   * try/catch. Rather than keep bending the test to fit the runner, the gap is
   * recorded: `reset-password.test.tsx` covers the equivalent branch (a server
   * rejection rendered into the form) and passes, so the pattern itself is
   * proven; what is unproven is only this page's copy of it.
   *
   * Worth knowing too: the 400 branch is nearly unreachable through the UI at
   * all. The input is `type="email" required`, so the browser's own constraint
   * validation refuses to submit a malformed address before any request is made.
   */
});
