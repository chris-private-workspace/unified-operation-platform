import { Injectable } from '@nestjs/common';
import type { ConnectorKey } from './connectors';

/**
 * BUG-011 — what each seam's factory ACTUALLY resolved at boot.
 *
 * ADR-0013 C2 has the provider factories read their switch once, at boot; a
 * change takes effect on restart. The Integrations panel, meanwhile, answers
 * from the resolver directly, so the moment an admin saves, it reports the new
 * provider while the running process is still on the old one.
 *
 * BUG-005 fixed the opposite version of this and left the rule behind: "whatever
 * decides the route at runtime is what this panel must ask — not a copy of the
 * same logic, the same call." That rule was followed. It was just incomplete:
 * it said WHICH call, never WHEN. The same call answers differently at boot and
 * at now, and only one of those two answers describes the running process.
 *
 * So this records the boot-time answer instead of re-deriving it — the panel
 * compares the two and can finally say "saved, not yet live" rather than
 * claiming a switch that has not happened.
 *
 * 🔴 Deliberately NOT a way to re-resolve providers per call. That would undo
 * C2's boot-once semantics, which is an architectural change (H1) and would need
 * its own ADR. This only observes; it decides nothing.
 */
@Injectable()
export class SeamRuntimeRegistry {
  /**
   * Stores the EFFECTIVE choice, not the raw configured string.
   *
   * Every seam fails safe: anything other than the exact string 'n8n' lands on
   * the default provider. Recording the raw value would let the panel show a
   * typo back to the operator as though it were running, which is the same
   * class of lie this bug is about.
   */
  private readonly usingN8n = new Map<ConnectorKey, boolean>();

  record(seam: ConnectorKey, isN8n: boolean): void {
    this.usingN8n.set(seam, isN8n);
  }

  /**
   * `undefined` means this seam's factory has not run in this process — there is
   * no boot answer to compare against, so callers must report "unknown" rather
   * than inventing agreement.
   */
  isUsingN8n(seam: ConnectorKey): boolean | undefined {
    return this.usingN8n.get(seam);
  }

  /**
   * W46 / ADR-0036 — the same observation for a seam whose choice is not a
   * yes/no.
   *
   * A SECOND map rather than a rewrite of the boolean one above. The three n8n
   * seams genuinely are binary ("did this process route through a third party"),
   * and collapsing them into a string would turn a question the Integrations
   * panel asks directly into one it has to parse. The agent seam picks between
   * two runtimes, neither of which is "the one that was always there", so a
   * boolean has no honest reading here.
   *
   * Same contract as above and for the same reason: `undefined` means this
   * seam's factory has not run in this process, not that it chose the default.
   */
  private readonly choice = new Map<ConnectorKey, string>();

  recordChoice(seam: ConnectorKey, choice: string): void {
    this.choice.set(seam, choice);
  }

  choiceOf(seam: ConnectorKey): string | undefined {
    return this.choice.get(seam);
  }
}
