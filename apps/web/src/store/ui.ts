import { create } from 'zustand';

export type Theme = 'light' | 'dark';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  toggleTheme: () => void;
  toggleSidebar: () => void;
}

/**
 * UI state (design-system.md §3.2): theme / sidebar. Server state lives in
 * TanStack Query; this store is purely client-side chrome state. Theme is mirrored
 * onto <html class="dark"> by a subscriber in App. (Role is no longer a fake UI
 * toggle — the real backend role comes from GET /me via use-current-user, AUTH-3b.)
 */
export const useUiStore = create<UiState>((set) => ({
  theme: 'light',
  sidebarCollapsed: false,
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
