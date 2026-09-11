"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <ul className="list-disc pl-5 text-sm text-muted-foreground">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

export function StyleCardPanel({
  card,
  fixedCount,
}: {
  card: Record<string, unknown> | null;
  fixedCount: number;
}) {
  const t = useTranslations("persona.compile");
  if (!card) {
    return <p className="text-sm text-muted-foreground">{t("noStyleCard")}</p>;
  }
  const c = card as StyleCard;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t("styleCard")}</span>
          <Badge variant="outline">{t("fixedExamples", { n: fixedCount })}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {c.summary && <p>{c.summary}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {c.language && (
            <div>
              <p className="text-sm font-medium">{t("language")}</p>
              <p className="text-sm text-muted-foreground">{c.language}</p>
            </div>
          )}
          {c.length && (
            <div>
              <p className="text-sm font-medium">{t("length")}</p>
              <p className="text-sm text-muted-foreground">{c.length}</p>
            </div>
          )}
          <List title={t("structure")} items={c.structure} />
          <List title={t("formatting")} items={c.formatting} />
          <List title={t("vocabulary")} items={c.vocabulary} />
          <List title={t("avoid")} items={c.avoid} />
        </div>
        {c.by_shape && Object.keys(c.by_shape).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(c.by_shape).map(([shape, how]) => (
              <Badge key={shape} variant="secondary" title={how}>
                {shape}
              </Badge>
            ))}
          </div>
        )}
        {c.conflicts && c.conflicts.length > 0 && (
          <List title={t("conflicts")} items={c.conflicts} />
        )}
      </CardContent>
    </Card>
  );
}
