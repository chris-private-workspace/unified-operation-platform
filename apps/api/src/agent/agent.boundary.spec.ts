import { readdirSync, readFileSync } from 'fs';
import { join, sep } from 'path';

/**
 * W46 F9 / ADR-0036 D0 — the agent boundary, enforced instead of remembered.
 *
 * D0 says an agent is a new EXECUTOR, not a new decision-maker: it may propose
 * and it may trigger, but every real side-effect runs the platform's existing
 * path. `agent.module.ts` states that in prose. This file is the part that
 * fails a build.
 *
 * 🔴 Static source checks, deliberately, and the reason is the same one W38 gave
 * for the license-ops boundary: the claim is "these files do not REACH for the
 * domain at all", which an import list answers directly and a behavioural mock
 * answers only for the paths a test happens to drive.
 *
 * ⚠️ Read this together with `agent-approval/`. Approval legitimately touches
 * both sides (F6, Chris 2026-08-15) — and the moment a legal crossing exists,
 * the illegal one gets easier to argue for. So the rule below is not "nothing
 * may span the two"; it is "`agent` never reaches out, and the one module that
 * spans them is named here".
 */

const SRC = join(__dirname, '..');
const AGENT_DIR = join(SRC, 'agent');

/** Every .ts under a directory, as repo-relative-ish paths with / separators. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(dir, name));
}

const read = (file: string) => readFileSync(file, 'utf8');
const label = (file: string) =>
  file
    .slice(SRC.length + 1)
    .split(sep)
    .join('/');

describe('agent module boundary (ADR-0036 D0)', () => {
  /**
   * Production files only.
   *
   * Not a convenience: the first run of this suite flagged one offender for
   * every single ban, and the offender was THIS FILE — it carries all five
   * forbidden strings as literals. A source-scanning test is inside its own
   * search space, and the claim being made is about what SHIPS.
   */
  const agentFiles = filesUnder(AGENT_DIR).filter(
    (file) => !file.endsWith('.spec.ts'),
  );

  it('has files to check at all', () => {
    // Guards the whole suite: every assertion below is a `for` over this list,
    // so an empty list would make the file a row of green nothing.
    expect(agentFiles.length).toBeGreaterThan(5);
  });

  // ── F9-1 — no reach into the domain ────────────────────────

  /**
   * The three domain module folders. Each entry says why it is not merely
   * "unnecessary" but forbidden: an agent that can call these has skipped the
   * gates that make the platform's answer trustworthy.
   */
  const FORBIDDEN_IMPORTS = [
    {
      needle: "from '../fulfilment/",
      why: 'AssignService is behind here — its 8 gates are the platform\'s answer to "may this happen", and an agent that calls it directly has answered that question itself.',
    },
    {
      needle: "from '../license/",
      why: 'The ledger and reconciliation live here. ADR-0004 #5 makes the ledger the reconciliation baseline; an agent writing to it would be marking its own homework.',
    },
    {
      needle: "from '../opco/",
      why: 'OpCo scope reaches the agent through the person who started the run, never through a lookup the agent performs for itself.',
    },
    {
      needle: "from '../integration/graph/",
      why: 'IntegrationModule IS imported (for connector config), which makes GraphService injectable here. Nothing may take that offer: a direct vendor call is a side-effect that skipped every gate.',
    },
    {
      needle: 'license-ops/license-ops.provider',
      why: 'Seam ② is the assign executor. Reaching it from the agent would put a licence assignment one import away from an unapproved tool call.',
    },
  ];

  describe.each(FORBIDDEN_IMPORTS)('$needle', ({ needle, why }) => {
    it(`appears in no file under src/agent — ${why}`, () => {
      const offenders = agentFiles
        .filter((file) => read(file).includes(needle))
        .map(label);
      expect(offenders).toEqual([]);
    });
  });

  /**
   * Positive half. Every assertion above would also pass for an agent module
   * that had been gutted — which is precisely the failure W38 warned about when
   * it added "still talks to GraphService directly" next to its own bans.
   */
  it('still does its own job: reads through Prisma and applies OpCo scope', () => {
    const registry = read(join(AGENT_DIR, 'tool-registry.ts'));
    expect(registry).toContain('PrismaService');
    expect(registry).toContain('assertOpcoScope');
    expect(registry).toContain('scrubPii');
  });

  it('still imports IntegrationModule for connector config — the allowed half', () => {
    // Named explicitly so the ban list above is read as "no DOMAIN service",
    // not as "no imports". The distinction is the module's whole design.
    expect(read(join(AGENT_DIR, 'agent.module.ts'))).toContain(
      'IntegrationModule',
    );
  });

  /**
   * 🔴 W47 F3-5 — the runtime adapters may not read configuration.
   *
   * Which model a run uses is decided by its profile and handed down through
   * `AgentSetup.model`. Before W47 each adapter resolved that for itself, and an
   * adapter that regains the ability to do so does not fail loudly — it quietly
   * makes the registry advisory: the screen would name one model while the run
   * used another, with nothing red anywhere.
   *
   * ⚠️ Scoped to the two adapters, NOT to the folder. `ai-assist.service.ts`
   * legitimately reads it for runs that predate the registry (`modelForLegacyRun`),
   * so a blanket ban would be false. This is the narrowest form of the rule that
   * is actually true — and the reason it lives here rather than in either
   * provider spec is that a mock of a collaborator a class no longer accepts
   * cannot fail, which is what the first two attempts at this assertion did.
   *
   * 📌 Matches the IMPORT, not the name. Written first as a bare
   * `ConnectorConfigService` search, it went red immediately — on the comments
   * in both adapters explaining why they no longer take one. A ban that a file
   * trips by DOCUMENTING its compliance is not enforcing the rule it states.
   */
  it.each(['openai-agents.provider.ts', 'claude-tool-runner.provider.ts'])(
    '%s resolves no configuration of its own (F3-5)',
    (file) => {
      expect(read(join(AGENT_DIR, file))).not.toContain(
        "from '../integration/connector-config.service'",
      );
    },
  );

  // ── the one legal crossing ─────────────────────────────────

  describe('agent-approval is the only module that sees both sides (F6 / H1)', () => {
    const approvalService = () =>
      read(join(SRC, 'agent-approval', 'agent-approval.service.ts'));

    it('imports the domain path AND the agent service', () => {
      // If this ever stops being true, the crossing has moved somewhere that
      // this file does not describe — and the comment in agent.module.ts
      // explaining why `agent` stays clean would be describing a fiction.
      expect(approvalService()).toContain(
        "from '../fulfilment/request.service'",
      );
      expect(approvalService()).toContain("from '../agent/ai-assist.service'");
    });

    it('creates line items only through the existing service, never through Prisma', () => {
      // The reason a thin orchestrator is acceptable at all: it sequences, it
      // does not re-implement. A direct write here would bypass the origin
      // check, the COMPLETED check and the status recompute in one line.
      expect(approvalService()).toContain('requests.addLineItem');
      expect(approvalService()).not.toContain('prisma.requestLineItem');
    });

    /**
     * 期二 G1 — the second legal crossing, named here for the same reason the
     * first one is.
     *
     * 🔴 Nothing above was loosened to allow it. The bans are on `src/agent/`,
     * and `agent-approval` was already the one module permitted to see both
     * sides — so this is that permission being USED, not widened. Worth stating
     * because the file's own header warns that a legal crossing makes the next
     * one easier to argue for, and this is the next one.
     */
    it('assigns only through AssignService — never Graph, never the seam, never Prisma', () => {
      expect(approvalService()).toContain(
        "from '../fulfilment/assign.service'",
      );
      expect(approvalService()).toContain('assign.assignLineItem');

      // The three ways this could have skipped the eight gates instead.
      expect(approvalService()).not.toContain('GraphService');
      expect(approvalService()).not.toContain('license-ops');
      expect(approvalService()).not.toContain('prisma.opcoSkuLedger');
    });

    /**
     * 🔴 ADR-0016 D3 — the budget override is ADMIN-only and needs a WRITTEN
     * reason, which is the one thing a model must never be able to supply.
     *
     * A string check, because that is what the claim actually is: the parameter
     * has no route to this path at all. `assignLineItem`'s fourth argument is
     * optional, so passing it would compile silently — there is no type to
     * lean on here.
     *
     * ⚠️ And this check alone is NOT enough, which a falsification proved
     * rather than a review noticing: passing the model's own `reasoning`
     * POSITIONALLY as the fourth argument never spells the name, so this test
     * stayed green. What caught it was the arity assertion in
     * `agent-approval.service.spec.ts` (`toHaveBeenCalledWith` with exactly
     * three arguments). The two are not redundant — one watches the name, the
     * other watches the shape of the call.
     */
    it('never supplies a budget override on the agent path', () => {
      expect(approvalService()).not.toContain('budgetOverrideReason');

      const registry = read(join(AGENT_DIR, 'tool-registry.ts'));
      expect(registry).not.toContain('budgetOverrideReason');
      // The same for usage location: an agent proposes WHICH line to assign,
      // never the parameters the assign runs under.
      expect(registry).not.toContain('usageLocation');
    });
  });

  // ── F9-2 — the action ledger has exactly one author ────────

  /**
   * 🔴 The structural form of A7 / INC-001.
   *
   * A7 proves that one narrating model produced no step. This proves that
   * nothing else in the codebase CAN produce one — which is the claim that
   * still holds when someone writes a new tool next month.
   */
  describe('AgentStep and AgentProposal have one writer each', () => {
    const allSrc = filesUnder(SRC).filter((file) => !file.endsWith('.spec.ts'));

    const writersOf = (model: string) =>
      allSrc
        .filter((file) => {
          const text = read(file);
          return ['create', 'createMany', 'update', 'upsert', 'delete'].some(
            (verb) => text.includes(`${model}.${verb}(`),
          );
        })
        .map(label)
        .sort();

    it('only ai-assist.service writes AgentStep', () => {
      expect(writersOf('agentStep')).toEqual(['agent/ai-assist.service.ts']);
    });

    it('only ai-assist.service and the approval orchestrator touch AgentProposal', () => {
      // Two writers, and they write different things: the service CREATES a
      // pending row from a runtime pause; the orchestrator RECORDS a human's
      // decision on it. Neither is a tool, which is the point — a tool writing
      // its own proposal would be the agent recording its own evidence.
      expect(writersOf('agentProposal')).toEqual([
        'agent-approval/agent-approval.service.ts',
        'agent/ai-assist.service.ts',
      ]);
    });

    it('only ai-assist.service writes AgentMessage — the scrub has one door', () => {
      expect(writersOf('agentMessage')).toEqual(['agent/ai-assist.service.ts']);
    });

    it('the tool registry writes nothing at all', () => {
      // F2-6, restated from the outside: a tool that could write would be able
      // to cause the side-effect its own approval exists to gate.
      const registry = read(join(AGENT_DIR, 'tool-registry.ts'));
      for (const verb of ['.create(', '.update(', '.upsert(', '.delete(']) {
        expect(registry).not.toContain(verb);
      }
      expect(registry).not.toContain('$transaction');
    });
  });
});
