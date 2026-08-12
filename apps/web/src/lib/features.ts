/**
 * Front-end feature switches — CH-024 A.
 *
 * NOT a general feature-flag framework. One constant per deliberately parked
 * screen, flipped by editing this file. There is no runtime source (no env, no
 * API, no store) on purpose: these park a finished feature, and a switch that
 * can move at runtime would need a way to reason about it moving mid-session.
 */

/**
 * The manual "New request" flow (`/requests/new` → POST /fulfilment/requests,
 * ADR-0008 Phase 乙 outbound).
 *
 * OFF since 2026-08-12 at Chris's request — the flow works, it is simply not
 * being used yet, and leaving the entry point up invites someone to raise a
 * real ServiceNow ticket through a path nobody is watching.
 *
 * 🔴 The code behind it is untouched and stays tested. To bring it back: flip
 * this to `true`. Nothing else needs editing — the button and the route both
 * read this constant, and `new-request.tsx` / `lib/new-request.ts` never knew
 * about it.
 */
export const NEW_REQUEST_ENABLED = false;
