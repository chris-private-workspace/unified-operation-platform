import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { AcsEmailService } from '../src/integration/email/acs-email.service';
import { NotificationDispatchService } from '../src/fulfilment/notification-dispatch.service';
import { OutboundFailureService } from '../src/fulfilment/outbound-failure.service';

/**
 * ONE-SHOT connectivity check for the email transport (CH-011 A11 / ADR-0019).
 *
 * Run: npm run email:check -w @uop/api -- --to=<address>
 *
 * 🔴 On the corporate network you must run it with
 *     $env:NODE_OPTIONS='--use-system-ca'
 * or the first send dies with `self-signed certificate in certificate chain`.
 * The proxy MITMs outbound TLS and Node does not read the Windows certificate
 * store — the identical failure ServiceNow hit (see the restart-stack skill,
 * which already sets this for the API but cannot for a standalone script).
 * It is an environment problem, not a configuration one: nothing about ACS is
 * wrong when it happens.
 *
 * ## Why this script exists at all
 *
 * CH-011 ships the transport; its first real caller arrives with AUTH-4c-C
 * (ADR-0019 D8). That gap is the known cost of splitting the work in two, and
 * OQ-3 (Chris, 2026-07-29) settled how to cover it: prove the path once, from
 * outside, rather than leave it unexercised until 4c-C lands. Same shape as the
 * ADR-0014 baseline script — deploy-time ops, not a product feature.
 *
 * ## What counts as a pass
 *
 * 🔴 NOT "the script printed sent". `UnifiedOperationsPortal@rci-t.com` is on a
 * CUSTOM domain, whose failure mode is that ACS accepts the message and the DNS
 * side drops it — the API says Succeeded and nobody receives anything (CH-011
 * R1). A11 is judged by the recipient actually receiving the mail.
 *
 * ## Why it does not boot AppModule
 *
 * `NestFactory.createApplicationContext(AppModule)` would also start
 * ScheduleModule, and ADR-0015's sync sweep can WRITE (it opens sync gates
 * against real Graph). A connectivity check must not be able to do that, so the
 * three objects it needs are wired by hand instead. They are the real classes —
 * this exercises the production path, not a copy of it.
 */

loadEnv({ path: join(__dirname, '..', '.env') });

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const to = arg('to');
  if (!to) {
    throw new Error(
      'Missing --to=<address>. Example: npm run email:check -w @uop/api -- --to=someone@example.com',
    );
  }

  const prisma = new PrismaClient();

  try {
    // DB-then-env, the same precedence ConnectorConfigService applies
    // (ADR-0013 D3). Reproduced rather than imported because the real resolver
    // pulls in AuditService and the whole Nest graph with it.
    const row = await prisma.connectorConfig.findUnique({
      where: { connector: 'email' },
    });
    const sender = row?.acsSenderAddress || process.env.ACS_SENDER_ADDRESS;

    const transport = new AcsEmailService(
      { get: (key: string) => process.env[key] } as never,
      { resolve: async () => sender } as never,
    );
    const dispatch = new NotificationDispatchService(
      transport,
      new OutboundFailureService(prisma as never),
    );

    // Timestamped so the recipient can tell this run apart from an earlier one —
    // "I got an email" is not evidence if three of them are sitting there.
    const stamp = new Date().toISOString();
    console.log(`sender  : ${sender ?? '(not configured)'}`);
    console.log(`stamp   : ${stamp}`);

    const outcome = await dispatch.send({
      to,
      template: 'connectivity-check',
      params: { stamp },
    });

    console.log(`outcome : ${outcome ? outcome.status : 'threw (queued)'}`);
    if (outcome?.status === 'sent') {
      console.log(`acs op  : ${outcome.messageId}`);
      console.log(
        '\n🔴 ACS accepted the message. That is NOT the acceptance criterion.\n' +
          '   A11 passes only when the recipient confirms it arrived — a custom\n' +
          '   sender domain can fail delivery while this still reports success.',
      );
    } else {
      console.log(
        '\nNot sent. A row was written to OutboundFailure — check /admin/outbound-failures.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // The transport already scrubbed PII out of this message (BUG-004 / R5).
  console.error(`connectivity check failed: ${(err as Error)?.message}`);
  process.exit(1);
});
