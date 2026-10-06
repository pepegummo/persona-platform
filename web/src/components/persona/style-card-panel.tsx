"use client";

import { Sparkles, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type StyleCard = {
  summary?: string;
  language?: string;
  length?: string;
  structure?: string[];
  formatting?: string[];
  vocabulary?: string[];
  by_shape?: Record<string, string>;
  avoid?: string[];
  conflicts?: string[];
};

const SHAPES = new Set([
  "comparison",
  "how_to",
  "definition",
  "troubleshooting",
  "opinion",
  "recommendation",
  "casual",
  "other",
]);

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-muted/60 p-4">
      <p className="text-sm font-semibold">{title}</p>
      <div className="text-[15px] text-muted-foreground">{children}</div>
    </div>
  );
}

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <Field title={title}>
      <ul className="list-disc space-y-0.5 pl-5">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </Field>
  );
}

export function StyleCardPanel({
  card,
  fixedCount,
}: {
  card: Record<string, unknown> | null;
  fixedCount: number;
}) {
  const t = useTranslations("persona");
  const ts = useTranslations("shape");
  if (!card) {
    return (
      <EmptyState
        icon={Sparkles}
        title={t("styleCardTab.emptyTitle")}
        description={t("styleCardTab.emptyBody")}
      />
    );
  }
  const c = card as StyleCard;
  return (
    <section className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Sparkles className="size-5 text-primary" aria-hidden="true" />
          {t("compile.styleCard")}
        </h2>
        <Badge variant="outline">{t("compile.fixedExamples", { n: fixedCount })}</Badge>
      </div>
      {c.summary && <p className="text-[17px] leading-relaxed">{c.summary}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {c.language && <Field title={t("compile.language")}>{c.language}</Field>}
        {c.length && <Field title={t("compile.length")}>{c.length}</Field>}
        <List title={t("compile.structure")} items={c.structure} />
        <List title={t("compile.formatting")} items={c.formatting} />
        <List title={t("compile.vocabulary")} items={c.vocabulary} />
        <List title={t("compile.avoid")} items={c.avoid} />
      </div>
      {c.by_shape && Object.keys(c.by_shape).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(c.by_shape).map(([shape, how]) => (
            <Badge key={shape} variant="secondary" title={how}>
              {SHAPES.has(shape) ? ts(shape) : shape}
            </Badge>
          ))}
        </div>
      )}
      {c.conflicts && c.conflicts.length > 0 && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{t("compile.conflicts")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {c.conflicts.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
