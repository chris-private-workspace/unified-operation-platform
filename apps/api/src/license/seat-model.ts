/**
 * ADR-0032 D1 — does a SKU have a "how many seats did we buy" concept at all.
 *
 * ONE list, shared by every write path (PATCH DTO, CSV import) and every reader.
 * A second copy is precisely what a Prisma enum would have minted (ADR-0031 D1),
 * and a second copy is how two write paths end up accepting different values.
 *
 * 🔴 Not derived from `prepaidEnabled`. ADR-0032 rejected both a threshold and a
 * known-sentinel set: each invents a rule Microsoft never promised, and each
 * fails silently — the SKU simply starts displaying the wrong thing with no
 * signal. Whether a SKU is metered is something a human knows and the platform
 * does not, exactly like `category` / `isBaseLicense` (ADR-0004).
 */
export const SEAT_MODEL = {
  /** `prepaidEnabled` is a real purchased-seat count (the default). */
  PREPAID: 'prepaid',
  /** No seat concept; Graph expresses it with a sentinel (10000 / 50000 / 1000000 observed). */
  UNLIMITED: 'unlimited',
} as const;

export const SEAT_MODELS = [SEAT_MODEL.PREPAID, SEAT_MODEL.UNLIMITED] as const;

export type SeatModel = (typeof SEAT_MODELS)[number];

export function isSeatModel(value: string): value is SeatModel {
  return (SEAT_MODELS as readonly string[]).includes(value);
}
