import { create } from 'zustand';

export type Theme = 'light' | 'dark';
export type Role = 'Regional' | 'RHK IT';

interface UiState {
  theme: Theme;
  role: Role;
  sidebarCollapsed: boolean;
  toggleTheme: () => void;
  setRole: (role: Role) => void;
  toggleSidebar: () => void;
}

/**
 * UI state (design-system.md §3.2): theme / role / sidebar. Server state lives
 * in TanStack Query; this store is purely client-side chrome state.
 * Theme is mirrored onto <html class="dark"> by a subscriber in App.
 */
export const useUiStore = create<UiState>((set) => ({
  theme: 'light',
  role: 'Regional',
  sidebarCollapsed: false,
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  setRole: (role) => set({ role }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
