"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatHttpError, streamChat } from "@/lib/api/sse";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string; blocked?: boolean; error?: boolean };

type Props = {
  url: string;
  /** Called per request so auth tokens can rotate. */
  headers?: () => Promise<Record<string, string>>;
  placeholder?: string;
  className?: string;
};

export function ChatPanel({ url, headers, placeholder, className }: Props) {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    const text = input.trim();
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
    }
  }

  function reset() {
    conversationId.current = null;
    setMessages([]);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex min-h-64 max-h-[60vh] flex-col gap-3 overflow-y-auto rounded-lg border p-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
              m.role === "user"
                ? "self-end bg-primary text-primary-foreground"
                : "self-start bg-muted",
              (m.blocked || m.error) && "border border-destructive text-destructive",
            )}
          >
            {m.text || (busy && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={placeholder ?? t("placeholder")}
          rows={2}
          maxLength={4000}
          disabled={busy}
          aria-label={t("placeholder")}
        />
        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={busy || !input.trim()}>
            {busy ? t("sending") : t("send")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy}>
            {t("newChat")}
          </Button>
        </div>
      </form>
    </div>
  );
}
