"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { PersonaAvatar } from "@/components/persona-avatar";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { displayUrl } from "@/lib/share";
import { cn } from "@/lib/utils";

// Mirrors SLUG_PATTERN in api/app/schemas/persona.py.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const DESCRIPTION_MAX = 1000;

/** Latin names become a slug suggestion; Thai-only names give "" and the server picks one. */
function suggestSlug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return SLUG_RE.test(s) ? s : "";
}

const AFTER_STEPS = ["name", "examples", "test", "publish"] as const;

function CreateForm() {
  const t = useTranslations();
  const api = useApi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");

  const suggested = suggestSlug(displayName);
  const slugInvalid = slug !== "" && !SLUG_RE.test(slug);
  const previewName = displayName.trim() || t("persona.displayName");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (slugInvalid) return;
    setBusy(true);
    const { data, error } = await api.POST("/api/personas", {
      body: {
        display_name: displayName.trim(),
        slug: slug || suggested || null,
        description: description.trim() || null,
      },
    });
    if (data) {
      router.push(`/studio/${data.id}`);
    } else {
      setBusy(false);
      toast.error(errorMessage(error, t("common.error")));
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-8">
      <form
        onSubmit={onSubmit}
        className="flex min-w-0 flex-[999_1_480px] flex-col gap-6 rounded-3xl border bg-card p-6 sm:p-8"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("persona.createTitle")}</h1>
          <p className="mt-1 text-muted-foreground">{t("persona.createSubtitle")}</p>
        </div>

        <div className="flex items-center gap-4">
          <PersonaAvatar name={previewName} seed={slug || suggested || previewName} size="lg" />
          <p className="text-sm text-muted-foreground">{t("persona.avatarHint")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="display_name" className="text-[15px]">
            {t("persona.displayName")}
          </Label>
          <Input
            id="display_name"
            name="display_name"
            required
            maxLength={80}
            autoFocus
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("persona.displayNameHint")}
            aria-describedby="display_name_hint"
          />
          <p id="display_name_hint" className="text-sm text-muted-foreground">
            {t("persona.visitorsSee", { label: t("public.label", { name: previewName }) })}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="slug" className="text-[15px]">
            {t("persona.slug")}{" "}
            <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
          </Label>
          <div
            className={cn(
              "flex h-11 overflow-hidden rounded-lg border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
              slugInvalid && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20",
            )}
          >
            <span className="flex max-w-[55%] items-center truncate bg-muted px-3 text-[15px] text-muted-foreground">
              {displayUrl("")}
            </span>
            <input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
              placeholder={suggested}
              maxLength={40}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={slugInvalid}
              aria-describedby="slug_hint"
              className="min-w-0 flex-1 bg-transparent px-3 text-base outline-none"
            />
          </div>
          <p
            id="slug_hint"
            className={cn("text-sm", slugInvalid ? "text-destructive" : "text-muted-foreground")}
          >
            {slugInvalid ? t("persona.slugInvalid") : t("persona.slugHint")}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description" className="text-[15px]">
            {t("persona.description")}{" "}
            <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
          </Label>
          <Textarea
            id="description"
            name="description"
            maxLength={DESCRIPTION_MAX}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="self-end text-xs text-muted-foreground" aria-live="polite">
            {description.length} / {DESCRIPTION_MAX}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" disabled={busy || slugInvalid || !displayName.trim()}>
            {busy ? t("common.saving") : t("persona.createAndContinue")}
          </Button>
          <Button type="button" size="lg" variant="ghost" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>

      <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-4 py-2">
        <h2 className="font-semibold">{t("persona.after.title")}</h2>
        <ol className="flex flex-col gap-4">
          {AFTER_STEPS.map((key, i) => (
            <li key={key} className="flex gap-3">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span className="leading-snug">
                <span className="block font-semibold">{t(`persona.after.${key}.title`)}</span>
                <span className="text-sm text-muted-foreground">{t(`persona.after.${key}.body`)}</span>
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

export default function NewPersonaPage() {
  const t = useTranslations("common");
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 sm:px-6">
      <Link
        href="/studio"
        className="inline-flex items-center gap-1.5 self-start rounded-md text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("backToStudio")}
      </Link>
      <RequireAuth>
        <CreateForm />
      </RequireAuth>
    </main>
  );
}
