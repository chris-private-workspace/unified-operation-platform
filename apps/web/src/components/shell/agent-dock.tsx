import { Link, useLocation } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { IconButton } from '@/components/ui/icon-button';
import { useUiStore } from '@/store/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { useRequest } from '@/hooks/queries';
import { canUseAgent } from '@/lib/roles';
import { routeContext } from '@/lib/route-context';

/**
 * W49 `F2` — the site-wide agent dock (Tier 2 `T2-d`).
 *
 * Two exports because the two halves live in different places in the layout: the
 * launcher is a control inside `TopBar`, the panel is `fixed` and mounts once in
 * `AppShell`. Neither is mounted per page — a dock each screen mounted for itself
 * is a dock that closes when you navigate, and drifts.
 */

/**
 * 🔴 `R5` — ONE predicate, used by both halves.
 *
 * The obvious shape is to hide the launcher and let the panel follow, but that
 * makes the gate a property of the button rather than of the feature: `F3` opens
 * this panel from a route, and by then "only reachable through the launcher"
 * would be a claim nobody has checked. Both halves ask the same question, and
 * `agent-dock.test.tsx` scans this file to keep it that way rather than trusting
 * a reviewer to notice a third export appearing without it.
 *
 * ⚠️ Hiding is not the authority — the server's `@Roles` is (the same wording
 * `canUseAgent` itself carries). This only stops offering an entry that would
 * 403.
 */
function useDockVisible(): boolean {
  const { role } = useCurrentUser();
  return canUseAgent(role);
}

/** Lives in `TopBar`, beside the theme toggle. */
export function AgentDockLauncher() {
  const visible = useDockVisible();
  const dockOpen = useUiStore((s) => s.dockOpen);
  const toggleDock = useUiStore((s) => s.toggleDock);

  if (!visible) return null;

  return (
    // `IconButton`, not a `Button` — DS-3 says one primary per view, and the
    // dock is chrome available on every screen. A red action bolted onto the
    // top bar would be a second primary on all of them at once.
    <IconButton
      title="Assistant"
      aria-label="Assistant"
      aria-expanded={dockOpen}
      active={dockOpen}
      onClick={toggleDock}
    >
      <MessageSquare size={16} strokeWidth={2} />
    </IconButton>
  );
}

/** Mounts once in `AppShell`; renders nothing until somebody opens it. */
export function AgentDock() {
  const visible = useDockVisible();
  const dockOpen = useUiStore((s) => s.dockOpen);
  const setDockOpen = useUiStore((s) => s.setDockOpen);

  /**
   * W49 `F3` — the context, derived from the route and nothing else (`OQ-B` ①).
   *
   * ⚠️ `useRequest` is here to NAME the request on screen, not to decide
   * anything. It is the same query key the request detail screen uses, so on the
   * one screen where this fires it is a cache hit and costs no request;
   * everywhere else `ctx` is null and the query is disabled.
   */
  const { pathname } = useLocation();
  const ctx = routeContext(pathname);
  const request = useRequest(ctx?.id);

  if (!visible) return null;

  /**
   * 🔴 The link carries the id as a QUERY PARAMETER, which is the honest shape:
   * it is a hint the next screen may use, sitting somewhere anyone can read and
   * edit. It is not a token and it grants nothing — `agent-conversation.service`
   * looks the request up and runs `assertOpcoScope` before a thread exists
   * (`agent-conversation.scope.spec.ts` holds that up).
   */
  const assistantHref = ctx ? `/assistant?requestId=${ctx.id}` : '/assistant';

  return (
    <Drawer
      open={dockOpen}
      title="Assistant"
      onClose={() => setDockOpen(false)}
    >
      {ctx && (
        <div className="mb-[14px] rounded-lg border border-border bg-panel px-[12px] py-[10px]">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-fg-subtle">
            About
          </div>
          {/*
           * An identifier, so mono (DS-5). Falls back to the raw id while the
           * request is loading or on a screen whose data this session has not
           * fetched — showing the id is honest, and showing nothing would make
           * the panel look like it had lost the context it is about to send.
           */}
          <div className="mt-[3px] font-mono text-[12.5px] text-fg">
            {request.data?.serviceNowNumber ?? ctx.id}
          </div>
        </div>
      )}
      {/*
       * W49 `F2` placeholder. `F4` replaces this with the conversation itself,
       * and is gated on W48 `F7-3` (SSE proven on DEV) — see checklist `F4-0`.
       *
       * ⚠️ It says what is true today rather than describing the chat that is
       * not here yet: a panel that looked ready and did nothing would be worse
       * than one that points at the screen which works.
       */}
      <p className="text-[12.5px] leading-[1.6] text-fg-muted">
        Chat is not connected to this panel yet. The full Assistant runs the
        same agent, with the same approval gate.
      </p>
      {/*
       * 🔴 NOT `text-accent`, and this was caught live rather than reasoned out.
       * On a request detail the page's own primary is an accent button (`Check
       * now`); an accent link in the dock put two accent things on one screen —
       * exactly what `design-system.md §2`'s seventh constraint says a dock must
       * not do to DS-3. The dock appears on EVERY screen, so it is the one
       * component that cannot afford accent for something this ordinary.
       */}
      <Link
        to={assistantHref}
        onClick={() => setDockOpen(false)}
        className="mt-[12px] inline-flex items-center gap-[6px] text-[12.5px] font-medium text-fg-muted underline underline-offset-2 hover:text-fg"
      >
        {ctx ? 'Ask about this request' : 'Open the Assistant'}
      </Link>
    </Drawer>
  );
}
