"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status = "draft" | "compiling" | "ready" | "failed" | "published";

const STYLE: Record<Status, { variant: "muted" | "accent" | "info" | "destructive" | "success"; dot: string }> = {
  draft: { variant: "muted", dot: "bg-muted-foreground/60" },
  compiling: { variant: "accent", dot: "bg-primary motion-safe:animate-pulse" },
  ready: { variant: "info", dot: "bg-info" },
  failed: { variant: "destructive", dot: "bg-destructive" },
  published: { variant: "success", dot: "bg-success" },
};

/** Status chip with a coloured dot, so state is not told by colour of the text alone. */
export function StatusBadge({ status }: { status: Status }) {
  const t = useTranslations("status");
  const s = STYLE[status];
  return (
    <Badge variant={s.variant}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden="true" />
      {t(status)}
    </Badge>
  );
}
