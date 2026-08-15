import type { AppUser } from '@prisma/client';

/**
 * ADR-0036 D1 — ONE tool contract, written in the shape both runtimes already
 * accept.
 *
 * `@openai/agents`' `tool({ parameters })` takes raw JSON Schema, and the
 * Anthropic Tool Runner's `betaTool({ inputSchema })` takes raw JSON Schema
 * too. That is the whole reason a single definition can serve both: the two
 * tool contracts were never different kinds of thing. A provider adapter does
 * shape conversion and nothing else — no business logic, no second allow-list,
 * no per-runtime tweak. If an adapter ever needs to *decide* something, the
 * decision belongs here instead.
 */

/**
 * A tool's parameters, in the subset OpenAI's `strict` mode accepts: an object,
 * every property listed in `required`, `additionalProperties: false`.
 *
 * Deliberately a plain object rather than Zod or a Nest DTO: this exact value
 * is what gets handed to the SDK, so a richer local type would only have to be
 * compiled back down to it — and the compiler step is where a second, subtly
 * different schema would come from.
 */
export interface AgentToolSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

/**
 * Who a run is acting for.
 *
 * 🔴 `user` is the human who started the run, and every tool applies THEIR OpCo
 * scope (`scopeWhere` / `assertOpcoScope`). So an agent can never read anything
 * the person who started it could not read, and "what may an agent see" — a
 * question nobody has an answer to — never has to be asked.
 *
 * ⚠️ `AgentRun` has no `startedById` column: plan §4 did not specify one, and
 * F1 followed the plan rather than inventing a field. Today the user therefore
 * arrives from the caller. 🔴 F5 has to close that gap, because a RESUMED run
 * must apply the same scope as the original — and after an approval that sat
 * overnight, the row is the only place that can come from.
 */
export interface AgentToolContext {
  runId: string;
  user: AppUser;
}

export interface AgentTool {
  name: string;
  /**
   * Shown to the model. It is prompt text, and prompt text is never a security
   * boundary (D2) — anything that must not happen is absent from the registry,
   * not discouraged in a sentence.
   */
  description: string;
  parameters: AgentToolSchema;
  /**
   * 🔴 Write tools are `true`, written literally (D3). The SDK also accepts an
   * async function here, and the plan rules that out: a tool that *sometimes*
   * needs approval is a tool nobody can state the rule for. Split it in two.
   */
  needsApproval: boolean;
  /**
   * `args` is `unknown` on purpose. It arrives from a language model, so the
   * schema above is a request, not a guarantee — every tool re-validates.
   */
  execute(args: unknown, ctx: AgentToolContext): Promise<unknown>;
}
