-- CH-026 / ADR-0032 D1 — curated seat model on the SKU dictionary.
--
-- Column only. There is deliberately NO data migration flagging the observed
-- sentinel values (10000 / 50000 / 1000000) as 'unlimited': ADR-0032 D5 —
-- doing so would quietly enact Alternative A (the rejected threshold rule),
-- and nobody would remember later that a threshold had once been run.
-- Every existing row lands on 'prepaid', so this migration changes no behaviour.

-- AlterTable
ALTER TABLE "SkuCatalog" ADD COLUMN     "seatModel" TEXT NOT NULL DEFAULT 'prepaid';
