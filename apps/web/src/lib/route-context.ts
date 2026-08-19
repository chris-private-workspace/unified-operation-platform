/**
 * W49 `F3` — what the dock knows about "the page you are looking at".
 *
 * 🔴 The whole of `OQ-B`'s answer lives in this file's TYPE. Chris chose ① —
 * **the route and its main entity id** — over ② the things the page has
 * rendered. That is not a convenience: option ② would have made arbitrary UI
 * state, which has no notion of scope, into a data source for the agent. A route
 * segment is a single opaque id, and the server checks it like any other.
 *
 * ⚠️ **This produces a HINT, never an authorisation** (`D-CTX`). Everything here
 * is read off `location.pathname`, which anyone can type. The id travels as a
 * parameter and the server decides — `agent-conversation.service.create()` looks
 * the request up and runs `assertOpcoScope` before a thread exists.
 */
export interface RouteContext {
  kind: 'request';
  id: string;
}

/**
 * Derive the context from a pathname, or null when the screen has no single
 * subject.
 *
 * Deliberately a pure function of the path and nothing else: no router hooks, no
 * store, no query cache. That is what makes "what does the dock send?" a
 * question with one testable answer instead of a behaviour you have to render a
 * tree to observe.
 */
export function routeContext(pathname: string): RouteContext | null {
  const match = pathname.match(/^\/requests\/([^/]+)\/?$/);
  if (!match) return null;

  const segment = match[1];

  /**
   * `/requests/new` is the create form (CH-024 A leaves the route declared while
   * the feature is parked). It looks exactly like a detail route and is not one
   * — sending "new" as a request id would produce a 404 from the server and a
   * confusing failure at the first turn.
   */
  if (segment === 'new') return null;

  return { kind: 'request', id: segment };
}
