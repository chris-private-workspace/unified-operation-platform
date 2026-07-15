// Delete demo Request rows created by the local demo harness, targeted by their
// exact serviceNowSysId passed as CLI args (never by origin/prefix — avoids
// touching any real row). FK-safe: children (line items / events) before the
// request. Refuses to run with no args (no accidental mass delete).
//
// Run from apps/api so Prisma loads its .env (DATABASE_URL) + resolves the client:
//   npm run demo:cleanup -- reqsys-12342 n8n-req-77772 demo-intake-req-777
//   (or) cd apps/api && node scripts/demo-harness/cleanup-demo.js <sysId> [...]
//
// The harness mocks generate these sysId shapes:
//   direct SN → reqsys-<n>       n8n → n8n-req-<n>       intake → whatever you POST
const { PrismaClient } = require('@prisma/client');

const sysIds = process.argv.slice(2).filter(Boolean);
if (sysIds.length === 0) {
  console.error(
    'Usage: node cleanup-demo.js <serviceNowSysId> [<serviceNowSysId> ...]\n' +
      '(refusing to run with no ids — this script only deletes requests you name).',
  );
  process.exit(2);
}

const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.request.findMany({
    where: { serviceNowSysId: { in: sysIds } },
    select: { id: true, serviceNowSysId: true, serviceNowNumber: true },
  });
  console.log('matched requests:', JSON.stringify(rows));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    console.log('nothing to delete.');
    await prisma.$disconnect();
    return;
  }
  const li = await prisma.requestLineItem.deleteMany({
    where: { requestId: { in: ids } },
  });
  const ev = await prisma.requestEvent.deleteMany({
    where: { requestId: { in: ids } },
  });
  const rq = await prisma.request.deleteMany({ where: { id: { in: ids } } });
  console.log(
    `deleted: lineItems=${li.count} events=${ev.count} requests=${rq.count}`,
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('cleanup error:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
