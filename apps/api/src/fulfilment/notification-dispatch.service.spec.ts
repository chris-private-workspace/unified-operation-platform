import { NotificationDispatchService } from './notification-dispatch.service';
import { OUTBOUND_FAILURE_KINDS } from './outbound-failure-fields';

const RECIPIENT = 'someone.private@rci-t.com';

/**
 * CH-011 A7 — a notification that did not go out becomes a queue row, and the
 * caller's flow survives.
 */
describe('NotificationDispatchService', () => {
  let send: jest.Mock;
  let record: jest.Mock;
  let service: NotificationDispatchService;

  beforeEach(() => {
    send = jest.fn();
    record = jest.fn().mockResolvedValue(undefined);
    service = new NotificationDispatchService(
      { send } as never,
      { record } as never,
    );
  });

  const message = { to: RECIPIENT, template: 'connectivity-check' } as const;

  it('records nothing when the send succeeds', async () => {
    send.mockResolvedValue({ status: 'sent', messageId: 'op-1' });

    await expect(service.send(message)).resolves.toEqual({
      status: 'sent',
      messageId: 'op-1',
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('queues a failure when the transport throws — and does NOT rethrow', async () => {
    send.mockRejectedValue(new Error('Email send failed: upstream down'));

    // Not throwing is the point: ADR-0011 OD4 — a courtesy message must never
    // take the caller's flow down with it.
    await expect(service.send(message)).resolves.toBeNull();

    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({
      kind: OUTBOUND_FAILURE_KINDS.NOTIFICATION_SEND,
      payload: { to: RECIPIENT, template: 'connectivity-check' },
    });
  });

  it('queues a failure when email is not configured', async () => {
    send.mockResolvedValue({
      status: 'not_configured',
      details: 'ACS_CONNECTION_STRING is not set',
    });

    await expect(service.send(message)).resolves.toMatchObject({
      status: 'not_configured',
    });
    expect(record).toHaveBeenCalledTimes(1);
  });

  /**
   * 🔴 The payload must not grow to carry template parameters. AUTH-4c-C passes
   * a single-use reset token through `params` (ADR-0019 D8) and persisting it
   * here would turn a delivery failure into a credential leak.
   *
   * Asserted at the dispatcher as well as in the whitelist, because this is the
   * one place that decides what to hand over.
   */
  it('🔴 never hands template params to the failure queue', async () => {
    send.mockRejectedValue(new Error('nope'));

    await service.send({
      to: RECIPIENT,
      template: 'connectivity-check',
      params: { token: 'SINGLE-USE-SECRET' },
    });

    const recorded = record.mock.calls[0][0];
    expect(Object.keys(recorded.payload).sort()).toEqual(['template', 'to']);
    expect(JSON.stringify(recorded)).not.toContain('SINGLE-USE-SECRET');
  });
});
