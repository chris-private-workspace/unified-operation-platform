-- CH-027 / ADR-0033 D1 — store all four prepaidUnits buckets, plus Microsoft's
-- own capabilityStatus, on the tenant snapshot.
--
-- Columns only. There is deliberately NO data migration back-filling the three
-- new counts on existing snapshots: ADR-0033 D6 — those numbers were never
-- measured at capture time, so any value written here would be an invented
-- history (same line ADR-0032 D5 drew).
--
-- Consequence, and it is the intended one: every existing row lands on 0 / 0 / 0
-- / 'Enabled', so `owned` (= prepaidEnabled + warningUnits) stays byte-identical
-- to today's value until the next catalog sync writes a fresh snapshot.

-- AlterTable
ALTER TABLE "TenantSkuSnapshot" ADD COLUMN     "suspendedUnits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "warningUnits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedOutUnits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "capabilityStatus" TEXT NOT NULL DEFAULT 'Enabled';
