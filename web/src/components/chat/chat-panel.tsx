"use client";

import { ArrowUp, RotateCcw, ShieldAlert, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { PersonaAvatar } from "@/components/persona-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatHttpError, streamChat } from "@/lib/api/sse";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string; blocked?: boolean; error?: boolean };

const STARTERS = ["intro", "strengths", "favorite"] as const;

type Props = {
  url: string;
  /** Called per request so auth tokens can rotate. */
  headers?: () => Promise<Record<string, string>>;
  /** Who is answering: drives the avatar and the empty-state copy. */
  persona: { name: string; seed: string };
  placeholder?: string;
  /** Grow to fill a flex parent instead of using a fixed message-area height. */
  fill?: boolean;
  className?: string;
};

function TypingDots({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1 py-1" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot size-1.5 rounded-full bg-muted-foreground/70"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export function ChatPanel({ url, headers, persona, placeholder, fill = false, className }: Props) {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Scroll the message area only, never the page (the chat may sit below the fold).
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
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
    inputRef.current?.focus();
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border bg-card",
        fill && "min-h-0 flex-1",
        className,
      )}
    >
      {messages.length > 0 && (
        <div className="flex items-center justify-end border-b px-2 py-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy}>
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
          "flex flex-col gap-3 overflow-y-auto overscroll-contain bg-background/40 p-4 sm:p-5",
          fill ? "min-h-64 flex-1" : "h-[min(60dvh,560px)]",
        )}
      >
        {messages.length === 0 ? (
          <div className="m-auto flex max-w-md flex-col items-center gap-4 py-6 text-center">
            <PersonaAvatar name={persona.name} seed={persona.seed} size="md" />
            <div>
              <p className="text-lg font-semibold">{t("emptyTitle", { name: persona.name })}</p>
              <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void send(t(`starters.${key}`))}
                  className="rounded-full border bg-card px-4 py-2 text-sm outline-none transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {t(`starters.${key}`)}
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
                  className="max-w-[85%] self-end whitespace-pre-wrap rounded-[18px_18px_4px_18px] bg-primary px-3.5 py-2.5 text-[15px] text-primary-foreground"
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
                      : "bg-card",
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
        className="flex flex-col gap-1.5 border-t bg-card p-3"
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
            className="max-h-40 min-h-12 resize-none rounded-xl bg-background/60"
          />
          <Button
            type="submit"
            size="icon-lg"
            className="rounded-xl"
            disabled={busy || !input.trim()}
            aria-label={busy ? t("sending") : t("send")}
          >
            <ArrowUp className="size-5" aria-hidden="true" />
          </Button>
        </div>
        <p className="hidden px-1 text-xs text-muted-foreground sm:block">{t("keyHint")}</p>
      </form>
    </div>
  );
}
