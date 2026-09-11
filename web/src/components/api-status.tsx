"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getHealth, type Health } from "@/lib/api/client";

type State =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "degraded"; health: Extract<Health, { status: "degraded" }> }
  | { kind: "unreachable" };

async function load(): Promise<State> {
  try {
    const health = await getHealth();
    return health.status === "ok" ? { kind: "ok" } : { kind: "degraded", health };
  } catch {
    return { kind: "unreachable" };
  }
}

export function ApiStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setState({ kind: "loading" });
    setState(await load());
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">API status / สถานะ API</p>
      <p className="font-mono" data-testid="api-status">
        {state.kind === "loading" && "…"}
        {state.kind === "ok" && "ok"}
        {state.kind === "degraded" &&
          `degraded (db: ${state.health.db}, redis: ${state.health.redis})`}
        {state.kind === "unreachable" && "unreachable"}
      </p>
      <Button variant="outline" size="sm" onClick={() => void refresh()}>
        Refresh / รีเฟรช
      </Button>
    </div>
  );
}
