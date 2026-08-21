import type { AssignStepOwner } from '@/lib/api-types';

/**
 * CH-035 `C` / `DEV-3` — who unblocks a step that failed, in one sentence each.
 *
 * 🔴 **Moved here, not rewritten.** These six lines lived in
 * `assign-result-dialog.tsx` since W45 and every word is unchanged. CH-035 needed
 * the same vocabulary on two chat surfaces, and the alternative — a second copy
 * worded slightly differently — is the exact failure CH-032 `D2` measured: two
 * "nearly the same" sentences drift, and nothing goes red when they do.
 *
 * 🔴 `operator` deliberately has NO line, and that is ADR-0029 `D2` verbatim:
 * "those messages already say what to do ('provide a usage location'), and 'you
 * fix it' adds nothing". CH-035 leans on this a second time — `expireRun` writes
 * `whoFixes: 'operator'`, so an expired run shows the headline sentence alone,
 * which is right: nobody else has to fix anything, the question just needs
 * asking again.
 *
 * ⚠️ `Partial<Record<...>>`, so a lookup can legitimately return `undefined`.
 * Callers render the headline without a follow-up line rather than falling back
 * to a generic one — a made-up "someone can fix this" would be worse than
 * silence, because it implies a route that may not exist.
 */
export const WHO_FIXES: Partial<Record<AssignStepOwner, string>> = {
  admin: 'An admin can override this or raise the allocation.',
  identity: 'Chased through Entra Connect / directory sync.',
  servicenow: 'Chased through the ServiceNow user import.',
  procurement: 'More tenant seats have to be bought.',
  platform: 'This one is ours — raise it with the platform team.',
};
