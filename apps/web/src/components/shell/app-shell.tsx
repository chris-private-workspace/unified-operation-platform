import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { AgentDock } from './agent-dock';

// App shell = sidebar (248) + main (top bar 56 + scrollable outlet).
// Surfaces/colors come from tokens; light/dark swap via <html class="dark">.
export function AppShell() {
  return (
    <div className="flex h-full overflow-hidden bg-bg text-fg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-[24px] pb-[40px] pt-[22px]">
          <Outlet />
        </main>
      </div>
      {/*
       * W49 `F2` — the dock mounts ONCE here, not per page: a screen that
       * mounted its own would close it on every navigation, and the ones that
       * forgot would be the pages where the dock silently does not exist.
       *
       * 🔴 It is a sibling of the layout, not a column in it (`OQ-D` = overlay,
       * Chris 2026-08-19). Making it a flex child would push the main column
       * narrower, which turns every table on every screen into a second
       * breakpoint to verify. Being `fixed`, its position in this tree is
       * irrelevant — it sits last because that is where it reads.
       */}
      <AgentDock />
    </div>
  );
}
