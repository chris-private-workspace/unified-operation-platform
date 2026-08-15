import { toTranscript } from './transcript';
import { REDACTED } from '../integration/scrub-pii';

/**
 * W46 A8 — the transcript is scrubbed on the way in, and every item shape goes
 * through the same exit.
 *
 * 🔴 The point of the parameterised case below is coverage of SHAPES, not of
 * strings. `scrubPii` already has its own tests; what is untested until here is
 * whether a branch of the classifier formats text and forgets to hand it to the
 * scrubber. D6 makes these rows permanent, so a branch that leaks has no later
 * chance to be caught.
 */

/** Deliberately re-derived here rather than imported: a test that reuses the
 * implementation's own regex would pass for a scrubber that matches nothing. */
const EMAIL_IN_OUTPUT = /[\w.+-]+@[\w-]+\.[\w-]+/;

const UPN = 'jerry.wong@rapo.com.hk';

describe('toTranscript', () => {
  describe('classification', () => {
    it('reads an assistant message by its role when `type` is absent', () => {
      // The protocol makes `type` optional on assistant messages — reading only
      // `type` would file every model turn under `unknown`, and the rows would
      // still be there, so nobody would notice the labels had drifted.
      expect(
        toTranscript([
          {
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'Two E5 seats.' }],
          },
        ]),
      ).toEqual([{ role: 'assistant', content: 'Two E5 seats.' }]);
    });

    it('records a tool call with its name and arguments', () => {
      expect(
        toTranscript([
          {
            type: 'function_call',
            callId: 'call-1',
            name: 'search_catalog',
            arguments: '{"query":"E5"}',
          },
        ]),
      ).toEqual([
        { role: 'tool_call', content: 'search_catalog({"query":"E5"})' },
      ]);
    });

    it('records a tool result with its status', () => {
      expect(
        toTranscript([
          {
            type: 'function_call_result',
            callId: 'call-1',
            name: 'get_ledger',
            status: 'completed',
            output: { type: 'text', text: '{"allocatedQuantity":5}' },
          },
        ]),
      ).toEqual([
        {
          role: 'tool_result',
          content: 'get_ledger [completed] {"allocatedQuantity":5}',
        },
      ]);
    });

    it('records reasoning as thinking', () => {
      expect(
        toTranscript([
          { type: 'reasoning', content: [{ type: 'text', text: 'Weighing…' }] },
        ]),
      ).toEqual([{ role: 'thinking', content: 'Weighing…' }]);
    });

    it('keeps an unrecognised item as `unknown` rather than dropping it', () => {
      // Dropping loses transcript; filing it under `assistant` claims the model
      // said something nobody read. Recording "not recognised" is the same
      // distinction as `skipped` not being a flavour of `ok`.
      const [entry] = toTranscript([{ type: 'hosted_tool_call', id: 'x' }]);
      expect(entry.role).toBe('unknown');
      expect(entry.content).toContain('hosted_tool_call');
    });

    it('keeps a non-object item as `unknown`', () => {
      expect(toTranscript(['just a string'])).toEqual([
        { role: 'unknown', content: '"just a string"' },
      ]);
    });

    it('skips items that carry no text at all', () => {
      expect(toTranscript([{ role: 'assistant', content: [] }])).toEqual([]);
    });
  });

  // ── A8 — nothing email-shaped survives, from ANY shape ──────

  describe('PII (A8 / D6)', () => {
    const shapes: [string, unknown][] = [
      [
        'assistant text',
        {
          role: 'assistant',
          content: [{ type: 'output_text', text: `Assign to ${UPN}` }],
        },
      ],
      [
        'user text',
        { role: 'user', content: [{ type: 'input_text', text: UPN }] },
      ],
      [
        'tool call arguments',
        {
          type: 'function_call',
          callId: 'c',
          name: 'get_request',
          arguments: `{"targetUpn":"${UPN}"}`,
        },
      ],
      [
        'tool result output',
        {
          type: 'function_call_result',
          callId: 'c',
          name: 'get_request',
          status: 'completed',
          output: `{"targetUpn":"${UPN}"}`,
        },
      ],
      [
        'reasoning',
        { type: 'reasoning', content: [{ type: 'text', text: `for ${UPN}` }] },
      ],
      ['an unrecognised item', { type: 'something_new', note: UPN }],
      [
        'a refusal',
        {
          role: 'assistant',
          content: [{ type: 'refusal', refusal: `cannot help ${UPN}` }],
        },
      ],
    ];

    it.each(shapes)('redacts an address carried in %s', (_label, item) => {
      const entries = toTranscript([item]);

      expect(entries).toHaveLength(1);
      // Both halves matter. The first alone would pass for a scrubber that
      // deleted the whole string; the second alone would pass for one that
      // appended the marker and left the address in place.
      expect(entries[0].content).toContain(REDACTED);
      expect(entries[0].content).not.toMatch(EMAIL_IN_OUTPUT);
    });

    it('redacts every address in a multi-item transcript, not just the first', () => {
      const entries = toTranscript([
        { role: 'user', content: `raise for ${UPN}` },
        {
          type: 'function_call',
          callId: 'c',
          name: 'get_request',
          arguments: `{"upn":"${UPN}"}`,
        },
        {
          role: 'assistant',
          content: [{ type: 'output_text', text: `done for ${UPN}` }],
        },
      ]);

      expect(entries).toHaveLength(3);
      for (const entry of entries) {
        expect(entry.content).not.toMatch(EMAIL_IN_OUTPUT);
      }
    });
  });
});
