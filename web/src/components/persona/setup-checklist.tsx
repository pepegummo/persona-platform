"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ChecklistItem, EditorTab } from "@/lib/persona-progress";
import { cn } from "@/lib/utils";

/**
 * "Before you publish" list: the first unfinished item is highlighted and every item jumps to
 * the tab that completes it. This is the editor's main nudge toward publishing.
 */
export function SetupChecklist({
  items,
  onGo,
  className,
}: {
  items: ChecklistItem[];
  onGo: (tab: EditorTab) => void;
  className?: string;
}) {
  const t = useTranslations("persona.checklist");
  const done = items.filter((i) => i.done).length;
  const pct = Math.round((done / items.length) * 100);
  const current = items.find((i) => !i.done)?.key;

  return (
    <section
      aria-labelledby="checklist-title"
      className={cn("flex flex-col gap-4 rounded-2xl border bg-card p-5", className)}
    >
      <div>
        <h2 id="checklist-title" className="font-semibold">
          {done === items.length ? t("titleDone") : t("title")}
        </h2>
        <div className="mt-1 flex justify-between text-sm text-muted-foreground">
          <span>{t("progress", { done, total: items.length })}</span>
          <span>{pct}%</span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-labelledby="checklist-title"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const isCurrent = item.key === current;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onGo(item.tab)}
                title={t("goTo")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left outline-none transition-colors",
                  "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  isCurrent && "border-primary/30 bg-accent/60 hover:bg-accent",
                )}
              >
                {item.done ? (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-white dark:text-background">
                    <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                  </span>
                ) : (
                  <span
                    className={cn(
                      "size-6 shrink-0 rounded-full border-2",
                      isCurrent ? "border-primary" : "border-input",
                    )}
                    aria-hidden="true"
                  />
                )}
                <span className="flex min-w-0 flex-col leading-snug">
                  <span
                    className={cn(
                      item.done && "text-muted-foreground line-through decoration-muted-foreground/50",
                      isCurrent && "font-semibold",
                    )}
                  >
                    {t(item.key)}
                    <span className="sr-only">{item.done ? " ✓" : ""}</span>
                  </span>
                  {isCurrent && (
                    <span className="text-sm text-accent-foreground">
                      {t(`${item.key}Todo`, item.values ?? {})}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
