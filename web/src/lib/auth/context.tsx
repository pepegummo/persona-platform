"use client";

import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { clerkEnabled, DEFAULT_DEV_USER, DEV_USER_STORAGE_KEY } from "./config";

export type AuthState = {
  mode: "clerk" | "dev";
  isLoaded: boolean;
  isSignedIn: boolean;
  /** Bearer token for the api, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Dev mode only: switch the fake user id. */
  devUser?: string;
  setDevUser?: (id: string) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuthState(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthState must be used inside <AuthProvider>");
  return ctx;
}

function ClerkBridge({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const value = useMemo<AuthState>(
    () => ({
      mode: "clerk",
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      getToken: () => getToken(),
    }),
    [isLoaded, isSignedIn, getToken],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function DevBridge({ children }: { children: React.ReactNode }) {
  const [devUser, setDevUserState] = useState(DEFAULT_DEV_USER);
  const [isLoaded, setLoaded] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(DEV_USER_STORAGE_KEY);
    } catch {
      // storage unavailable
    }
    // Defer state updates out of the effect body (react-hooks/set-state-in-effect).
    const id = window.setTimeout(() => {
      if (stored) setDevUserState(stored);
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const setDevUser = useCallback((id: string) => {
    const clean = id.trim() || DEFAULT_DEV_USER;
    setDevUserState(clean);
    try {
      window.localStorage.setItem(DEV_USER_STORAGE_KEY, clean);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      mode: "dev",
      isLoaded,
      isSignedIn: true,
      getToken: async () => `dev:${devUser}`,
      devUser,
      setDevUser,
    }),
    [isLoaded, devUser, setDevUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (clerkEnabled) {
    return (
      <ClerkProvider>
        <ClerkBridge>{children}</ClerkBridge>
      </ClerkProvider>
    );
  }
  return <DevBridge>{children}</DevBridge>;
}
