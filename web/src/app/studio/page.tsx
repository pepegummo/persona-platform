"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { RequireAuth } from "@/components/require-auth";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, type PersonaListItem } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";

function PersonaList() {
  const t = useTranslations();
  const api = useApi();
  const [items, setItems] = useState<PersonaListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.GET("/api/personas").then(({ data, error }) => {
      if (cancelled) return;
      if (data) setItems(data);
      else setError(errorMessage(error));
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (error) return <p className="text-destructive">{error}</p>;
  if (!items) return <Skeleton className="h-32 w-full" />;
  if (items.length === 0) {
    return <p className="text-muted-foreground">{t("studio.empty")}</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="truncate">{p.display_name}</span>
              <StatusBadge status={p.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>/p/{p.slug}</span>
              <span>·</span>
              <span>{t("studio.examples", { count: p.example_count })}</span>
              {p.published_version_id && (
                <Badge variant="outline">{t("status.published")}</Badge>
              )}
            </div>
            <div>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/studio/${p.id}`} />}
              >
                {t("studio.open")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function StudioPage() {
  const t = useTranslations("studio");
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button nativeButton={false} render={<Link href="/studio/new" />}>{t("new")}</Button>
      </div>
      <RequireAuth>
        <PersonaList />
      </RequireAuth>
    </main>
  );
}
