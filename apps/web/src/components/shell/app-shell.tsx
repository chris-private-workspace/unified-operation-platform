import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

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
    </div>
  );
}
