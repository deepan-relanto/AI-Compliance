"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "./types";

interface AuthState {
  user: AuthUser | null;
  isHydrated: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isHydrated: false,
      setHydrated: () => set({ isHydrated: true }),
      setUser: (user) => set({ user }),
      logout: () => {
        set({ user: null });
        useAuthStore.persist.clearStorage();
      },
    }),
    {
      name: "compliance-agent-auth",
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
