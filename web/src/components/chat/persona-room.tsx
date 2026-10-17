"use client";

import { Info, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ChatPanel, type Starter } from "@/components/chat/chat-panel";
import { ReportDialog } from "@/components/chat/report-dialog";
import { PersonaAvatar } from "@/components/persona-avatar";
import { API_URL } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  name: string;
  description: string | null;
  ownerCanReadChats: boolean;
  /** One public example, shown before the first message so visitors hear how this persona talks. */
  sample: { question: string; answer: string } | null;
  starters: Starter[];
};

/** The public persona page: the persona's name on its own coloured wall, then the chat. The wall
 *  shrinks to a single row once the visitor starts talking; the AI label stays in both states. */
export function PersonaRoom({ slug, name, description, ownerCanReadChats, sample, starters }: Props) {
  const t = useTranslations("public");
  const [started, setStarted] = useState(false);
  const base = `${API_URL}/api/public/p/${encodeURIComponent(slug)}`;

  // share_link_opened: sets the visitor cookie and records one open per page view.
  useEffect(() => {
    void fetch(`${base}/open`, { method: "POST", credentials: "include" }).catch(() => undefined);
  }, [base]);

  const intro = (
    <>
      {sample && (
        <figure className="flex flex-col gap-2">
          <figcaption className="text-sm text-[color:var(--room-soft)]">
            {t("sampleTitle", { name })}
          </figcaption>
          <p className="text-[15px] font-medium">“{sample.question}”</p>
          <blockquote className="flex max-w-[90%] items-end gap-2">
            <PersonaAvatar name={name} seed={slug} size="xs" />
            <p className="rounded-[18px_18px_18px_4px] border border-[color:var(--room-line)] bg-[color:var(--room-paper)] px-3.5 py-2.5 text-[15px] whitespace-pre-wrap">
              {sample.answer}
            </p>
          </blockquote>
        </figure>
      )}
      <p className={cn("text-sm font-semibold", sample && "pt-3")}>{t("askTitle", { name })}</p>
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-6 pb-4 sm:px-6 sm:pt-12">
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <h1
            className={cn(
              "font-display font-medium tracking-[-0.01em] text-balance break-words",
              "transition-[font-size] duration-300 ease-out motion-reduce:transition-none",
              started
                ? "text-2xl leading-tight"
                : "text-[clamp(2.25rem,7vw,3.75rem)] leading-[1.15]",
            )}
          >
            {name}
          </h1>
          <p className="flex items-center gap-2">
            <PersonaAvatar name={name} seed={slug} size="xs" />
            {/* Hard rule 5: always visible on every public chat, before and after the wall shrinks */}
            <span
              data-testid="ai-label"
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--room-line)] bg-[color:var(--room-paper)] px-2.5 py-0.5 text-[13px] font-semibold"
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              {t("label", { name })}
            </span>
          </p>
        </div>
        <ReportDialog slug={slug} />
      </header>

      {description && (
        <div
          inert={started}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
            started ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
          )}
        >
          <div className="overflow-hidden">
            <p className="max-w-[60ch] pt-4 text-[17px] text-[color:var(--room-soft)]">
              {description}
            </p>
          </div>
        </div>
      )}

      <ChatPanel
        bare
        fill
        url={`${base}/chat`}
        persona={{ name, seed: slug }}
        starters={starters}
        intro={intro}
        onStart={() => setStarted(true)}
        onReset={() => setStarted(false)}
        className={started ? "mt-4" : "mt-8"}
        footnote={
          <p className="flex items-start gap-1.5 px-1 pt-1 text-xs text-[color:var(--room-soft)]">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {t("notReal")} {ownerCanReadChats ? t("ownerCanRead") : t("ownerCannotRead")}
            </span>
          </p>
        }
      />
    </div>
  );
}
