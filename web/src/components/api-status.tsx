"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("health");
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
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-2 text-sm">
      <p className="text-muted-foreground">{t("label")}</p>
      <p className="font-mono" data-testid="api-status">
        {state.kind === "loading" && "…"}
        {state.kind === "ok" && "ok"}
        {state.kind === "degraded" &&
          `degraded (db: ${state.health.db}, redis: ${state.health.redis})`}
        {state.kind === "unreachable" && "unreachable"}
      </p>
      <Button variant="ghost" size="sm" onClick={() => void refresh()}>
        {t("refresh")}
      </Button>
    </div>
  );
}
