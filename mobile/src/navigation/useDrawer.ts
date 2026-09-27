/**
 * Aught2 Pickleball — Drawer Store (Zustand)
 *
 * Global open/close state for the slide-out navigation drawer.
 * Separate from auth/app state to keep concerns isolated.
 */

import { create } from 'zustand';

interface DrawerState {
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

export const useDrawerStore = create<DrawerState>((set) => ({
  isOpen: false,
  openDrawer: () => set({ isOpen: true }),
  closeDrawer: () => set({ isOpen: false }),
  toggleDrawer: () => set((s) => ({ isOpen: !s.isOpen })),
}));
