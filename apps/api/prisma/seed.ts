import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// OpCo entities. code is the unique key; "COMPANY/CC" splits into company +
// costCenter.
//
// Provenance is mixed, deliberately:
//   - 23 rows come from the FY26 M365 license summary (the original import).
//   - 'RAPO/IT (RDC2)' was added in W36 from n8n's `deptMapping` (Job Function
//     "RAPO IT (RDC2)"), NOT from that summary. AD keeps it under department
//     code RAPO/IT — the platform tracks it separately on purpose, so its seats
//     do not roll up into RAPO/IT (OQ-2, Chris 2026-07-27). Consequence worth
//     remembering when comparing against FY26 figures: RAPO/IT totals before
//     and after this split are not directly comparable.
const OPCOS: { code: string; company: string; costCenter?: string }[] = [
  { code: 'PFU-Asia', company: 'PFU-Asia' },
  { code: 'PFU-HK', company: 'PFU-HK' },
  { code: 'RAP', company: 'RAP' },
  { code: 'RAPO/APTC', company: 'RAPO', costCenter: 'APTC' },
  { code: 'RAPO/ASPC', company: 'RAPO', costCenter: 'ASPC' },
  { code: 'RAPO/FNA', company: 'RAPO', costCenter: 'FNA' },
  { code: 'RAPO/IT', company: 'RAPO', costCenter: 'IT' },
  { code: 'RAPO/IT (RBS)', company: 'RAPO', costCenter: 'IT (RBS)' },
  { code: 'RAPO/IT (RDC2)', company: 'RAPO', costCenter: 'IT (RDC2)' },
  { code: 'RAPO/SCM', company: 'RAPO', costCenter: 'SCM' },
  { code: 'RAPP', company: 'RAPP' },
  { code: 'RBS', company: 'RBS' },
  { code: 'RCN', company: 'RCN' },
  { code: 'RHK', company: 'RHK' },
  { code: 'RKR', company: 'RKR' },
  { code: 'RMS', company: 'RMS' },
  { code: 'RNZ', company: 'RNZ' },
  { code: 'RPH', company: 'RPH' },
  { code: 'RSP', company: 'RSP' },
  { code: 'RTH', company: 'RTH' },
  { code: 'RTMAP', company: 'RTMAP' },
  { code: 'RTMEAP', company: 'RTMEAP' },
  { code: 'RTW', company: 'RTW' },
  { code: 'RVN', company: 'RVN' },
];

async function main() {
  // ── OpCos ──
  for (const o of OPCOS) {
    await prisma.opco.upsert({
      where: { code: o.code },
      create: {
        code: o.code,
        displayName: o.code,
        company: o.company,
        costCenter: o.costCenter ?? null,
      },
      update: { company: o.company, costCenter: o.costCenter ?? null },
    });
  }

  // ── Admin user (Entra oid = Graph userId) ──
  await prisma.appUser.upsert({
    where: { entraOid: 'f11e0f64-5081-4f9a-86fd-8a24666f2290' },
    create: {
      entraOid: 'f11e0f64-5081-4f9a-86fd-8a24666f2290',
      email: 'chris.lai@rapo.com.hk',
      displayName: 'Chris Lai',
      role: 'ADMIN', // full scope (opcoScope = null)
    },
    update: { role: 'ADMIN' },
  });

  // ── Dev/test OPCO_IT user, scoped to RHK (AUTH-3a). Lets local dev exercise
  //    per-OpCo scope via AUTH_DEV_USER_EMAIL. Harmless in any env — a scoped
  //    role, no elevated access. Real OPCO_IT users arrive via SSO (AUTH-3b).
  const rhk = await prisma.opco.findUnique({ where: { code: 'RHK' } });
  if (rhk) {
    await prisma.appUser.upsert({
      where: { entraOid: 'dev-opco-it-rhk' },
      create: {
        entraOid: 'dev-opco-it-rhk',
        email: 'opco.it.rhk@rapo.com.hk',
        displayName: 'RHK OpCo IT',
        role: 'OPCO_IT',
        opcoScopeId: rhk.id,
      },
      update: { role: 'OPCO_IT', opcoScopeId: rhk.id },
    });
  }

  // ── Local admin (ADR-0005 / AUTH-4a). Only seeded when the initial password is
  //    provided via env — H4: never a hardcoded password. Lets local dev + break-
  //    glass log in without SSO (authProvider='local', entraOid=null). Upsert by
  //    email since local accounts have no entraOid.
  const localPw = process.env.LOCAL_ADMIN_INITIAL_PASSWORD;
  if (localPw) {
    const passwordHash = await argon2.hash(localPw, { type: argon2.argon2id });
    await prisma.appUser.upsert({
      where: { email: 'admin@uop.local' },
      create: {
        email: 'admin@uop.local',
        displayName: 'Local Admin',
        role: 'ADMIN',
        authProvider: 'local',
        passwordHash,
      },
      update: { authProvider: 'local', passwordHash, role: 'ADMIN' },
    });
    console.log('Seeded local admin (admin@uop.local).');
  } else {
    console.log(
      'LOCAL_ADMIN_INITIAL_PASSWORD not set — skipping local admin seed.',
    );
  }

  console.log(`Seeded ${OPCOS.length} OpCos + admin + RHK OPCO_IT user.`);
  // NOTE: SkuCatalog is NOT hardcoded — run POST /license/catalog/sync to seed
  // it from live subscribedSkus. OpcoSkuLedger (allocated/assigned) is loaded
  // separately from the Excel best-known values during initialisation.
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
