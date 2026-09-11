"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

type Status = "draft" | "compiling" | "ready" | "failed";

const variant: Record<Status, "secondary" | "default" | "destructive" | "outline"> = {
  draft: "secondary",
  compiling: "outline",
  ready: "default",
  failed: "destructive",
};

export function StatusBadge({ status }: { status: Status }) {
  const t = useTranslations("status");
  return <Badge variant={variant[status]}>{t(status)}</Badge>;
}
