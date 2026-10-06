"use client";

import { Check, Circle, ExternalLink, Globe, Link2, PartyPopper } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyLinkButton } from "@/components/copy-link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Persona } from "@/lib/api/client";
import { MIN_PUBLIC_EXAMPLES } from "@/lib/persona-progress";
import { shareUrl } from "@/lib/share";
import { cn } from "@/lib/utils";

type Visibility = Persona["visibility"];

type Props = {
  persona: Persona;
  busy: boolean;
  onPublish: (visibility: Visibility) => Promise<boolean>;
  onUnpublish: () => Promise<boolean>;
};

const VISIBILITY_OPTIONS = [
  { value: "unlisted", icon: Link2 },
  { value: "public", icon: Globe },
] as const;

function Requirement({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5">
      {ok ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-success text-white dark:text-background">
          <Check className="size-3" strokeWidth={3} aria-hidden="true" />
        </span>
      ) : (
        <Circle className="size-5 text-muted-foreground/60" aria-hidden="true" />
      )}
      <span className={cn(!ok && "font-semibold")}>{label}</span>
    </li>
  );
}

export function PublishPanel({ persona, busy, onPublish, onUnpublish }: Props) {
  const t = useTranslations("persona.publish");
  const tv = useTranslations("visibility");
  const [visibility, setVisibility] = useState<Visibility>(
    persona.visibility === "private" ? "unlisted" : persona.visibility,
  );
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const draft = persona.draft;
  const publicCount = draft.examples.filter((e) => !e.is_private).length;
  const compiled = draft.status === "ready";
  const enoughPublic = publicCount >= MIN_PUBLIC_EXAMPLES;
  const canPublish = compiled && enoughPublic && draft.id !== persona.published_version_id;
  const url = shareUrl(persona.slug);
  const isLive = persona.published_version_id !== null && persona.visibility !== "private";
  const shareText = t("shareText", { name: draft.display_name });

  return (
    <div className="flex flex-col gap-6">
      {isLive && (
        <section className="flex flex-col gap-4 rounded-2xl border border-primary/25 bg-accent/40 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <PartyPopper className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">{t("liveTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("live", {
                  v: persona.published?.version_number ?? 0,
                  visibility: tv(persona.visibility),
                })}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="share" className="text-sm font-medium">
              {t("liveBody")}
            </label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="share"
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-[1_1_240px] font-mono text-sm"
              />
              <CopyLinkButton url={url} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a
                  href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              {t("shareLine")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a
                  href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              {t("shareX")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<a href={url} target="_blank" rel="noreferrer"/>}
            >
              <ExternalLink data-icon="inline-start" aria-hidden="true" />
              {t("open")}
            </Button>
          </div>
        </section>
      )}

      <p className="text-sm text-muted-foreground">{t("hint")}</p>

      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
        <h3 className="font-semibold">{t("checklistTitle")}</h3>
        <ul className="flex flex-col gap-2 text-[15px]">
          <Requirement ok={compiled} label={compiled ? t("ready") : t("needCompile")} />
          <Requirement
            ok={enoughPublic}
            label={enoughPublic ? t("publicOk", { n: publicCount }) : t("needPublic", { n: publicCount })}
          />
        </ul>
      </section>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-semibold">{t("visibility")}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {VISIBILITY_OPTIONS.map(({ value, icon: Icon }) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border bg-card p-4 transition-colors",
                "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                visibility === value ? "border-primary bg-accent/40" : "hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="visibility"
                value={value}
                checked={visibility === value}
                onChange={() => setVisibility(value)}
                className="mt-1 size-4 accent-primary"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 font-semibold">
                  <Icon className="size-4" aria-hidden="true" />
                  {tv(value)}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{t("visibilityHint")}</p>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={busy || !canPublish} onClick={() => void onPublish(visibility)}>
          {persona.published_version_id ? t("republish") : t("publish")}
        </Button>
        {persona.published_version_id && (
          <Button
            size="lg"
            variant="ghost"
            disabled={busy}
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmUnpublish(true)}
          >
            {t("unpublish")}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmUnpublish}
        onOpenChange={setConfirmUnpublish}
        title={t("unpublishTitle")}
        description={t("unpublishBody")}
        confirmLabel={t("unpublish")}
        destructive
        onConfirm={() => void onUnpublish()}
      />
    </div>
  );
}
