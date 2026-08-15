import { scrubPii } from '../integration/scrub-pii';

/**
 * W46 F5 / ADR-0036 D4 + D6 — raw runtime items → `AgentMessage` rows.
 *
 * `AgentTurn.providerItems` is deliberately un-normalised at the seam (F3), and
 * this is where that debt is paid. Two things happen here and nowhere else:
 *
 *   1. the vendor's item shapes become the platform's five roles, and
 *   2. 🔴 every string is scrubbed BEFORE it can reach the database (D6).
 *
 * A free function rather than a method on the service, because the property
 * worth testing — "nothing email-shaped survives" — should be checkable against
 * a hand-built item list, with no run, no model and no database. The alternative
 * (asserting it only through the service) is how a scrub that silently stops
 * covering a new item type goes unnoticed.
 *
 * 🔴 Scrubbing is applied at the END of every branch, on the finished string,
 * not on the pieces. A branch that formats first and forgets to scrub is the
 * failure this file exists to prevent, so there is exactly one exit point.
 */

/**
 * The plan's five roles, plus `unknown`.
 *
 * ⚠️ `unknown` is a deviation from plan §4, and a deliberate one. The SDK's own
 * protocol carries an `unknown` item type, so items we cannot classify are a
 * real, expected thing — and the two dishonest ways to handle them are to drop
 * them (losing transcript) or to file them under `assistant` (asserting the
 * model said something we did not read). Recording "we did not recognise this"
 * is the same distinction as `skipped` not being a flavour of `ok`.
 */
export type TranscriptRole =
  'user' | 'assistant' | 'thinking' | 'tool_call' | 'tool_result' | 'unknown';

export interface TranscriptEntry {
  role: TranscriptRole;
  content: string;
}

interface RawItem {
  type?: unknown;
  role?: unknown;
  name?: unknown;
  content?: unknown;
  arguments?: unknown;
  output?: unknown;
  status?: unknown;
}

/** One content part, in any of the shapes the protocol uses for text. */
function partToText(part: unknown): string {
  if (typeof part === 'string') return part;
  if (typeof part !== 'object' || part === null) return JSON.stringify(part);

  const record = part as Record<string, unknown>;
  for (const key of ['text', 'refusal', 'transcript']) {
    if (typeof record[key] === 'string') return record[key];
  }
  // An image, an audio blob, or a shape added by a future SDK version. Keeping
  // the JSON is the honest option: it says what arrived without pretending to
  // have understood it.
  return JSON.stringify(part);
}

function toText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(partToText).filter(Boolean).join('\n');
  }
  return partToText(value);
}

function isRecord(value: unknown): value is RawItem {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * ⚠️ `type` is OPTIONAL on assistant messages in the protocol — `role` is the
 * discriminator when it is absent. Reading `type` alone would file every
 * assistant turn under `unknown`, which is the quiet kind of wrong: the rows
 * would still be there, and nobody reads a transcript closely enough to notice
 * the labels drifted.
 */
function classify(item: RawItem): TranscriptEntry {
  const type = typeof item.type === 'string' ? item.type : undefined;
  const role = typeof item.role === 'string' ? item.role : undefined;
  const name = typeof item.name === 'string' ? item.name : 'unknown tool';

  if (type === 'function_call') {
    return {
      role: 'tool_call',
      content: `${name}(${toText(item.arguments)})`,
    };
  }

  if (type === 'function_call_result') {
    const status = typeof item.status === 'string' ? item.status : 'unknown';
    return {
      role: 'tool_result',
      content: `${name} [${status}] ${toText(item.output)}`,
    };
  }

  if (type === 'reasoning') {
    return { role: 'thinking', content: toText(item.content) };
  }

  if (type === 'message' || role) {
    /**
     * `system` is the platform's own instruction text, not something the agent
     * said. It is filed as `user` rather than given a role of its own because
     * the plan's list is the contract and this is genuinely the caller's half
     * of the conversation — but it is worth knowing it is in there when reading
     * a transcript back.
     */
    return {
      role: role === 'assistant' ? 'assistant' : 'user',
      content: toText(item.content),
    };
  }

  return { role: 'unknown', content: JSON.stringify(item) };
}

/**
 * @param providerItems `AgentTurn.providerItems`, exactly as the runtime left it.
 * @returns rows ready for `AgentMessage`, every `content` already scrubbed.
 */
export function toTranscript(providerItems: unknown[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  for (const item of providerItems) {
    const classified = isRecord(item)
      ? classify(item)
      : { role: 'unknown' as const, content: JSON.stringify(item) };

    // 🔴 D6 — the single exit point. Every branch above produces a plain string
    // and none of them scrubs; this is the one place that does, so "did that
    // branch remember?" is not a question anyone has to ask.
    const content = scrubPii(classified.content);
    if (!content) continue;

    entries.push({ role: classified.role, content });
  }

  return entries;
}
