import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The 23 OpCo entities from the FY26 M365 license summary (company + cost-center).
// code is the unique key; "COMPANY/CC" splits into company + costCenter.
const OPCOS: { code: string; company: string; costCenter?: string }[] = [
  { code: 'PFU-Asia', company: 'PFU-Asia' },
  { code: 'PFU-HK', company: 'PFU-HK' },
  { code: 'RAP', company: 'RAP' },
  { code: 'RAPO/APTC', company: 'RAPO', costCenter: 'APTC' },
  { code: 'RAPO/ASPC', company: 'RAPO', costCenter: 'ASPC' },
  { code: 'RAPO/FNA', company: 'RAPO', costCenter: 'FNA' },
  { code: 'RAPO/IT', company: 'RAPO', costCenter: 'IT' },
  { code: 'RAPO/IT (RBS)', company: 'RAPO', costCenter: 'IT (RBS)' },
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

  console.log(`Seeded ${OPCOS.length} OpCos + admin user.`);
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
