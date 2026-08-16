import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { STEP_LABEL } from './ai-assist-labels';

/**
 * W46 F11-1b — the parity nothing else holds up.
 *
 * `AgentStep.key` is a `string`, and the card renders `STEP_LABEL[key] ?? key`.
 * That fallback is right (an unknown key must not blank the row or throw) but it
 * means the map can silently fall behind the platform: add a tool to
 * `tool-registry.ts` without opening `ai-assist-card.tsx`, and an operator gets
 * a raw `snake_case` identifier on screen. Nothing goes red — not tsc, not the
 * card's own tests, which supply their own fixtures.
 *
 * 🔴 The comparison worth remembering is the map directly beside it.
 * `MESSAGE_LABEL` is `Record<AgentMessage['role'], string>`, so omitting a role
 * does not compile. The two are adjacent, spelled the same way, and only one is
 * protected — and the difference is not in how they are written, it is that one
 * upstream type is a union and the other is `string`.
 *
 * Reading the API's source rather than importing it is deliberate: these are
 * separate packages with no shared build, and the registry is the authority.
 * Same idiom as `agent.boundary.spec.ts` on the API side.
 */

const REGISTRY = join(__dirname, '../../../../api/src/agent/tool-registry.ts');

/**
 * Keys the PLATFORM writes directly rather than deriving from a tool name —
 * `ai-assist.service.ts` `recordStep` call sites. Hardcoded on purpose: if one
 * is renamed, this list is where the rename has to be noticed.
 */
const PLATFORM_KEYS = ['start', 'abort', 'run', 'proposal'];

function registryToolNames(): string[] {
  const source = readFileSync(REGISTRY, 'utf8');
  const names = [...source.matchAll(/^\s*name: '([a-z_]+)',$/gm)].map(
    (m) => m[1],
  );
  return [...new Set(names)];
}

describe('AI Assist step labels stay level with the tool registry (F11-1b)', () => {
  it('finds the registry — a moved file must fail loudly, not silently pass', () => {
    // Without this, a renamed path would make `registryToolNames()` throw, or
    // worse, a changed regex would make it return [] and every assertion below
    // would pass vacuously.
    const names = registryToolNames();
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(names).toContain('propose_line_items');
  });

  it('has an operator-facing label for every tool the agent can call', () => {
    const missing = registryToolNames().filter((name) => !STEP_LABEL[name]);

    // The message matters more than the assertion: whoever added the tool is
    // not the person reading this file, and they need to be told what to do.
    expect(
      missing,
      `Tools with no STEP_LABEL entry — they would render as a raw key on the request screen: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('has a label for every key the platform writes itself', () => {
    const missing = PLATFORM_KEYS.filter((key) => !STEP_LABEL[key]);
    expect(missing).toEqual([]);
  });

  it('carries no label for a key nothing can emit', () => {
    // The other direction. A leftover label is harmless on screen but it is a
    // claim that a step exists, and it is how this map drifts into fiction.
    const known = new Set([...registryToolNames(), ...PLATFORM_KEYS]);
    const orphans = Object.keys(STEP_LABEL).filter((key) => !known.has(key));

    expect(
      orphans,
      `STEP_LABEL entries no step key can ever match: ${orphans.join(', ')}`,
    ).toEqual([]);
  });
});
