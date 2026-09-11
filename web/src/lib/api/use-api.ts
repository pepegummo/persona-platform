"use client";

import { useMemo } from "react";

import { useAuthState } from "@/lib/auth/context";

import { makeApiClient } from "./client";

export function useApi() {
  const { getToken } = useAuthState();
  return useMemo(() => makeApiClient(getToken), [getToken]);
}
