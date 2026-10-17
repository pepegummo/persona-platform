"use client";

import { ArrowUp, RotateCcw, ShieldAlert, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { PersonaAvatar } from "@/components/persona-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatHttpError, streamChat } from "@/lib/api/sse";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string; blocked?: boolean; error?: boolean };

/** A suggested first question: `label` is shown on the chip, `text` is what gets sent. */
export type Starter = { label: string; text: string };

const STARTERS = ["intro", "strengths", "favorite"] as const;

// Colours read the persona-room variables (globals.css, [data-room]) and fall back to the site
// theme, so the studio test chat looks as before and the public page takes the persona's colours.
const PAPER = "bg-[color:var(--room-paper,var(--card))]";
const LINE = "border-[color:var(--room-line,var(--border))]";
const TONE =
  "bg-[color:var(--room-tone,var(--primary))] text-[color:var(--room-tone-fg,var(--primary-foreground))]";
const FOCUS = "focus-visible:ring-3 focus-visible:ring-[color:var(--room-tone,var(--ring))]/40";

type Props = {
  url: string;
  /** Called per request so auth tokens can rotate. */
  headers?: () => Promise<Record<string, string>>;
  /** Who is answering: drives the avatar and the empty-state copy. */
  persona: { name: string; seed: string };
  placeholder?: string;
  /** Grow to fill a flex parent instead of using a fixed message-area height. */
  fill?: boolean;
  /** Replace the generic starter questions (e.g. with the persona's public example questions). */
  starters?: Starter[];
  /** Replace the default empty-state heading; rendered above the starters. */
  intro?: ReactNode;
  /** Small print under the input, in place of the keyboard hint. */
  footnote?: ReactNode;
  /** No outer frame: the chat sits directly on its parent's background (public persona page). */
  bare?: boolean;
  onStart?: () => void;
  onReset?: () => void;
  className?: string;
};

function TypingDots({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1 py-1" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot size-1.5 rounded-full bg-current opacity-70"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export function ChatPanel({
  url,
  headers,
  persona,
  placeholder,
  fill = false,
  starters,
  intro,
  footnote,
  bare = false,
  onStart,
  onReset,
  className,
}: Props) {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chips: Starter[] =
    starters && starters.length > 0
      ? starters
      : STARTERS.map((key) => ({ label: t(`starters.${key}`), text: t(`starters.${key}`) }));

  useEffect(() => {
    // Scroll the message area only, never the page (the chat may sit below the fold).
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    onStart?.();
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    const patchLast = (patch: Partial<Msg> | ((prev: Msg) => Msg)) =>
      setMessages((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        next[next.length - 1] = typeof patch === "function" ? patch(last) : { ...last, ...patch };
        return next;
      });
    try {
      const extra = headers ? await headers() : {};
      for await (const ev of streamChat(
        url,
        { message: text, conversation_id: conversationId.current },
        { headers: extra },
      )) {
        if (ev.event === "conversation") conversationId.current = ev.conversation_id;
        else if (ev.event === "delta") patchLast((prev) => ({ ...prev, text: prev.text + ev.text }));
        else if (ev.event === "blocked") patchLast({ text: ev.message, blocked: true });
        else if (ev.event === "error") patchLast({ text: ev.message, error: true });
      }
    } catch (e) {
      const message = e instanceof ChatHttpError ? e.message : t("networkError");
      patchLast({ text: message, error: true });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function reset() {
    conversationId.current = null;
    setMessages([]);
    onReset?.();
    inputRef.current?.focus();
  }

  const started = messages.length > 0;

  return (
    <div
      className={cn(
        "flex flex-col",
        !bare && "overflow-hidden rounded-2xl border bg-card",
        fill && "min-h-0 flex-1",
        className,
      )}
    >
      {started && (
        <div className={cn("flex items-center justify-end", bare ? "py-1" : "border-b px-2 py-1.5")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={busy}
            className={cn(bare && "text-[color:var(--room-soft)] hover:bg-[color:var(--room-paper)]")}
          >
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            {t("newChat")}
          </Button>
        </div>
      )}

      <div
        ref={scroller}
        role="log"
        aria-label={t("messages")}
        aria-live="polite"
        aria-busy={busy}
        className={cn(
          "flex flex-col gap-3 overflow-y-auto overscroll-contain",
          bare ? "py-3" : "bg-background/40 p-4 sm:p-5",
          bare
            ? // Leave room for the site header, the persona row, the input, and its footnote.
              started && "h-[clamp(16rem,calc(100dvh-20rem),40rem)]"
            : fill
              ? "min-h-64 flex-1"
              : "h-[min(60dvh,560px)]",
        )}
      >
        {!started ? (
          <div
            className={cn(
              "flex flex-col gap-4",
              bare ? "pb-2" : "m-auto max-w-md items-center py-6 text-center",
            )}
          >
            {intro ?? (
              <>
                <PersonaAvatar name={persona.name} seed={persona.seed} size="md" />
                <div>
                  <p className="text-lg font-semibold">{t("emptyTitle", { name: persona.name })}</p>
                  <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
                </div>
              </>
            )}
            <div className={cn("flex flex-wrap gap-2", !bare && "justify-center")}>
              {chips.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => void send(s.text)}
                  title={s.label === s.text ? undefined : s.text}
                  className={cn(
                    "rounded-full border px-4 py-2 text-left text-sm outline-none transition-colors",
                    "hover:border-[color:var(--room-tone,var(--primary))]/50",
                    PAPER,
                    LINE,
                    FOCUS,
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            if (m.role === "user") {
              return (
                <p
                  key={i}
                  className={cn(
                    "max-w-[85%] self-end whitespace-pre-wrap rounded-[18px_18px_4px_18px] px-3.5 py-2.5 text-[15px]",
                    TONE,
                  )}
                >
                  <span className="sr-only">{t("you")}: </span>
                  {m.text}
                </p>
              );
            }
            const problem = m.blocked || m.error;
            return (
              <div key={i} className="flex max-w-[90%] items-end gap-2 self-start">
                <PersonaAvatar name={persona.name} seed={persona.seed} size="xs" />
                <div
                  className={cn(
                    "rounded-[18px_18px_18px_4px] border px-3.5 py-2.5 text-[15px] whitespace-pre-wrap",
                    problem
                      ? "flex gap-2 border-destructive/30 bg-destructive/5 text-destructive"
                      : [PAPER, LINE],
                  )}
                >
                  {m.blocked && <ShieldAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />}
                  {m.error && <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />}
                  <span className="sr-only">{persona.name}: </span>
                  {m.text ||
                    (busy && isLast ? <TypingDots label={t("typing", { name: persona.name })} /> : null)}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        className={cn("flex flex-col gap-1.5", bare ? "pt-2 pb-1" : "border-t bg-card p-3")}
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder={placeholder ?? t("placeholderShort")}
            rows={1}
            maxLength={4000}
            aria-label={t("placeholder")}
            className={cn(
              "max-h-40 min-h-12 resize-none rounded-xl",
              bare
                ? [
                    PAPER,
                    LINE,
                    "text-[15px] placeholder:text-[color:var(--room-soft)]",
                    "focus-visible:border-[color:var(--room-tone)] focus-visible:ring-[color:var(--room-tone)]/30",
                  ]
                : "bg-background/60",
            )}
          />
          <Button
            type="submit"
            size="icon-lg"
            className={cn("rounded-xl", bare && [TONE, "hover:opacity-90", FOCUS])}
            disabled={busy || !input.trim()}
            aria-label={busy ? t("sending") : t("send")}
          >
            <ArrowUp className="size-5" aria-hidden="true" />
          </Button>
        </div>
        {footnote ?? (
          <p className="hidden px-1 text-xs text-muted-foreground sm:block">{t("keyHint")}</p>
        )}
      </form>
    </div>
  );
}
