/**
 * W36 F1 / ADR-0017 D4 — n8n Job Function → platform Opco.code.
 *
 * OQ-1 (Chris, 2026-07-27) = keep this as a CODE CONSTANT, not a DB table: the
 * set is 18 rows that change about never, the n8n side hard-codes the same
 * mapping in a Code node, and a constant means a change shows up in a diff and
 * is locked down by a test. A DB model would have meant another H1 schema step.
 *
 * The KEYS are the exact `deptMapping` keys in n8n workflow 1002 — which are
 * also the dropdown options of the 1004 technician form. After the WF1 change
 * (MAPPING.md §0 finding B) n8n sends that form value verbatim, so this table
 * is the COMPLETE resolution rule.
 *
 * 🔴 NO normalisation, NO alias fallback, NO default. n8n's own `resolveOU()`
 * falls back to `RAPO/IT` when it cannot match — for n8n that only misplaces an
 * OU; for us it would silently bill a licence to the wrong OpCo, and the ledger
 * plus the ADR-0016 budget gate are computed off exactly this value. Unknown
 * department => reject the request (ADR-0017 D0 / D4 fail-closed).
 *
 * Values are verified against `prisma/seed.ts`; the mapping rationale (per-row
 * evidence: n8n `description` = AD department code, plus `adCompany`) lives in
 * `docs/01-planning/W36-n8n-intake-adapter/MAPPING.md §1`.
 */
export const OPCO_BY_JOB_FUNCTION: Readonly<Record<string, string>> = {
  // ── shared ──
  // adCompany = Ricoh Hong Kong Ltd, upn = ricoh.com.hk. n8n groups it as
  // "RHK/RAPO 共用"; confirmed to RHK. If RAPO staff ever pick this Job
  // Function their seats land on RHK — known, accepted (MAPPING.md §1).
  'People & Culture': 'RHK',

  // ── RAPO — n8n `description` is character-for-character the Opco.code ──
  'RAPO ASPC': 'RAPO/ASPC',
  'RAPO ASPC Warehouse': 'RAPO/ASPC', // same cost centre, different OU (Tsing Yi)
  'RAPO FNA': 'RAPO/FNA',
  'RAPO IT': 'RAPO/IT',
  // AD-side description is 'RAPO/IT' for this one too — the only difference from
  // 'RAPO IT' is the OU. OQ-2 (Chris, 2026-07-27): the platform tracks it as its
  // OWN OpCo, i.e. we deliberately slice finer than AD does.
  'RAPO IT (RDC2)': 'RAPO/IT (RDC2)',
  'RAPO SCM': 'RAPO/SCM',

  // ── RHK — 11 Job Functions collapse onto one OpCo ──
  // n8n has 8 distinct RHK department codes (RHK/CS, RHK/CS/CCnE, RHK/FNA,
  // RHK/CCO/LC, RHK/IT, RHK/SG, RHK/MDO, plus two with no prefix) but the
  // platform only has a company-level `RHK` (costCenter = null). Splitting RHK
  // per cost centre would be a new-OpCo decision, out of scope here.
  'RHK CS (engineer)': 'RHK',
  'RHK CS (ETC)': 'RHK',
  'RHK CS OK': 'RHK',
  'RHK CS QNE': 'RHK',
  'RHK Digital Operations': 'RHK',
  'RHK FNL One Kowloon': 'RHK',
  'RHK FNL(Logistic MTL)': 'RHK',
  'RHK IT': 'RHK',
  'RHK SG Salesman': 'RHK',
  'RHK Strategic Innovation': 'RHK',
  'RHK MD Office': 'RHK',
};

/** Every Job Function n8n can send — used by tests to catch silent drift. */
export const KNOWN_JOB_FUNCTIONS = Object.keys(OPCO_BY_JOB_FUNCTION);

/**
 * Exact lookup, nothing else. Only the surrounding whitespace is trimmed (an
 * n8n form value can carry a trailing space); casing and punctuation must match
 * because "close enough" is how a seat ends up on the wrong OpCo.
 */
export function opcoCodeForJobFunction(jobFunction: string): string | null {
  return OPCO_BY_JOB_FUNCTION[jobFunction.trim()] ?? null;
}
