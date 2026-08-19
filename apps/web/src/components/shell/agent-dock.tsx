import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { IconButton } from '@/components/ui/icon-button';
import { useUiStore } from '@/store/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { canUseAgent } from '@/lib/roles';

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

  if (!visible) return null;

  return (
    <Drawer
      open={dockOpen}
      title="Assistant"
      onClose={() => setDockOpen(false)}
    >
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
      <Link
        to="/assistant"
        onClick={() => setDockOpen(false)}
        className="mt-[12px] inline-flex items-center gap-[6px] text-[12.5px] font-medium text-accent hover:underline"
      >
        Open the Assistant
      </Link>
    </Drawer>
  );
}
