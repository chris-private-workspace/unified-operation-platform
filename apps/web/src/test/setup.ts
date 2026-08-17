import '@testing-library/jest-dom';
import { JSDOM } from 'jsdom';

/**
 * Node 25 ships Web Storage on by default, and with no `--localstorage-file` it
 * installs `globalThis.localStorage` as a BARE OBJECT — `{}`, no `getItem` /
 * `setItem` / `removeItem` / `clear`. That object is what the test environment
 * ends up holding, so anything touching localStorage died with
 * "localStorage.clear is not a function".
 *
 * 🔴 Three things this is NOT, each of which cost a wrong first guess:
 *   1. Not jsdom (the item was filed as WEB-TEST-JSDOM). `sessionStorage` in the
 *      very same environment is a perfectly good jsdom `Storage` — only
 *      `localStorage` is replaced.
 *   2. Not recoverable by re-pointing at `window`: `globalThis.localStorage ===
 *      window.localStorage` is `true`, both being the same bare object.
 *   3. Not recoverable by deleting the override either — nothing is underneath;
 *      jsdom's real localStorage never got installed in the first place.
 * So the only fix is to supply a real `Storage`, and the honest way to get one
 * is to ask jsdom for it rather than hand-roll a Map-backed lookalike (a shim
 * would quietly diverge on the parts of the spec nobody remembers, e.g. that
 * `setItem` coerces its value to a string).
 *
 * 🔴 The red tests were the smaller half of the problem. `reset-password.tsx`
 * calls `clearLocalProfile()` inside its success `try`, so the TypeError was
 * swallowed by the catch and surfaced to the user as "Could not reset the
 * password" — and the test that only asserts `apiPost` was called STAYED GREEN,
 * because that assertion runs before the throw. A green test sitting directly
 * on top of throwing code.
 *
 * The guard makes this a no-op wherever Storage already works — Node 20 (what
 * `node:20-slim` builds on), CI, the browser — so it cannot mask a regression.
 */
if (typeof globalThis.localStorage?.clear !== 'function') {
  const { localStorage } = new JSDOM('', { url: 'https://localhost' }).window;
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorage,
    configurable: true,
    writable: true,
  });
}
