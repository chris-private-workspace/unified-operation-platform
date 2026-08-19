import { create } from 'zustand';

export type Theme = 'light' | 'dark';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  dockOpen: boolean;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  toggleDock: () => void;
  setDockOpen: (open: boolean) => void;
}

/**
 * UI state (design-system.md §3.2): theme / sidebar / agent dock. Server state
 * lives in TanStack Query; this store is purely client-side chrome state. Theme is
 * mirrored onto <html class="dark"> by a subscriber in App. (Role is no longer a
 * fake UI toggle — the real backend role comes from GET /me via use-current-user,
 * AUTH-3b.)
 *
 * 🔴 W49 `F2` — `dockOpen` lives HERE and not in the dock component, and that is
 * the whole of what "the open state persists" means in this codebase: the shell
 * survives route changes, so a panel whose state sits in the store stays open
 * while somebody walks from Requests to a request to Drift.
 *
 * ⚠️ Deliberately NOT persisted to localStorage. `theme` and `sidebarCollapsed`
 * are not either, and a dock that alone came back after a refresh would be the
 * odd one out — a person who reloads gets a clean shell, consistently.
 */
export const useUiStore = create<UiState>((set) => ({
  theme: 'light',
  sidebarCollapsed: false,
  dockOpen: false,
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleDock: () => set((s) => ({ dockOpen: !s.dockOpen })),
  setDockOpen: (dockOpen) => set({ dockOpen }),
}));
