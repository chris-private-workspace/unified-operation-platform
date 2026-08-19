import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * W48 F2-5 / ADR-0041 D1 — `G3`: the run transcript is untouched.
 *
 * 🔴 What this file exists to stop is not a bug, it is a REFACTOR. `Alternative A`
 * in ADR-0041 (add `conversationId` to `AgentMessage`, make `runId` nullable)
 * saves a table and reads, in a diff, as a small additive change. It is actually
 * a widening of `ADR-0036 D6` — "AgentMessage is kept FOREVER", a sentence
 * written about run transcripts — onto chat, which carries different PII, a
 * different volume and a different lifecycle.
 *
 * That change would break nothing. No suite in this repo would go red, because
 * every one of them asserts behaviour and the behaviour would be identical. So
 * the guard has to be on the SHAPE, and the shape lives in schema.prisma.
 *
 * ⚠️ Deliberately a source scan rather than a type-level check: the claim is
 * "this column is not optional and this table has no such column", which the
 * schema answers directly, and which a generated type answers only after
 * someone remembers to regenerate it.
 */

const schema = readFileSync(
  join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
  'utf8',
);

/** The text of one `model X { … }` block, end-anchored on its own closing brace. */
function modelBlock(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  expect(start).toBeGreaterThan(-1);
  const end = schema.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return schema.slice(start, end);
}

describe('W48 G3 — chat does not move into the run transcript', () => {
  it('AgentMessage.runId is still REQUIRED', () => {
    const block = modelBlock('AgentMessage');
    // `runId String` — the absence of `?` is the whole assertion. Written as a
    // positive match rather than `not.toContain('runId String?')` so that
    // deleting the column outright fails too, instead of passing.
    expect(block).toMatch(/^\s*runId\s+String\s*$/m);
  });

  it('AgentMessage has no conversation column', () => {
    const block = modelBlock('AgentMessage');
    expect(block).not.toContain('conversation');
  });

  it('AgentConversation does not own AgentMessage rows', () => {
    // The other direction of the same rule: a chat writes AgentTurn, never
    // AgentMessage. A relation here would be the first step to sharing the
    // table without anyone deciding to.
    const block = modelBlock('AgentConversation');
    expect(block).not.toContain('AgentMessage');
  });

  it('AgentChatTurn and AgentMessage are separate tables', () => {
    // Guards the guard: if either model were renamed away, the three
    // assertions above would still hold vacuously.
    expect(schema).toContain('model AgentChatTurn {');
    expect(schema).toContain('model AgentMessage {');
  });

  /**
   * Errata to ADR-0041 D1 (Chris 2026-08-18): the model is `AgentChatTurn`
   * because `AgentTurn` was already taken — `agent-runtime.provider.ts` exports
   * it as the seam's normalised result of one runtime round-trip.
   *
   * Pinned rather than left as a comment because the ADR still says `AgentTurn`
   * in its Decision block, so the next person implementing from the ADR will
   * reach for exactly this name. A Prisma model and a TypeScript interface can
   * collide silently: both are importable types, and the file that needs both
   * (F3's conversation service) would just alias one and move on.
   */
  it('the seam keeps sole ownership of the name AgentTurn', () => {
    expect(schema).not.toContain('model AgentTurn {');

    const seam = readFileSync(
      join(__dirname, 'agent-runtime.provider.ts'),
      'utf8',
    );
    expect(seam).toContain('export interface AgentTurn {');
  });
});
