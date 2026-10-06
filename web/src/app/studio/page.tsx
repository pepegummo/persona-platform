"use client";

import { ArrowRight, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { CopyLinkButton } from "@/components/copy-link-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PersonaAvatar } from "@/components/persona-avatar";
import { RequireAuth } from "@/components/require-auth";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, type PersonaListItem } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { shareUrl } from "@/lib/share";

/** Publishing needs 3 public examples, so 3 examples is the first milestone. */
const MIN_EXAMPLES = 3;

function isLive(p: PersonaListItem): boolean {
  return p.published_version_id !== null && p.visibility !== "private";
}

/** The one thing the creator should do next, or null when the persona is live. */
function nextStep(p: PersonaListItem, t: ReturnType<typeof useTranslations>): string | null {
  if (isLive(p)) return null;
  if (p.example_count < MIN_EXAMPLES) {
    return t("studio.next.examples", { n: MIN_EXAMPLES - p.example_count });
  }
  if (p.status === "compiling") return t("studio.next.compiling");
  if (p.status === "failed") return t("studio.next.failed");
  if (p.status === "draft") return t("studio.next.compile");
  return t("studio.next.publish");
}

function PersonaCard({ p }: { p: PersonaListItem }) {
  const t = useTranslations();
  const live = isLive(p);
  const next = nextStep(p, t);
  const href = `/studio/${p.id}`;
  return (
    <article className="flex flex-col gap-4 rounded-2xl border bg-card p-5 transition-shadow hover:shadow-[0_12px_32px_-20px_rgb(122_62_30/0.35)]">
      <div className="flex items-center gap-3">
        <PersonaAvatar name={p.display_name} seed={p.slug} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">
            <Link href={href} className="outline-none hover:underline focus-visible:underline">
              {p.display_name}
            </Link>
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            /p/{p.slug} · {t("studio.examples", { count: p.example_count })}
          </p>
        </div>
        <StatusBadge status={live ? "published" : p.status} />
      </div>

      {p.description && (
        <p className="line-clamp-2 text-[15px] text-muted-foreground">{p.description}</p>
      )}

      {live ? (
        <p className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <span className="rounded-lg bg-muted px-2.5 py-0.5">{t(`visibility.${p.visibility}`)}</span>
          <span className="rounded-lg bg-muted px-2.5 py-0.5">
            {t("status.version", { n: p.version_number })}
          </span>
        </p>
      ) : (
        next && (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-primary/35 bg-accent/50 px-3 py-2 text-sm text-accent-foreground">
            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
            {next}
          </p>
        )
      )}

      <div className="mt-auto flex gap-2">
        <Button
          className="flex-1"
          variant={live ? "outline" : "default"}
          nativeButton={false}
          render={<Link href={href} />}
        >
          {live ? t("studio.edit") : t("studio.continue")}
        </Button>
        {live && <CopyLinkButton className="flex-1" variant="secondary" url={shareUrl(p.slug)} />}
      </div>
    </article>
  );
}

function NewPersonaTile() {
  const t = useTranslations("studio");
  return (
    <Link
      href="/studio/new"
      className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed font-semibold text-muted-foreground outline-none transition-colors hover:border-primary/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-accent-foreground">
        <Plus className="size-6" aria-hidden="true" />
      </span>
      {t("new")}
    </Link>
  );
}

function PersonaList() {
  const t = useTranslations();
  const api = useApi();
  const [items, setItems] = useState<PersonaListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.GET("/api/personas"), [api]);

  useEffect(() => {
    let cancelled = false;
    void load().then(({ data, error }) => {
      if (cancelled) return;
      if (data) setItems(data);
      else setError(errorMessage(error));
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <p className="font-semibold text-destructive">{t("studio.loadFailed")}</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            setError(null);
            void load().then(({ data, error }) => {
              if (data) setItems(data);
              else setError(errorMessage(error));
            });
          }}
        >
          {t("studio.retry")}
        </Button>
      </div>
    );
  }

  if (!items) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title={t("studio.emptyTitle")}
        description={t("studio.emptyBody")}
        action={
          <Button size="lg" nativeButton={false} render={<Link href="/studio/new" />}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            {t("studio.new")}
          </Button>
        }
      />
    );
  }

  const live = items.filter(isLive).length;
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-muted-foreground">
        {t("studio.subtitle", { count: items.length, live })}
      </p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <PersonaCard key={p.id} p={p} />
        ))}
        <NewPersonaTile />
      </div>
    </div>
  );
}

export default function StudioPage() {
  const t = useTranslations("studio");
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
      <PageHeader
        title={t("title")}
        actions={
          <Button nativeButton={false} render={<Link href="/studio/new" />}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            {t("new")}
          </Button>
        }
      />
      <RequireAuth>
        <PersonaList />
      </RequireAuth>
    </main>
  );
}
