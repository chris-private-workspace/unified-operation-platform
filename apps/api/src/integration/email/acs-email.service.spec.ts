import { Logger } from '@nestjs/common';
import { EmailClient } from '@azure/communication-email';
import { AcsEmailService } from './acs-email.service';
import { TEMPLATES } from './templates';

jest.mock('@azure/communication-email');

const RECIPIENT = 'someone.private@rci-t.com';
const SENDER = 'UnifiedOperationsPortal@rci-t.com';
const CONNECTION =
  'endpoint=https://fixture.communication.azure.com/;accesskey=SECRET-ACS-DO-NOT-LEAK';

/**
 * CH-011 — A5 / A6 / A8 and the two `not_configured` outcomes.
 *
 * 🔴 Every PII assertion here spies on the LOGGER, not on the thrown error.
 * RISK R5 mitigation ② says so in as many words, and it is written that way
 * because BUG-004 sat undetected for 18 days behind tests that asserted a clean
 * exception message while the log line beside it carried the UPN.
 */
describe('AcsEmailService', () => {
  const MockedEmailClient = EmailClient as jest.MockedClass<typeof EmailClient>;

  let beginSend: jest.Mock;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  /** Everything the logger was asked to write, in one string. */
  const loggedText = () =>
    [logSpy, warnSpy, errorSpy]
      .flatMap((s) => s.mock.calls)
      .flat()
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join('\n');

  const build = (opts?: {
    connection?: string | null;
    sender?: string | null;
  }) => {
    const connection =
      opts && 'connection' in opts ? opts.connection : CONNECTION;
    const sender = opts && 'sender' in opts ? opts.sender : SENDER;

    const config = {
      get: jest.fn((key: string) =>
        key === 'ACS_CONNECTION_STRING' ? (connection ?? undefined) : undefined,
      ),
    };
    const connectorConfig = {
      resolve: jest.fn(async () => sender ?? undefined),
    };
    return new AcsEmailService(config as never, connectorConfig as never);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    beginSend = jest.fn();
    MockedEmailClient.mockImplementation(() => ({ beginSend }) as never);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  const succeeds = (id = 'op-123') =>
    beginSend.mockResolvedValue({
      pollUntilDone: async () => ({ status: 'Succeeded', id }),
    });

  // ── A8: template rendering ──────────────────────────────────────────

  it('sends the rendered template — subject, plain text AND html', async () => {
    succeeds();
    const service = build();

    const outcome = await service.send({
      to: RECIPIENT,
      template: 'connectivity-check',
      params: { stamp: 'CH-011' },
    });

    expect(outcome).toEqual({ status: 'sent', messageId: 'op-123' });

    const sent = beginSend.mock.calls[0][0];
    const expected = TEMPLATES['connectivity-check']({ stamp: 'CH-011' });
    expect(sent.senderAddress).toBe(SENDER);
    expect(sent.recipients.to).toEqual([{ address: RECIPIENT }]);
    expect(sent.content.subject).toBe(expected.subject);
    expect(sent.content.plainText).toBe(expected.text);
    expect(sent.content.html).toBe(expected.html);
    // The plain-text part is not optional — see the note in templates.ts.
    expect(sent.content.plainText.length).toBeGreaterThan(0);
  });

  // ── A5: the recipient never reaches a log line ──────────────────────

  it('🔴 A5 — never logs the recipient on success', async () => {
    succeeds();
    await build().send({ to: RECIPIENT, template: 'connectivity-check' });

    expect(loggedText()).not.toContain(RECIPIENT);
    // Positive half: it logged SOMETHING, so "not.toContain" is not passing
    // simply because nothing was written at all.
    expect(loggedText()).toContain('connectivity-check');
  });

  it('🔴 A5 — never logs the recipient when the vendor quotes it back', async () => {
    // Exactly the BUG-004 shape: the vendor echoes the request, and the request
    // contains the address.
    beginSend.mockRejectedValue(
      new Error(`Recipient '${RECIPIENT}' was rejected by the service`),
    );

    await expect(
      build().send({ to: RECIPIENT, template: 'connectivity-check' }),
    ).rejects.toThrow(/Email send failed/);

    expect(loggedText()).not.toContain(RECIPIENT);
    expect(loggedText()).toContain('[redacted-email]');
  });

  it('🔴 A6 — scrubs the vendor text in the thrown error too', async () => {
    beginSend.mockRejectedValue(
      new Error(`Recipient '${RECIPIENT}' was rejected`),
    );

    // Both surfaces, because BUG-004 was clean on one and leaking on the other.
    await expect(
      build().send({ to: RECIPIENT, template: 'connectivity-check' }),
    ).rejects.toThrow(/\[redacted-email\]/);
  });

  it('🔴 never logs the connection string, even when it is malformed', async () => {
    MockedEmailClient.mockImplementation(() => {
      throw new Error(`Invalid connection string: ${CONNECTION}`);
    });

    const outcome = await build().send({
      to: RECIPIENT,
      template: 'connectivity-check',
    });

    expect(outcome.status).toBe('not_configured');
    expect(loggedText()).not.toContain('SECRET-ACS-DO-NOT-LEAK');
    expect(loggedText()).not.toContain(CONNECTION);
    expect(loggedText()).toContain('malformed');
  });

  // ── configuration outcomes (ADR-0019 D4) ────────────────────────────

  it('reports not_configured — and sends nothing — with no sender address', async () => {
    const outcome = await build({ sender: null }).send({
      to: RECIPIENT,
      template: 'connectivity-check',
    });

    expect(outcome).toEqual({
      status: 'not_configured',
      details: expect.stringContaining('sender address'),
    });
    expect(beginSend).not.toHaveBeenCalled();
  });

  it('reports not_configured — and sends nothing — with no connection string', async () => {
    const outcome = await build({ connection: null }).send({
      to: RECIPIENT,
      template: 'connectivity-check',
    });

    expect(outcome).toEqual({
      status: 'not_configured',
      details: expect.stringContaining('ACS_CONNECTION_STRING'),
    });
    expect(beginSend).not.toHaveBeenCalled();
  });

  /**
   * A9's unit-level half: with no ACS config the service is inert rather than
   * explosive. Constructing it must not throw either — that is what lets the
   * app boot with no ACS_* env at all (D4: optional, never getOrThrow).
   */
  it('constructs and stays inert with no config whatsoever', async () => {
    const service = build({ connection: null, sender: null });
    await expect(
      service.send({ to: RECIPIENT, template: 'connectivity-check' }),
    ).resolves.toMatchObject({ status: 'not_configured' });
    expect(MockedEmailClient).not.toHaveBeenCalled();
  });

  // ── transport failures throw (ADR-0017 W38 OQ-4) ────────────────────

  it('throws when ACS answers with a non-Succeeded status', async () => {
    beginSend.mockResolvedValue({
      pollUntilDone: async () => ({ status: 'Failed', id: 'op-9' }),
    });

    await expect(
      build().send({ to: RECIPIENT, template: 'connectivity-check' }),
    ).rejects.toThrow(/Failed/);
  });
});
